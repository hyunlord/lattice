import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';
import { observeRepository } from '../bin/observation.mjs';
import { digest } from '../bin/storage.mjs';
import { canonicalJson, createGraph } from '../dist/index.js';

function fixture(t, lens) {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-build-ownership-')));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const root = join(directory, 'source'); mkdirSync(root);
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, 'data.json'), JSON.stringify([{ id: 'record', name: 'Record', operations: ['trim'], targetId: 'missing' }]));
    writeFileSync(join(root, 'Processor.cs'), 'class Processor { void Apply(string operation) { switch (operation) { case "trim": Trim(); break; } } void Trim() {} }');
    if (lens) {
        mkdirSync(join(root, '.lattice'));
        writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify(lens));
    }
    return { root, cacheDir: join(directory, 'cache'), ...(!lens ? { noLens: true } : {}) };
}
function config() {
    return {
        schemaVersion: 1, name: 'Ownership', kinds: [{ id: 'record', label: 'Records', files: ['data.json'] }],
        synthetics: [{ id: 'hub', kind: 'hub', name: 'Hub', attributes: { shared: [{ path: ['name'], label: 'Name' }] } }],
        derived: [{ id: 'value', scope: 'node', value: { op: 'literal', value: { nested: ['value'] } } }],
        facets: [{ id: 'value', key: 'value', value: { op: 'get', from: 'vars', path: ['value'] } }],
        codeLinks: [{ id: 'dispatch', query: { kinds: ['record'] }, values: { op: 'get', from: 'node', path: ['operations'] }, language: 'csharp', files: ['Processor.cs'], selectors: [{ kind: 'switch-case', within: 'Apply', expression: 'operation' }] }],
        views: [{ id: 'cards', label: 'Cards', type: 'gallery', edgeKinds: ['reference'], columns: [{ id: 'name', label: 'Name', value: { op: 'get', from: 'node', path: ['name'] } }] }, { id: 'matrix', label: 'Matrix', type: 'matrix', edgeKinds: ['reference'] }],
        presentation: { detail: { summaryFields: [{ path: ['name'], label: 'Name' }] } },
    };
}
function draft(graph) {
    const { schemaVersion: _schema, hash: _hash, nodes, ...rest } = graph;
    return { ...rest, nodes: nodes.map(({ contentHash: _hash, ...node }) => node) };
}
function deeplyFrozen(value) {
    if (value && typeof value === 'object') {
        assert.equal(Object.isFrozen(value), true);
        for (const child of Object.values(value)) deeplyFrozen(child);
    }
}
test('real CLI builds retain exact public graph semantics on cold and extraction-cache-hit paths', t => {
    for (const lens of [undefined, config()]) {
        const options = fixture(t, lens), observed = observeRepository(options);
        const first = buildRepository(options, undefined, observed);
        const second = buildRepository(options, undefined, observed);
        assert.ok(first.extraction.stats.parsed > 0);
        assert.ok(second.extraction.stats.reused > 0);
        assert.equal(canonicalJson(first.graph), canonicalJson(second.graph));
        assert.deepEqual(first.graph, createGraph(draft(first.graph), digest));
        deeplyFrozen(first.graph);
        for (const selected of observed.selected) assert.equal(Object.isFrozen(selected.input), false);
    }
});
test('parsed Lens provenance and shared presentation aliases remain caller-owned after repeated builds', t => {
    const options = fixture(t, config()), observed = observeRepository(options), lens = observed.lens;
    assert.ok(lens);
    lens.config.synthetics[0].attributes.shared = lens.config.presentation.detail.summaryFields;
    const before = structuredClone(lens), build = buildRepository(options, undefined, observed);
    const graphBefore = canonicalJson(build.graph);
    assert.deepEqual(lens, before);
    assert.ok(lens.derived.node.some(rule => rule.dependencies instanceof Map));
    assert.ok(build.graph.facets.some(facet => facet.key === 'codeSupport:dispatch'));
    assert.equal(buildRepository(options, undefined, observed).graph.hash, build.graph.hash);
    lens.config.synthetics[0].attributes.shared.push('caller');
    lens.derived.node.find(rule => rule.type === 'derived').source.line += 1;
    lens.codeLinks[0].sources[0].line += 1;
    lens.config.views[0].edgeKinds.push('caller');
    build.presentation.detail.summaryFields.push('output');
    assert.equal(canonicalJson(build.graph), graphBefore);
    deeplyFrozen(build.graph);
});
test('external and returned diagnostic sources never become aliases of frozen graph provenance', t => {
    const options = fixture(t), observed = observeRepository(options);
    const input = observed.selected.find(selection => selection.path === 'data.json').input;
    const external = { code: 'unresolved-reference', message: 'External diagnostic', source: { path: input.path, line: 1, pointer: '/0/targetId', contentHash: input.contentHash } };
    observed.graft = { diagnostic: external };
    const build = buildRepository(options, undefined, observed), graphBefore = canonicalJson(build.graph);
    const returned = build.diagnostics.find(value => value.message === external.message);
    assert.ok(returned?.source);
    assert.ok(build.graph.findings.some(finding => finding.sources.some(source => source.pointer === external.source.pointer)));
    external.source.line = 5; returned.source.line = 7;
    assert.equal(canonicalJson(build.graph), graphBefore);
    deeplyFrozen(build.graph);
});
test('invalid graph provenance still rejects without freezing a caller Lens', t => {
    const options = fixture(t, config()), observed = observeRepository(options);
    const input = observed.selected.find(selection => selection.path === 'data.json').input;
    const source = { path: input.path, line: 1, pointer: '/0/targetId', contentHash: 'invalid' };
    observed.graft = { diagnostic: { code: 'unresolved-reference', message: 'Invalid provenance', source } };
    assert.throws(() => buildRepository(options, undefined, observed), /SHA-256|digest/u);
    source.contentHash = input.contentHash;
    assert.equal(Object.isFrozen(observed.lens.config), false);
});
test('borrowed Lens accessors and prototypes are rejected rather than normalized by ownership transfer', t => {
    for (const decorate of [
        value => { const shared = value.shared; Object.defineProperty(value, 'shared', { enumerable: true, get: () => shared }); },
        value => Object.setPrototypeOf(value, { inherited: true }),
    ]) {
        const options = fixture(t, config()), observed = observeRepository(options);
        const value = observed.lens.config.synthetics[0].attributes;
        decorate(value);
        assert.throws(() => buildRepository(options, undefined, observed), /enumerable data property|plain JSON/u);
    }
});
test('borrowed diagnostic Source accessors are rejected rather than normalized', t => {
    const options = fixture(t), observed = observeRepository(options);
    const input = observed.selected.find(selection => selection.path === 'data.json').input;
    const source = { path: input.path, line: 1, pointer: '/0/targetId', contentHash: input.contentHash };
    Object.defineProperty(source, 'line', { enumerable: true, get: () => 1 });
    observed.graft = { diagnostic: { code: 'unresolved-reference', message: 'Accessor source', source } };
    assert.throws(() => buildRepository(options, undefined, observed), /enumerable data property/u);
});
test('malformed extraction records retain cache discard and graph-validation behavior', t => {
    const options = fixture(t), observed = observeRepository(options);
    const first = buildRepository(options, undefined, observed);
    const entry = first.extraction.manifest.find(value => value.path === 'data.json' && value.format === 'json');
    assert.ok(entry);
    const path = join(options.cacheDir, 'extractions', `${entry.key}.json`);
    const original = readFileSync(path, 'utf8');
    const malformed = JSON.parse(original);
    malformed.value[0].node.kind = 17;
    malformed.valueHash = digest(canonicalJson(malformed.value));
    writeFileSync(path, JSON.stringify(malformed));
    const repaired = buildRepository(options, undefined, observed);
    assert.equal(repaired.extraction.stats.discarded, 1);
    assert.equal(canonicalJson(repaired.graph), canonicalJson(first.graph));
    const invalidSource = JSON.parse(original);
    invalidSource.value[0].node.sources[0].contentHash = 'invalid';
    invalidSource.valueHash = digest(canonicalJson(invalidSource.value));
    writeFileSync(path, JSON.stringify(invalidSource));
    assert.throws(() => buildRepository(options, undefined, observed), /SHA-256|digest/u);
});
test('supplied input diagnostics preserve borrowed source ownership and accessor rejection', t => {
    const options = fixture(t), observed = observeRepository(options);
    const input = observed.selected.find(selection => selection.path === 'data.json').input;
    const source = { path: input.path, line: 1, pointer: '/0/targetId', contentHash: input.contentHash };
    observed.inputDiagnostics.push({ code: 'unresolved-reference', path: input.path, line: 1, bytes: 0, message: 'Borrowed input diagnostic', source });
    const build = buildRepository(options, undefined, observed), serialized = canonicalJson(build.graph);
    source.line = 2;
    assert.equal(canonicalJson(build.graph), serialized);
    Object.defineProperty(source, 'line', { enumerable: true, get: () => 1 });
    assert.throws(() => buildRepository(options, undefined, observed), /enumerable data property/u);
});
test('ignored diagnostic extras retain identity without reading or normalizing them', t => {
    const options = fixture(t), observed = observeRepository(options);
    const ignored = { code: 'oversized-input', path: 'omitted.txt', line: 1, bytes: 1, message: 'Ignored by findings', callback: () => 1, custom: Object.create({ inherited: true }) };
    Object.defineProperty(ignored, 'source', { enumerable: true, get: () => { throw new Error('Ignored source must not be read'); } });
    observed.inputDiagnostics.push(ignored);
    const build = buildRepository(options, undefined, observed);
    assert.equal(build.diagnostics.find(value => value.message === ignored.message), ignored);
    assert.equal(build.presentation.inputDiagnostics[0], ignored);
    assert.equal(ignored.callback(), 1);
    assert.equal(Object.isFrozen(ignored), false);
});
test('borrowed findings retain canonical rejection before copying and source validation afterward', t => {
    const changes = [
        source => Object.defineProperty(source, 'line', { enumerable: true, get: () => 1 }),
        source => Object.setPrototypeOf(source, { inherited: true }),
        source => { source[Symbol('extra')] = true; },
        source => Object.defineProperty(source, 'hidden', { value: true }),
        source => Object.defineProperty(source, 'constructor', { enumerable: true, value: 'unsafe' }),
        source => { source.extra = {}; source.extra.self = source.extra; },
        source => { source.contentHash = 'invalid'; },
        source => { source.line = 0; },
    ];
    for (const change of changes) {
        const options = fixture(t), observed = observeRepository(options);
        const input = observed.selected.find(selection => selection.path === 'data.json').input;
        const source = { path: input.path, line: 1, pointer: '/0/targetId', contentHash: input.contentHash };
        change(source);
        observed.inputDiagnostics.push({ code: 'unresolved-reference', message: 'Invalid borrowed provenance', source });
        assert.throws(() => buildRepository(options, undefined, observed), { name: 'GraphInputError' });
    }
});
test('local returned diagnostic provenance stays independently mutable after ownership transfer', t => {
    const options = fixture(t), build = buildRepository(options), before = canonicalJson(build.graph);
    const diagnostic = build.diagnostics.find(value => value.source);
    assert.ok(diagnostic);
    diagnostic.source.line = 17;
    assert.equal(canonicalJson(build.graph), before);
});
test('nested diagnostic reference values retain canonical rejection', t => {
    for (const decorate of [
        value => Object.setPrototypeOf(value, { inherited: true }),
        value => Object.defineProperty(value, 'label', { enumerable: true, get: () => 'reference' }),
        value => { value[Symbol('hidden')] = 'reference'; },
    ]) {
        const options = fixture(t), observed = observeRepository(options);
        const input = observed.selected.find(selection => selection.path === 'data.json').input;
        const value = { label: 'reference' }; decorate(value);
        observed.inputDiagnostics.push({ code: 'unresolved-reference', message: 'Nested reference', value: { nested: value }, source: { path: input.path, line: 1, pointer: '/0/targetId', contentHash: input.contentHash } });
        assert.throws(() => buildRepository(options, undefined, observed), { name: 'GraphInputError' });
    }
});
