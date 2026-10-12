import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeGraph } from '../bin/mcp-query-scope.mjs';
const node = (id, layer, kind = 'module') => ({ id, kind, name: id, attributes: { layer }, sources: [], contentHash: id });
const graph = nodes => ({ nodes, edges: [], facets: [], findings: [] });
test('resident scopes reuse a generation while graph and presentation replacements invalidate it', () => {
    const first = graph([node('a', 'one'), node('b', 'two'), node('secret', 'one', 'hidden')]);
    const presentation = { kinds: [{ id: 'hidden', hidden: true }] };
    const scope = scopeGraph(first, presentation, { layer: 'one' });
    assert.strictEqual(scopeGraph(first, presentation, { id: 'a' }), scope);
    assert.deepEqual(scope.nodes.map(node => node.id), ['a']);
    assert.deepEqual(scopeGraph(first, {}, { layer: 'one' }).nodes.map(node => node.id), ['a', 'secret']);
    const next = graph([node('changed', 'one')]);
    assert.deepEqual(scopeGraph(next, presentation, { layer: 'one' }).nodes.map(node => node.id), ['changed']);
    assert.deepEqual(scopeGraph(first, presentation, { id: 'b' }).nodes.map(node => node.id), ['b']);
});
test('arbitrary absent layers are not retained in the resident scope cache', () => {
    const input = graph([node('a', 'one')]), presentation = {};
    assert.notStrictEqual(scopeGraph(input, presentation, { layer: 'absent' }), scopeGraph(input, presentation, { layer: 'absent' }));
    assert.strictEqual(scopeGraph(input, presentation, { layer: 'one' }), scopeGraph(input, presentation, { layer: 'one' }));
});
