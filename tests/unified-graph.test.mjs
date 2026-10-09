import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens, resolveRecords } from '../dist/index.js';
const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const source = { path: 'guide.md', pointer: '', line: 1, contentHash: 'a'.repeat(64) };
const known = [
    { id: 'document:guide.md', kind: 'document', name: 'Guide', attributes: { moduleId: 'unscanned' }, sources: [source] },
    { id: 'module:service.ts', kind: 'module', name: 'Service', attributes: {}, sources: [{ ...source, path: 'service.ts' }] },
];
test('heterogeneous nodes and structural edges participate in the same lens evaluation', () => {
    // Given data references and native structural nodes.
    const data = extractJson(input('data.json', [{ id: 'service', documentId: known[0].id, moduleId: known[1].id }]));
    const lensInput = input('.lattice/lens.json', {
        schemaVersion: 1, name: 'Unified', kinds: [],
        derived: [{ id: 'edgeCount', scope: 'graph', value: { op: 'count', value: { op: 'get', from: 'graph', path: ['edges'] } } }],
        facets: [{ id: 'edges', key: 'edges', value: { op: 'get', from: 'vars', path: ['edgeCount'] } }],
        findings: [{ id: 'all', query: {}, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } } }, template: '{count}' }],
        views: [{ id: 'inventory', type: 'table', label: 'Inventory', columns: [{ id: 'name', label: 'Name', value: { op: 'get', from: 'node', path: ['name'] } }] }],
    });
    // When the lens receives structural edges before derived evaluation.
    const result = applyLens(data, parseLens(lensInput), lensInput, {
        knownNodes: known, structuralEdges: nodes => {
            assert.equal(nodes.length, 3);
            return [{ id: 'documents', kind: 'documents', source: known[0].id, target: 'service', directed: true, sources: [source] }];
        }
    });
    // Then every selected node sees the complete initial graph.
    assert.equal(result.nodes.length, 3);
    assert.equal(result.edges.length, 3);
    assert.deepEqual(result.facets.map(facet => facet.value), [3, 3, 3]);
    assert.equal(result.findings[0].metrics.count, 3);
    assert.equal(result.views[0].query.rows.length, 3);
    assert.deepEqual(result.nodes.find(node => node.id === known[0].id), known[0]);
    assert.deepEqual(result.diagnostics, []);
});

test('known IDs stay fixed while colliding aliases remain ambiguous and disabled references stay unscanned', () => {
    // Given a data alias colliding with a fixed structural ID.
    const data = extractJson(input('data.json', [{ id: known[0].id }, { id: 'consumer', documentId: known[0].id }]));
    const disabled = { ...data[1], references: false, fields: {} };
    // When both kinds enter reference resolution.
    const result = resolveRecords(data, known);
    // Then data disambiguates without silently selecting either alias.
    assert.deepEqual(result.nodes.find(node => node.id === known[0].id), known[0]);
    assert.equal(result.nodes.length, 4);
    assert.ok(result.diagnostics.some(item => item.code === 'ambiguous-reference'));
    assert.equal(result.edges.length, 0);
    assert.equal(resolveRecords([disabled], known).edges.length, 0);
    assert.throws(() => resolveRecords([], [known[0], known[0]]), /Duplicate known node ID/);
});

test('layer-local aliases resolve independently alongside exact global structural IDs', () => {
    // Given two layers with repeated aliases.
    const data = ['plan', 'live'].flatMap(layer => extractJson(input(`${layer}.json`, [{ id: 'a', peerId: 'b', documentId: known[0].id }, { id: 'b' }])).map(record => ({ ...record, node: { ...record.node, id: `${layer}:${record.node.id}`, attributes: { ...record.node.attributes, originalId: record.node.id, layer } } })));
    const lensInput = input('.lattice/lens.json', { schemaVersion: 1, name: 'Layers', kinds: [] });
    // When references resolve across a unified node set.
    const result = applyLens(data, parseLens(lensInput), lensInput, { knownNodes: [...known, { ...known[0], id: 'plan:b' }] });
    // Then structural IDs are global but data aliases stay local.
    assert.equal(result.nodes.length, 7);
    assert.deepEqual(result.edges.filter(edge => edge.field === '/peerId').map(edge => [edge.source, edge.target]), [['live:a', 'live:b'], ['plan:a', result.nodes.find(node => node.attributes.layer === 'plan' && node.attributes.originalId === 'b').id]]);
    assert.deepEqual(result.edges.filter(edge => edge.field === '/documentId').map(edge => edge.target), [known[0].id, known[0].id]);
    assert.deepEqual(result.diagnostics.map(item => item.code), ['duplicate-id']);
});
