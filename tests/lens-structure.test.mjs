import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value, null, 2); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const records = () => extractJson(input('records.json', [{ id: 'duplicate', name: 'First', role: 'producer', group: 'A', target: 'main', hubId: 'hub:one' }, { id: 'duplicate', name: 'Second', role: 'consumer', group: 'B' }])).map(record => ({ ...record, node: { ...record.node, kind: record.node.attributes.role } }));
const configuration = () => ({
    schemaVersion: 1, name: 'Generic structure', kinds: [],
    synthetics: [{ id: 'hub:one', kind: 'hub', name: 'Hub', attributes: { alias: 'main', group: 'A' } }],
    derived: [{ id: 'alias', scope: 'node', kinds: ['producer'], value: { op: 'get', from: 'node', path: ['target'] } }],
    edges: [{ id: 'supplies', source: { kinds: ['producer'] }, target: { op: 'get', from: 'vars', path: ['alias'] }, targetKind: 'hub', targetField: ['alias'], label: 'Supplies', direction: 'reverse' }],
    facets: [{ id: 'group', key: 'group', value: { op: 'get', from: 'node', path: ['group'] } }],
    findings: [{ id: 'all', query: {}, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } }, edges: { op: 'count', value: { op: 'get', from: 'graph', path: ['edges'] } } }, template: '{count} nodes; {edges} edges' }],
    views: [
        { id: 'grid', type: 'matrix', label: 'Groups by kind', row: { op: 'get', from: 'node', path: ['group'] }, column: { op: 'get', from: 'node', path: ['kind'] } },
        { id: 'groups', type: 'distribution', label: 'Groups', groupBy: { op: 'get', from: 'node', path: ['group'] } },
        { id: 'flow', type: 'cycle', label: 'Flow', edgeKinds: ['supplies'] },
        { id: 'inventory', type: 'table', label: 'Inventory', columns: [{ id: 'name', label: 'Name', value: { op: 'get', from: 'node', path: ['name'] } }] },
    ],
});

test('lens materializes synthetic links and all view kinds after resolving duplicate record identities', () => {
    const source = input('.lattice/lens.json', configuration());
    const result = applyLens(records(), parseLens(source), source);
    const first = result.nodes.find(node => node.name === 'First');
    const second = result.nodes.find(node => node.name === 'Second');
    assert.notEqual(first.id, second.id);
    assert.deepEqual(result.facets.filter(facet => facet.nodeId === second.id).map(facet => facet.value), ['B']);
    assert.ok(result.edges.some(edge => edge.source === first.id && edge.target === 'hub:one' && edge.field === '/hubId'));
    const supplied = result.edges.find(edge => edge.kind === 'supplies');
    assert.equal(supplied.source, 'hub:one');
    assert.equal(supplied.target, first.id);
    assert.equal(supplied.attributes.label, 'Supplies');
    assert.ok(supplied.sources.some(source => source.pointer === '/edges/0' && source.line > 1));
    assert.equal(result.nodes.find(node => node.id === 'hub:one').sources[0].pointer, '/synthetics/0');
    assert.equal(result.findings[0].metrics.count, 3);
    assert.equal(result.findings[0].metrics.edges, result.edges.length);
    assert.equal(result.views.find(view => view.type === 'matrix').query.cells.length, 3);
    assert.deepEqual(result.views.find(view => view.type === 'distribution').query.buckets.map(bucket => [bucket.value, bucket.count]), [['A', 2], ['B', 1]]);
    assert.deepEqual(result.views.find(view => view.type === 'cycle').query.edgeIds, [supplied.id]);
    assert.equal(result.views.find(view => view.type === 'table').query.rows.length, 3);
    assert.ok(result.views.every(view => view.sources.some(source => source.pointer.startsWith('/views/'))));
    assert.deepEqual(applyLens([...records()].reverse(), parseLens(source), source), result);
});

test('lens edges reject unresolved and ambiguous aliases instead of losing relationships', () => {
    for (const target of ['missing', 'duplicate']) {
        const config = configuration();
        config.edges = [{ id: 'link', source: { kinds: ['hub'] }, target }];
        const source = input('.lattice/lens.json', config);
        assert.throws(() => applyLens(records(), parseLens(source), source), { name: 'GraphInputError', reason: new RegExp(target === 'missing' ? 'Unknown edge target' : 'Ambiguous edge target') });
    }
});

