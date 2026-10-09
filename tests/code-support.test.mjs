import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const config = () => ({
    schemaVersion: 1, name: 'Document processing support', kinds: [],
    derived: [
        { id: 'classification', scope: 'node', value: { op: 'at', object: { op: 'codeSupport', rule: 'dispatch' }, key: 'status' } },
        { id: 'operations', scope: 'node', value: get('node', 'operations') },
    ],
    codeLinks: [{ id: 'dispatch', query: {}, values: get('vars', 'operations'), language: 'csharp', files: ['src/*.cs'], selectors: [{ kind: 'switch-case', within: 'Apply', expression: 'operation' }] }],
    findings: [{ id: 'supported', query: {}, severity: 'error', basis: 'source-support', metrics: { supported: { op: 'count', value: { op: 'filter', input: get('vars', 'targetValues'), where: { op: 'eq', left: get('item', 'derived', 'classification'), right: 'supported' } } } }, gate: { metric: 'supported', comparator: 'eq', threshold: 1 }, template: '{supported} supported' }],
});
const code = input('src/Processor.cs', 'class Processor { void Apply(string operation) { switch (operation) { case "trim": Trim(); break; default: break; } } }');
const records = extractJson(input('data.json', [{ id: 'document', operations: ['trim'] }]));

test('code evidence feeds forward derived classification and a persisted finding gate', () => {
    // Given a declaration that reads support before its values dependency is declared.
    const source = input('.lattice/lens.json', config());
    // When actual C# dispatch evidence is interpreted.
    const result = applyLens(records, parseLens(source), source, { codeInputs: [code], sourceLink: value => ({ ...value, revision: 'abc' }) });
    // Then expressions and persisted facets agree and retain code/data/lens evidence.
    assert.equal(result.facets[0].key, 'codeSupport:dispatch');
    assert.equal(result.facets[0].value.status, 'supported');
    assert.equal(result.findings[0].gate.status, 'pass');
    assert.ok(result.facets[0].sources.some(value => value.path === code.path && value.revision === 'abc'));
    assert.ok(result.facets[0].sources.some(value => value.path === 'data.json'));
    assert.ok(result.facets[0].sources.some(value => value.path === source.path));
});

test('missing required source remains unknown and fails the support finding gate', () => {
    // Given the same lens without an observed dispatch surface.
    const source = input('.lattice/lens.json', config());
    // When interpreted, then missing evidence cannot establish support.
    const result = applyLens(records, parseLens(source), source);
    assert.equal(result.facets[0].value.status, 'unknown');
    assert.equal(result.findings[0].gate.status, 'fail');
});

test('combined code-link and derived dependency cycles fail at the lens source', () => {
    // Given support values depending on their own classification.
    const definition = config(); definition.codeLinks[0].values = get('vars', 'classification');
    const source = input('.lattice/lens.json', definition);
    // When compiled, then the cycle names both declarations.
    assert.throws(() => parseLens(source), error => error.name === 'DataInputError' && /cycle/u.test(error.reason) && /dispatch/u.test(error.reason) && /classification/u.test(error.reason));
});

test('positive evidence survives partial coverage while a complete negative remains unsupported', () => {
    // Given an additional unresolved dispatch path and a complete single-path rule.
    const partial = config(); partial.codeLinks[0].selectors.push({ kind: 'call-argument', within: 'Alternate', callee: 'Handlers', argumentIndex: 0 });
    const cases = [
        { definition: partial, operations: ['trim'], status: 'supported', coverage: 'partial' },
        { definition: partial, operations: ['fold'], status: 'unknown', coverage: 'partial' },
        { definition: config(), operations: ['trim', 'fold'], status: 'unsupported', coverage: 'complete' },
        { definition: config(), operations: [], status: 'unknown', coverage: 'partial' },
    ];
    // When each source contract is evaluated against the real parser.
    const results = cases.map(scenario => {
        const source = input('.lattice/lens.json', scenario.definition);
        const data = extractJson(input('data.json', { id: 'document', operations: scenario.operations }));
        return applyLens(data, parseLens(source), source, { codeInputs: [code] }).facets[0].value;
    });
    // Then each result distinguishes missing coverage from a parsed negative.
    assert.deepEqual(results.map(result => [result.status, result.coverage]), cases.map(scenario => [scenario.status, scenario.coverage]));
    assert.ok(results[0].diagnostics.some(value => value.selector === 1));
});
