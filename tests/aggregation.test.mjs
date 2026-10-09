import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';
import { evaluate } from '../dist/lens/runtime.js';

const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const aggregate = value => ({ op: 'aggregate', value });
const source = value => ({ op: 'source', value });

test('numeric aggregates expose missing and invalid coverage without inventing supported zeroes', () => {
    const cases = [
        [[2, undefined, 3], { sum: 5, count: 2, total: 3, missing: 1, invalid: 0, coverage: 'partial' }],
        [[2, 0, -2], { sum: 0, count: 3, total: 3, missing: 0, invalid: 0, coverage: 'complete' }],
        [[], { sum: 0, count: 0, total: 0, missing: 0, invalid: 0, coverage: 'complete' }],
        [[undefined, undefined], { sum: undefined, count: 0, total: 2, missing: 2, invalid: 0, coverage: 'unknown' }],
        [[null], { sum: undefined, count: 0, total: 1, missing: 0, invalid: 1, coverage: 'unknown' }],
        [[2, null, undefined, '3', false, {}, [], Infinity, NaN], { sum: undefined, count: 1, total: 9, missing: 1, invalid: 7, coverage: 'partial' }],
        [[Number.MAX_VALUE, Number.MAX_VALUE], { sum: undefined, count: 2, total: 2, missing: 0, invalid: 0, coverage: 'unknown' }],
    ];
    for (const [values, expected] of cases) {
        const env = { vars: { values }, records: [], sources: new Map() };
        assert.deepEqual(evaluate(aggregate(get('vars', 'values')), env), expected);
        assert.equal(evaluate({ op: 'sum', value: get('vars', 'values') }, env), expected.sum);
    }
    for (const values of [undefined, null, 3, '3', {}]) {
        const env = { vars: { values }, records: [], sources: new Map() };
        assert.equal(evaluate(aggregate(get('vars', 'values')), env), undefined);
        assert.equal(evaluate({ op: 'sum', value: get('vars', 'values') }, env), undefined);
    }
});

test('aggregate projections retain exact evidence through derived bindings and materialize missing sums only at output', () => {
    const data = input('records.json', [{ id: 'a', entries: [{ cost: 2 }, {}, { cost: 3 }], invalid: [{ cost: null }, {}] }, { id: 'b', entries: [], invalid: [] }]);
    const lens = input('.lattice/lens.json', {
        schemaVersion: 1, name: 'Numeric coverage', kinds: [],
        derived: [
            { id: 'numbers', scope: 'node', value: get('node', 'entries', '*', 'cost') },
            { id: 'stats', scope: 'node', value: aggregate(get('vars', 'numbers')) },
            { id: 'invalid', scope: 'node', value: aggregate(get('node', 'invalid', '*', 'cost')) },
        ],
        facets: [
            { id: 'stats', key: 'stats', value: get('vars', 'stats') },
            { id: 'evidence', key: 'evidence', value: source(get('vars', 'stats', 'sum')) },
            { id: 'invalid', key: 'invalid', value: get('vars', 'invalid') },
            { id: 'invalidEvidence', key: 'invalidEvidence', value: source(get('vars', 'invalid', 'sum')) },
        ],
    });
    const records = extractJson(data);
    const project = entries => applyLens(entries, parseLens(lens), lens);
    const result = project(records);
    const facets = Object.fromEntries(result.facets.filter(facet => facet.nodeId === 'a').map(facet => [facet.key, facet.value]));
    assert.deepEqual(facets.stats, { sum: 5, count: 2, total: 3, missing: 1, invalid: 0, coverage: 'partial' });
    assert.deepEqual(facets.invalid, { sum: null, count: 0, total: 2, missing: 1, invalid: 1, coverage: 'unknown' });
    assert.deepEqual(facets.evidence.map(source => source.pointer), ['/0/entries/0/cost', '/0/entries/2/cost']);
    assert.deepEqual(facets.invalidEvidence.map(source => source.pointer), ['/0/invalid/0/cost']);
    assert.ok([...facets.evidence, ...facets.invalidEvidence].every(source => source.path === data.path && source.contentHash === data.contentHash));
    assert.deepEqual(project([...records].reverse()), result);
});