test('layers isolate inferred aliases while explicit cross-layer and directed matrix edges remain selectable', () => {
    const layered = (layer, data) => extractJson(input(`${layer}.json`, data)).map(record => ({ ...record, node: { ...record.node, id: `${layer}:${record.node.id}`, kind: 'unit', attributes: { ...record.node.attributes, originalId: record.node.id, layer } } }));
    const data = [
        ...layered('plan', [{ id: 'a', peerId: 'b' }, { id: 'b' }]),
        ...layered('live', [{ id: 'a', peerId: 'b' }, { id: 'b' }]),
    ];
    const root = extractJson(input('matrix.json', { id: 'matrix', ids: ['a', 'b'], cells: [['none', 'feeds'], ['guards', 'none']] }))[0];
    data.push({ ...root, references: false, node: { ...root.node, kind: 'matrix', attributes: { ...root.node.attributes, layer: 'plan', originalId: 'matrix' } } });
    const config = {
        schemaVersion: 1, name: 'Layered map', kinds: [],
        edges: [
            { id: 'corresponds', source: { kinds: ['unit'], layer: 'live' }, target: { op: 'get', from: 'node', path: ['originalId'] }, targetKind: 'unit', targetQuery: { layer: 'plan' } },
            { id: 'matrix-flow', source: { kinds: ['matrix'] }, targetKind: 'unit', targetQuery: { layer: 'plan' }, matrix: { ids: { op: 'get', from: 'node', path: ['ids'] }, cells: { op: 'get', from: 'node', path: ['cells'] }, empty: 'none' } },
        ],
        findings: [{ id: 'planned', query: { layer: 'plan', kinds: ['unit'] }, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } } }, template: '{count}' }],
        views: [{ id: 'adjacency', type: 'matrix', label: 'Directed matrix', query: { layer: 'plan', kinds: ['unit'] }, edgeKinds: ['matrix-flow'] }],
    };
    const source = input('.lattice/lens.json', config);
    const result = applyLens(data, parseLens(source), source);
    assert.deepEqual(result.edges.filter(edge => edge.kind === '/peerId').map(edge => [edge.source, edge.target]), [['live:a', 'live:b'], ['plan:a', 'plan:b']]);
    assert.ok(result.edges.every(edge => edge.source !== 'plan:matrix'));
    assert.deepEqual(result.edges.filter(edge => edge.kind === 'corresponds').map(edge => [edge.source, edge.target]), [['live:a', 'plan:a'], ['live:b', 'plan:b']]);
    const matrix = result.edges.filter(edge => edge.kind === 'matrix-flow');
    assert.deepEqual(matrix.map(edge => [edge.source, edge.target, edge.attributes.label]), [['plan:a', 'plan:b', 'feeds'], ['plan:b', 'plan:a', 'guards']]);
    assert.ok(matrix[0].sources.some(source => source.pointer === '/cells/0/1'));
    assert.deepEqual(result.views[0].query.rows, ['plan:a', 'plan:b']);
    assert.deepEqual(result.views[0].query.cells.map(cell => [cell.source, cell.target, cell.label]), [['plan:a', 'plan:b', 'feeds'], ['plan:b', 'plan:a', 'guards']]);
    assert.equal(result.findings[0].metrics.count, 2);
});

test('collection expressions support numeric paths and scoped nested values without domain rules', () => {
    const config = {
        schemaVersion: 1, name: 'Expressions', kinds: [], findings: [{
            id: 'metrics', metrics: {
                textLength: { op: 'count', value: 'a😀c' },
                numericPath: { op: 'get', from: 'graph', path: ['nodes', 0, 'name'] },
                sum: { op: 'sum', value: { op: 'flatten', value: { op: 'literal', value: [[1, 2], [3]] } } },
                concat: { op: 'concat', values: ['a', ':', 'b'] },
                arrayConcat: { op: 'count', value: { op: 'concat', values: [{ op: 'literal', value: [1, 2] }, { op: 'literal', value: [3] }] } },
                position: { op: 'indexOf', input: { op: 'literal', value: ['a', 'b'] }, value: 'b' },
                nested: { op: 'let', bindings: { candidate: 'b' }, value: { op: 'count', value: { op: 'filter', input: { op: 'literal', value: ['a', 'b'] }, where: { op: 'eq', left: { op: 'get', from: 'item', path: [] }, right: { op: 'get', from: 'vars', path: ['candidate'] } } } } },
            }, template: '{sum}'
        }]
    };
    const source = input('.lattice/lens.json', config);
    const result = applyLens(records(), parseLens(source), source);
    assert.deepEqual(result.findings[0].metrics, { textLength: 3, numericPath: 'First', sum: 6, concat: 'a:b', arrayConcat: 3, position: 1, nested: 1 });
});
