import test from 'node:test';
import assert from 'node:assert/strict';
import * as logic from '../dist/query/logic-model.js';
import { parseArguments, toolDefinitions } from '../bin/mcp-schema.mjs';
import { queryGraph } from '../bin/mcp-queries.mjs';
const source = { path: 'src/main.ts', line: 3, pointer: '', contentHash: 'abc' };
const node = (id, extra = {}) => ({ id, name: id, kind: 'function', attributes: { module: 'module:src/main.ts', ...extra }, sources: [source], contentHash: id });
const call = (id, from, to, resolution = 'exact') => ({ id, kind: 'calls', source: from, target: to, directed: true, field: '', attributes: { resolution }, sources: [source] });
const graph = { schemaVersion: 1, hash: 'g', repository: { name: 'fixture', dirty: false, sourceFingerprint: 'x' }, nodes: [node('c'), node('a', { entrypoints: [{ category: 'executable', rule: 'main', source }] }), node('b'), node('d'), { ...node('pkg'), kind: 'package', attributes: { memberIds: ['module:src/main.ts'] } }], edges: [call('bc', 'b', 'c'), call('ab', 'a', 'b'), call('ca', 'c', 'a'), call('ad', 'a', 'd', 'estimated'), call('unknown', 'a', 'c', 'unresolved')], facets: [], findings: [], views: [], snapshots: [], inputs: [], adapterVersions: {}, lensDigest: null };
test('entrypoint evidence and package ownership survive deterministic pagination', () => {
    assert.equal(typeof logic.logicEntrypoints, 'function');
    const result = logic.logicEntrypoints(graph, { limit: 1 });
    assert.equal(result.total, 1); assert.equal(result.items[0].node.id, 'a');
    assert.deepEqual(result.items[0].entrypoints[0].source, source); assert.deepEqual(result.items[0].packageIds, ['pkg']);
});
test('calls distinguish directions and omit estimates unless requested', () => {
    const result = logic.logicCalls(graph, { id: 'a' });
    assert.deepEqual(result.outgoing.items.map(edge => edge.id), ['ab']);
    assert.deepEqual(result.incoming.items.map(edge => edge.id), ['ca']);
    assert.deepEqual(logic.logicCalls(graph, { id: 'a', includeEstimated: true }).outgoing.items.map(edge => edge.id), ['ab', 'ad']);
});
test('flow preserves static call sites, terminates cycles and reports depth and budget cuts', () => {
    const full = logic.logicFlow(graph, { id: 'a' });
    assert.deepEqual(full.nodes.map(item => [item.node.id, item.depth]), [['a', 0], ['b', 1], ['c', 2]]);
    assert.equal(full.edges.length, 3); assert.equal(full.truncated, false);
    assert.deepEqual(logic.logicFlow(graph, { id: 'a', depth: 1 }).truncationReasons, ['depth']);
    assert.deepEqual(logic.logicFlow(graph, { id: 'a', maxNodes: 1 }).truncationReasons, ['maxNodes']);
    assert.deepEqual(logic.logicFlow(graph, { id: 'a', maxEdges: 1 }).truncationReasons, ['maxEdges']);
    assert.equal(logic.logicFlow(graph, { id: 'missing' }).found, false);
});
test('MCP logic schemas are readonly, reject out of bounds and expose shared projection', () => {
    for (const name of ['lattice_entrypoints', 'lattice_calls', 'lattice_flow']) assert.equal(toolDefinitions.find(tool => tool.name === name)?.annotations.readOnlyHint, true);
    for (const args of [{ id: 'a', depth: 11 }, { id: 'a', maxNodes: 501 }, { id: 'a', maxEdges: 0 }, { id: 'a', includeEstimated: 'yes' }, { id: 'a', unknown: 1 }]) assert.throws(() => parseArguments('lattice_flow', args));
    assert.throws(() => parseArguments('lattice_calls', {}));
    const result = queryGraph('lattice_flow', parseArguments('lattice_flow', { id: 'a' }), graph, {}, () => '/logic');
    assert.deepEqual(result.edges, logic.logicFlow(graph, { id: 'a' }).edges);
});
test('flow output is stable under graph reordering and never emits unresolved call edges', () => {
    const reversed = { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
    assert.deepEqual(logic.logicFlow(reversed, { id: 'a', includeEstimated: true }), logic.logicFlow(graph, { id: 'a', includeEstimated: true }));
    assert.equal(logic.logicFlow(graph, { id: 'a', includeEstimated: true }).edges.some(edge => edge.id === 'unknown'), false);
});
test('call pages expose totals and continuations without losing source callsites', () => {
    const first = logic.logicCalls(graph, { id: 'a', includeEstimated: true, limit: 1 });
    assert.equal(first.outgoing.total, 2); assert.equal(first.outgoing.nextOffset, 1);
    const second = logic.logicCalls(graph, { id: 'a', includeEstimated: true, limit: 1, offset: 1 });
    assert.equal(second.outgoing.items[0].id, 'ad'); assert.deepEqual(second.outgoing.items[0].sources, [source]);
});
