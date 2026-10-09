import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value, null, 2); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = id => ({ op: 'get', from: 'vars', path: [id] });
const lensInput = derived => input('.lattice/lens.json', { schemaVersion: 1, name: 'Derived dependencies', kinds: [], derived, facets: [{ id: 'result', key: 'result', value: get('result') }] });

test('derived expressions resolve forward graph and node dependencies with lexical let bindings independent of declaration order', () => {
    // Given graph values, node values, local shadowing and a literal that resembles an expression.
    const derived = [
        { id: 'result', scope: 'node', kinds: ['unit'], layer: 'planned', value: get('middle') },
        { id: 'middle', scope: 'node', kinds: ['unit'], layer: 'planned', value: { op: 'let', bindings: { result: get('base'), local: get('result') }, value: get('local') } },
        { id: 'unused', scope: 'node', value: { op: 'literal', value: get('undeclared') } },
        { id: 'base', scope: 'graph', value: get('constant') },
        { id: 'constant', scope: 'graph', value: 42 },
    ];
    const records = extractJson(input('data.json', [{ id: 'a', kind: 'unit', layer: 'planned' }, { id: 'b', kind: 'unit', layer: 'runtime' }, { id: 'c', kind: 'other', layer: 'planned' }])).map(record => ({ ...record, node: { ...record.node, kind: record.node.attributes.kind } }));
    const evaluate = definitions => { const source = lensInput(definitions); return applyLens(records, parseLens(source), source).facets.map(facet => [facet.nodeId, facet.value]); };
    // When equivalent declarations arrive in different orders.
    const actual = [evaluate(derived), evaluate([...derived].reverse())];
    // Then both resolve the same chain while retaining kind/layer applicability.
    assert.deepEqual(actual, [[['planned:a', 42], ['planned:c', null], ['runtime:b', null]], [['planned:a', 42], ['planned:c', null], ['runtime:b', null]]]);
});

test('invalid derived dependencies fail lens parsing at the responsible source location', () => {
    const scenarios = [
        { derived: [{ id: 'a', scope: 'node', value: 1 }, { id: 'a', scope: 'node', value: 2 }], pointer: '/derived/1/id', reason: /Duplicate derived ID a/u },
        { derived: [{ id: 'a', scope: 'node', value: get('b') }, { id: 'b', scope: 'node', value: get('a') }], pointer: '/derived/1/value/path/0', reason: /Derived dependency cycle: a -> b -> a/u },
        { derived: [{ id: 'a', scope: 'graph', value: get('b') }, { id: 'b', scope: 'node', value: 1 }], pointer: '/derived/0/value/path/0', reason: /Graph derived a cannot depend on node derived b/u },
    ];
    for (const scenario of scenarios) {
        // Given an invalid declaration with an exact source field.
        const source = lensInput(scenario.derived);
        const location = extractJson(source)[0].fields[scenario.pointer];
        // When parsed, then the diagnostic identifies its actual source and dependency failure.
        assert.throws(() => parseLens(source), error => {
            assert.equal(error.name, 'DataInputError');
            assert.equal(error.path, source.path);
            assert.equal(error.line, location.line);
            assert.ok(error.reason.startsWith(`${scenario.pointer}: `));
            assert.match(error.reason, scenario.reason);
            return true;
        });
    }
});
