import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoopMap } from '../dist/query/loop-map-model.js';
import { loopConfig } from '../dist/query/loop-config.js';
const node = (id, kind, attributes = {}, path = id) => ({ id, kind, name: id, attributes, contentHash: 'h', sources: [{ path, line: 1, pointer: '', contentHash: 'h' }] });
const edge = (id, kind, source, target, label = kind) => ({ id, kind, source, target, directed: true, field: '', sources: [], attributes: { label } });
test('stage influence excludes content membership and two-hop focus preserves partners without self', () => {
    const nodes = [node('s1', 'system'), node('s2', 'system'), node('w', 'weapon'), node('t', 'tool'), node('e', 'evolution')];
    const edges = [edge('m', 'member', 'w', 's1'), edge('i', 'influence', 's1', 's2', 'feeds'), edge('a', 'evolve', 'w', 'e'), edge('b', 'evolve', 't', 'e')];
    const loop = loopConfig({ catalogKinds: ['weapon', 'tool', 'evolution'], stages: [{ id: 'a', title: 'A', kinds: ['weapon'], systemIds: ['s1'] }, { id: 'b', title: 'B', kinds: ['tool'], systemIds: ['s2'] }], relationGroups: [{ label: 'partner', side: 'left', kinds: ['weapon', 'tool'], steps: [{ edgeKinds: ['evolve'], direction: 'out' }, { edgeKinds: ['evolve'], direction: 'in' }] }] });
    const m = buildLoopMap(nodes, edges, [], { kinds: [], loop }, 'example');
    assert.equal(m.nodes.length, 3); assert.equal(m.stages[0].incoming.length, 0); assert.deepEqual(m.stages[0].outgoing, [{ name: 's2', description: 'feeds' }]); assert.deepEqual(m.nodes[0].relationGroups[0].items, [{ id: 't' }]);
});
test('no lens uses actual folder dependencies without fabricating a cycle or runtime status', () => {
    const nodes = [node('a', 'module', {}, 'src/a.py'), node('b', 'module', {}, 'lib/b.py'), node('f', 'function', {}, 'src/a.py')];
    const m = buildLoopMap(nodes, [edge('i', 'imports', 'a', 'b'), edge('i2', 'imports', 'a', 'b'), edge('c', 'contains', 'a', 'f')], [], { kinds: [] }, 'example');
    assert.equal(m.nodes.find(n => n.id === 'a').relationGroups.find(g => g.label === '참조하는 모듈').items.length, 1);
    assert.equal(m.stages.length, 2); assert.deepEqual(m.flows, [{ source: 'folder:src', target: 'folder:lib', label: '2개 참조' }]); assert(m.nodes.every(n => n.status === 'unknown')); assert.equal(m.nodes.find(n => n.id === 'a').relationGroups.find(g => g.label === '정의한 타입·함수').items[0].id, 'f');
});
test('notes retain stale AI attribution and media stays attached to its actual node', () => {
    const m = buildLoopMap([node('a', 'module', {}, 'src/a.py')], [], [], { kinds: [], interpretations: [{ targetId: 'folder:src', summary: 'Evidence-backed explanation', status: 'stale', sources: [{ path: 'src/a.py', line: 1 }] }], mediaManifest: { a: { status: 'available', url: 'media/hash.png', sourcePath: 'art.png', sourceHash: 'hash', frame: { x: 1, y: 2, width: 3, height: 4 } } } }, 'example');
    assert.equal(m.stages[0].interpretation.stale, true); assert.equal(m.nodes[0].media.frame.width, 3);
});
