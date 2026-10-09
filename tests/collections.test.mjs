import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const literal = value => ({ op: 'literal', value });
const group = (input, key) => ({ op: 'groupBy', input, key });
const join = (input, separator = ', ') => ({ op: 'join', input, separator });
const exists = value => ({ op: 'exists', value });

function project(attributes, definitions) {
    const records = extractJson(input('data.json', [{ id: 'entry', ...attributes }]));
    const source = input('.lattice/lens.json', { schemaVersion: 1, name: 'Collections', kinds: [], derived: Object.entries(definitions).map(([id, value]) => ({ id, scope: 'node', value })), facets: Object.keys(definitions).map(id => ({ id, key: id, value: get('vars', id) })) });
    return Object.fromEntries(applyLens(records, parseLens(source), source).facets.map(facet => [facet.key, facet.value]));
}

test('groupBy orders canonical JSON keys while preserving member order and outer node scope', () => {
    // Given repeated keys of every JSON type, including structurally equal objects.
    const keys = [{ b: 2, a: 1 }, null, false, [1], '1', 1, { a: 1, b: 2 }];
    const entries = keys.map((key, index) => ({ key, index }));
    // When a derived group is joined into readable labels through the public lens pipeline.
    const result = project({ entries, prefix: 'row' }, {
        groups: group(get('node', 'entries'), get('item', 'key')),
        labels: { op: 'map', input: get('vars', 'groups'), value: join({ op: 'map', input: get('item', 'items'), value: get('node', 'prefix') }) },
        scalarLabels: join(literal(['word', 3, true, null])),
        empty: join(literal([])),
        emptyGroups: group(literal([]), get('item')),
    });
    // Then keys sort by their canonical encoding and equal objects retain original member order.
    assert.deepEqual(result.groups.map(group => group.key), ['1', 1, [1], false, null, { b: 2, a: 1 }]);
    assert.deepEqual(result.groups.map(group => group.items.map(item => item.index)), [[4], [5], [3], [2], [1], [0, 6]]);
    assert.deepEqual(result.labels, ['row', 'row', 'row', 'row', 'row', 'row, row']);
    assert.equal(result.scalarLabels, 'word, 3, true, null');
    assert.equal(result.empty, '');
    assert.deepEqual(result.emptyGroups, []);
});

test('collection expressions preserve unknown values instead of dropping them or treating them as null', () => {
    // Given missing keys alongside explicit nulls and nonscalar values.
    const result = project({ entries: [{ key: null }, {}] }, {
        missingGroup: exists(group(get('node', 'entries'), get('item', 'key'))),
        nestedMissing: exists(group(get('node', 'entries'), { op: 'map', input: literal([0]), value: get('node', 'absent') })),
        missingInput: exists(group(get('node', 'absent'), get('item'))),
        invalidInput: exists(group(literal({}), get('item'))),
        missingJoin: exists(join(get('node', 'entries', '*', 'key'))),
        nonscalarJoin: exists(join(get('node', 'entries'))),
        nonarrayJoin: exists(join(null)),
        nullGroup: group(literal([null, null]), get('item')),
    });
    // Then a partial collection cannot be mistaken for complete evidence.
    assert.deepEqual(result, { missingGroup: false, nestedMissing: false, missingInput: false, invalidInput: false, missingJoin: false, nonscalarJoin: false, nonarrayJoin: false, nullGroup: [{ key: null, items: [null, null] }] });
    assert.throws(() => project({}, { invalidSeparator: join(literal([]), 1) }), /string/);
});
