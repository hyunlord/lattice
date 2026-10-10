import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lattice from '../dist/index.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const source = (pointer = '', path = 'data.json', line = 1, endLine = line) => ({ path, pointer, line, endLine, contentHash: 'source' });
const node = (id, layer, sources = [source(`/${id}`)], kind = 'record') => ({ id, kind, name: id, attributes: layer === null ? {} : { layer }, sources });
const edge = (id, from, to) => ({ id, kind: 'references', source: from, target: to, directed: true, field: '', sources: [source(`/edges/${id}`)] });
const find = (findings, rule, layer) => findings.find(item => item.ruleId === `auto:${rule}` && item.metrics.layer === layer);

test('automatic findings count layer-local incident edges once and retain exact evidence', () => {
    const nodes = [node('a', 'runtime'), node('b', 'runtime'), node('c', 'runtime'), node('d', 'designed'), node('e', null)];
    const edges = [edge('ab', 'a', 'b'), edge('ab', 'a', 'b'), edge('aa', 'a', 'a'), edge('ad', 'a', 'd')];
    assert.equal(typeof lattice.automaticFindings, 'function');
    const findings = lattice.automaticFindings(nodes, edges, [], digest);
    assert.deepEqual(find(findings, 'isolated-nodes', 'runtime').targetIds, ['c']);
    assert.deepEqual(find(findings, 'isolated-nodes', 'designed').targetIds, ['d']);
    assert.deepEqual(find(findings, 'isolated-nodes', null).targetIds, ['e']);
    const hubs = find(findings, 'highest-degree-hubs', 'runtime');
    assert.deepEqual(hubs.metrics.degrees, [{ nodeId: 'a', degree: 2 }, { nodeId: 'b', degree: 1 }]);
    assert.deepEqual(hubs.metrics.edgeIds, ['aa', 'ab']);
    assert.ok(hubs.sources.some(item => item.pointer === '/edges/aa'));
    assert.ok(!hubs.sources.some(item => item.pointer === '/edges/ad'));
    assert.ok(findings.every(item => item.basis === 'computed' && item.gate === undefined));
});

test('broken references attach to closest source owners, never unrelated siblings or external diagnostics', () => {
    const nodes = [node('file', null, [source('')], 'file'), node('one', 'runtime', [source('/items/1')]), node('ten', 'designed', [source('/items/10')])];
    const diagnostics = [
        { code: 'unresolved-reference', value: 'missing', source: source('/items/1/ref') },
        { code: 'broken-link', target: './gone', source: source('/unowned') },
        { code: 'external-reference', value: 'external', source: source('/items/10/ref') },
        { code: 'external-or-unresolved-module', specifier: 'pkg', source: source('/items/10/ref') },
        { code: 'graft-stale', message: 'old graph', source: source('/items/10/ref') },
        { code: 'duplicate-id', value: 'one', source: source('/items/1') },
        { code: 'broken-link', target: './unknown' },
    ];
    const findings = lattice.automaticFindings(nodes, [], diagnostics, digest);
    const broken = find(findings, 'broken-references', 'runtime');
    assert.deepEqual(broken.targetIds, ['one']);
    assert.equal(broken.metrics.count, 1);
    assert.equal(broken.severity, 'warning');
    assert.deepEqual(broken.sources, [source('/items/1/ref')]);
    assert.deepEqual(find(findings, 'broken-references', null).targetIds, ['file']);
    assert.equal(find(findings, 'broken-references', 'designed'), undefined);
});

test('pointerless code diagnostics choose the smallest containing source span', () => {
    const nodes = [node('module', null, [source('', 'a.ts', 1, 100)], 'module'), node('fn', null, [source('', 'a.ts', 20, 30)], 'symbol')];
    const findings = lattice.automaticFindings(nodes, [], [{ code: 'unresolved-local-module', specifier: './missing', source: source('', 'a.ts', 24) }], digest);
    assert.deepEqual(find(findings, 'broken-references', null).targetIds, ['fn']);
});

test('automatic findings remain deterministic under input order and rank only ten nonzero hubs', () => {
    const nodes = Array.from({ length: 12 }, (_, index) => node(String(index).padStart(2, '0'), null));
    const edges = nodes.slice(1).map(item => edge(item.id, '00', item.id));
    const diagnostics = [{ code: 'invalid-link', target: '%', source: source('/00/link') }];
    const findings = lattice.automaticFindings(nodes, edges, diagnostics, digest);
    assert.deepEqual(findings, lattice.automaticFindings([...nodes].reverse(), [...edges].reverse(), [...diagnostics].reverse(), digest));
    const hubs = find(findings, 'highest-degree-hubs', null);
    assert.equal(hubs.targetIds.length, 10);
    assert.equal(hubs.metrics.count, 10);
    assert.equal(hubs.metrics.numberOfHubs, 12);
    assert.equal(hubs.metrics.degrees[0].degree, 11);
    assert.deepEqual(hubs.targetIds, nodes.slice(0, 10).map(item => item.id));
    const changed = lattice.automaticFindings([...nodes, node('extra', null)], edges, diagnostics, digest);
    assert.equal(hubs.id, find(changed, 'highest-degree-hubs', null).id);
    assert.ok(hubs.id.startsWith('automatic:'));
});

test('diagnostic ownership indexes source paths and exact pointer ancestors instead of rescanning every record', () => {
    let pointerReads = 0;
    const nodes = Array.from({ length: 300 }, (_, index) => node(`row-${index}`, null, [new Proxy(source(`/rows/${index}`), { get(target, key, receiver) { if (key === "pointer") pointerReads++; return Reflect.get(target, key, receiver); } })]));
    const diagnostics = nodes.map((_, index) => ({ code: 'unresolved-reference', value: `missing-${index}`, source: source(`/rows/${index}/targetId`) }));
    const findings = lattice.automaticFindings(nodes, [], diagnostics, digest);
    assert.equal(find(findings, 'broken-references', null).targetIds.length, 300);
    assert.ok(pointerReads < 5000, `ownership read ${pointerReads} record pointers for 300 diagnostics`);
});
