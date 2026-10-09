import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const literal = value => ({ op: 'literal', value });
const compare = (op, left, right) => ({ op, left, right });

test('missing values survive data projection, derived dependencies and finding targetValues without becoming authored null', () => {
    // Given one missing field and one authored null, projected through wildcard, map and let.
    const records = extractJson(input('data.json', [{ id: 'a', entries: [{}, { value: null }] }]));
    const source = input('.lattice/lens.json', {
        schemaVersion: 1, name: 'Missing evidence', kinds: [],
        derived: [
            { id: 'globalMissing', scope: 'graph', value: get('graph', 'absent') },
            { id: 'missing', scope: 'node', value: { op: 'let', bindings: { local: get('vars', 'globalMissing') }, value: get('vars', 'local') } },
            { id: 'projected', scope: 'node', value: get('node', 'entries', '*', 'value') },
            { id: 'mapped', scope: 'node', value: { op: 'map', input: get('node', 'entries'), value: get('item', 'value') } },
        ],
        facets: [{ id: 'exported', key: 'exported', value: get('vars', 'mapped') }],
        findings: [{
            id: 'missing', query: {}, template: 'Missing remains unknown', metrics: {
                eq: compare('eq', get('vars', 'targetValues', 0, 'derived', 'missing'), null),
                ne: compare('ne', get('vars', 'targetValues', 0, 'derived', 'missing'), 1),
                membership: { op: 'in', collection: literal([null]), value: get('vars', 'targetValues', 0, 'derived', 'missing') },
                wildcard: compare('eq', get('vars', 'targetValues', 0, 'derived', 'projected'), literal([null, null])),
                mapped: { op: 'map', input: get('vars', 'targetValues', 0, 'derived', 'mapped'), value: compare('eq', get('item'), null) },
                emptyAll: { op: 'all', input: literal([]), where: true },
                missingAll: { op: 'all', input: get('vars', 'globalMissing'), where: true },
                missingAny: { op: 'any', input: get('vars', 'globalMissing'), where: true },
                uniqueCount: { op: 'count', value: { op: 'unique', value: get('vars', 'targetValues', 0, 'derived', 'mapped') } },
                nullIndex: { op: 'indexOf', input: get('vars', 'targetValues', 0, 'derived', 'mapped'), value: null },
                nullEq: compare('eq', null, null),
                lookup: { op: 'exists', value: { op: 'lookup', kind: 'record', field: ['absent'], equals: null } },
                sum: { op: 'sum', value: get('vars', 'targetValues', 0, 'derived', 'mapped') },
            }
        }],
    });
    // When the real lens pipeline evaluates and materializes its graph output.
    const result = applyLens(records, parseLens(source), source);
    // Then only authored null equals null; graph JSON materializes missing slots without changing later expressions.
    assert.deepEqual(result.findings[0].metrics, { eq: false, ne: false, membership: false, wildcard: false, mapped: [false, true], emptyAll: false, missingAll: false, missingAny: false, uniqueCount: 2, nullIndex: 1, nullEq: true, lookup: false, sum: null });
    assert.deepEqual(result.facets[0].value, [null, null]);
});
