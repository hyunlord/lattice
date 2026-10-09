import test from 'node:test';
import assert from 'node:assert/strict';
import { automaticViews, distributionFields, normalizeView } from '../viewer/views-model.js';
const source = { path: 'records.json', line: 1, pointer: '', contentHash: 'hash' };
const node = (id, kind, attributes = {}) => ({ id, kind, name: id, attributes, sources: [source], contentHash: id });
const edge = (id, from, to, directed = true) => ({ id, source: from, target: to, directed, kind: 'uses', field: '', sources: [source] });
const nodes = [node('a', 'alpha', { score: 1 }), node('b', 'beta', { score: '1' }), node('c', 'alpha', { score: null }), node('d', 'beta')];
const view = (type, query) => ({ id: 'test', label: 'Test', type, query, sources: [source] });
test('automatic views count actual directed and undirected links with one self-loop', () => {
    const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c', false), edge('aa', 'a', 'a', false)];
    const automatic = automaticViews(nodes, edges);
    const matrix = normalizeView(automatic[0], nodes, edges);
    assert.equal(matrix.type, 'matrix');
    assert.deepEqual(matrix.cells.map(cell => [cell.row, cell.column, cell.count]), [['"alpha"', '"alpha"', 1], ['"alpha"', '"beta"', 2], ['"beta"', '"alpha"', 1]]);
    assert.deepEqual(matrix.rows[0].nodeIds, ['a', 'c']);
});
test('automatic distribution keeps typed scalar categories and missing separate from null', () => {
    const distribution = normalizeView(automaticViews(nodes, [], 'score')[1], nodes, []);
    assert.equal(distribution.type, 'distribution');
    assert.equal(distribution.buckets.length, 4);
    assert.deepEqual(new Set(distribution.buckets.map(bucket => bucket.key)), new Set(['1', '"1"', 'null', 'missing']));
    assert.deepEqual(distributionFields(nodes), ['@kind', 'score']);
});
test('grouped matrix and distribution recalculate current layer membership instead of stored counts', () => {
    const matrix = normalizeView(view('matrix', { nodeIds: ['a', 'b'], cells: [{ row: 1, column: 'x', count: 999, nodeIds: ['a'] }, { row: '1', column: 'x', count: 999, nodeIds: ['b'] }] }), nodes.slice(0, 2), []);
    assert.equal(matrix.type, 'matrix'); assert.equal(matrix.rows.length, 2); assert.deepEqual(matrix.cells.map(cell => cell.count), [1, 1]);
    const distribution = normalizeView(view('distribution', { nodeIds: ['a', 'b'], buckets: [{ value: null, count: 999, nodeIds: ['a', 'b'] }] }), nodes.slice(0, 1), []);
    assert.equal(distribution.type, 'distribution'); assert.equal(distribution.buckets[0].count, 1); assert.deepEqual(distribution.coverage, { selected: 1, total: 2, excluded: 1 });
});
test('directed lens matrix retains axis IDs and labels but only counts selected real edges', () => {
    const edges = [edge('ab', 'a', 'b'), edge('ac', 'a', 'c')];
    const matrix = normalizeView(view('matrix', { nodeIds: ['a', 'b', 'c'], rows: ['a', 'b', 'c'], columns: ['a', 'b', 'c'], cells: [{ source: 'a', target: 'b', label: 'influence', edgeIds: ['ab', 'ac', 'missing'] }] }), nodes.slice(0, 2), edges);
    assert.equal(matrix.type, 'matrix'); assert.deepEqual(matrix.cells[0].edgeIds, ['ab']); assert.equal(matrix.cells[0].label, 'influence'); assert.equal(matrix.cells[0].count, 1);
});
test('table preserves query values and cycle displays only actual selected relationships', () => {
    const table = normalizeView(view('table', { nodeIds: ['a', 'b'], columns: [{ id: 'result', label: 'Result' }], rows: [{ nodeId: 'a', values: { result: null } }, { nodeId: 'b', values: { result: 42 } }] }), nodes.slice(0, 1), []);
    assert.equal(table.type, 'table'); assert.deepEqual(table.rows, [{ nodeId: 'a', values: { result: null } }]);
    const cycle = normalizeView(view('cycle', { nodeIds: ['a', 'b'], edgeIds: ['ab', 'bc'] }), nodes, [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')]);
    assert.equal(cycle.type, 'cycle'); assert.deepEqual(cycle.edges.map(item => item.id), ['ab']); assert.equal(cycle.nodes.length, 2);
});
test('malformed view query is unsupported rather than a fabricated zero', () => {
    assert.equal(normalizeView(view('distribution', { nodeIds: ['a'], buckets: [{ value: 'x', count: 1 }] }), nodes, []).type, 'unsupported');
});
test('all four templates consume actual lens materialization outputs', async () => {
    const { applyLens, extractJson, parseLens } = await import('../dist/index.js');
    const { createHash } = await import('node:crypto');
    const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
    const records = extractJson(input('records.json', [{ id: 'one', group: 1, peerId: 'two' }, { id: 'two', group: '1', nullable: null }]));
    const getGroup = { op: 'get', from: 'node', path: ['group'] };
    const lensSource = input('.lattice/lens.json', {
        schemaVersion: 1, name: 'Generic', kinds: [], views: [
            { id: 'matrix', type: 'matrix', label: 'Groups', row: getGroup, column: 'column' },
            { id: 'distribution', type: 'distribution', label: 'Groups', groupBy: getGroup },
            { id: 'cycle', type: 'cycle', label: 'Relations' },
            { id: 'table', type: 'table', label: 'Inventory', columns: [{ id: 'group', label: 'Group', value: getGroup }] },
        ]
    });
    const result = applyLens(records, parseLens(lensSource), lensSource);
    const projections = result.views.map(item => normalizeView(item, result.nodes, result.edges));
    assert.deepEqual(new Set(projections.map(item => item.type)), new Set(['matrix', 'distribution', 'cycle', 'table']));
    assert.equal(projections.find(item => item.type === 'matrix').rows.length, 2);
    assert.equal(projections.find(item => item.type === 'distribution').buckets.length, 2);
    assert.equal(projections.find(item => item.type === 'cycle').edges.length, 1);
    assert.equal(projections.find(item => item.type === 'table').rows.length, 2);
});
