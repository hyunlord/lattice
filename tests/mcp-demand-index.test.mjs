import test from 'node:test';
import assert from 'node:assert/strict';
import { residentIndex } from '../bin/mcp-resident-index.mjs';
test('node incidence is prepared only for the requested node and cached per immutable graph', () => {
    let reads = 0;
    const edge = { id: 'ab', get source() { reads++; return 'a'; }, target: 'b' };
    const graph = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [edge] };
    const index = residentIndex(graph); assert.equal(reads, 0);
    assert.deepEqual(index.incident.get('a'), [edge]); const after = reads;
    assert.deepEqual(index.incident.get('a'), [edge]); assert.equal(reads, after);
    assert.equal(residentIndex(graph), index);
    assert.deepEqual(residentIndex({ nodes: graph.nodes, edges: [] }).incident.get('a'), []);
});
