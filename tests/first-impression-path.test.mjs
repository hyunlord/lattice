import test from 'node:test';
import assert from 'node:assert/strict';
import { representativePath } from '../viewer/first-impression-path.js';
test('representative call follows a contiguous proven path instead of siblings or cycles', () => {
    const edge = (source, target) => ({ id: source + target, source, target, sources: [] });
    const flow = { rootId: 'main', nodes: ['main', 'exit', 'run', 'search', 'read'].map(id => ({ id, name: id, componentId: id })), edges: [edge('main', 'exit'), edge('main', 'run'), edge('run', 'search'), edge('search', 'read'), edge('read', 'run')], basis: 'static-call-graph', truncated: false };
    const path = representativePath([flow]);
    assert.deepEqual(path.edges.map(item => [item.source, item.target]), [['main', 'run'], ['run', 'search'], ['search', 'read']]);
    assert.equal(representativePath([{ ...flow, edges: [] }]), undefined);
});
