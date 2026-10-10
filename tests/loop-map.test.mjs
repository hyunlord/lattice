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
    assert.equal(m.nodes.length, 3); assert.equal(m.stages[0].incoming.length, 0); assert.deepEqual(m.stages[0].outgoing, [{ name: 's2', description: 'feeds' }]); assert.deepEqual(m.nodes[0].relationGroups[0].items, [{ id: 't', via: [{ id: 'e', name: 'e' }], note: '→ e' }]);
});
test('no lens uses actual folder dependencies without fabricating a cycle or runtime status', () => {
    const nodes = [node('a', 'module', {}, 'src/a.py'), node('b', 'module', {}, 'lib/b.py'), node('f', 'function', {}, 'src/a.py')];
    const m = buildLoopMap(nodes, [edge('i', 'imports', 'a', 'b'), edge('i2', 'imports', 'a', 'b'), edge('c', 'contains', 'a', 'f')], [], { kinds: [] }, 'example');
    assert.equal(m.nodes.find(n => n.id === 'a').relationGroups.find(g => g.label === '참조하는 모듈').items.length, 1);
    assert.equal(m.stages.length, 2); assert.deepEqual(m.flows, [{ source: 'folder:src', target: 'folder:lib', label: '1개 파일 사용', count: 1, sourceFiles: ['src/a.py'] }]); assert(m.nodes.every(n => n.status === 'unknown')); assert.equal(m.nodes.find(n => n.id === 'a').relationGroups.find(g => g.label === '정의한 타입·함수').items[0].id, 'f');
});
test('notes retain stale AI attribution and media stays attached to its actual node', () => {
    const m = buildLoopMap([node('a', 'module', {}, 'src/a.py')], [], [], { kinds: [], interpretations: [{ targetId: 'folder:src', summary: 'Evidence-backed explanation', status: 'stale', sources: [{ path: 'src/a.py', line: 1 }] }], mediaManifest: { a: { status: 'available', url: 'media/hash.png', sourcePath: 'art.png', sourceHash: 'hash', frame: { x: 1, y: 2, width: 3, height: 4 } } } }, 'example');
    assert.equal(m.stages[0].interpretation.stale, true); assert.equal(m.nodes[0].media.frame.width, 3);
});
test('multi-step relations retain distinct intermediate routes while excluding self', () => {
    const nodes = [node('a', 'part'), node('b', 'part'), node('x', 'result'), node('y', 'result')];
    const edges = [edge('ax', 'input', 'a', 'x'), edge('bx', 'input', 'b', 'x'), edge('ay', 'input', 'a', 'y'), edge('by', 'input', 'b', 'y'), edge('dup', 'input', 'b', 'x')];
    const loop = loopConfig({ relationGroups: [{ label: 'pair', side: 'left', steps: [{ edgeKinds: ['input'], direction: 'out' }, { edgeKinds: ['input'], direction: 'in' }] }] });
    const result = buildLoopMap(nodes, edges, [], { kinds: [], loop }, 'example');
    assert.deepEqual(result.nodes.find(n => n.id === 'a').relationGroups[0].items, [{ id: 'b', via: [{ id: 'x', name: 'x' }], note: '→ x' }, { id: 'b', via: [{ id: 'y', name: 'y' }], note: '→ y' }]);
});
test('kind-specific fields override defaults and read translated facet values', () => {
    const nodes = [node('a', 'part', { description: 'fallback', cost: 2 }), node('b', 'other', { description: 'fallback' })];
    const result = buildLoopMap(nodes, [], [{ nodeId: 'a', key: 'usage', value: 'known' }], { kinds: [], loop: loopConfig({ stages: [{ id: 'stage', title: 'Stage', kinds: ['part', 'other'] }] }), facets: { usage: { values: { known: 'Known use' } } }, detail: { summaryFields: [{ label: 'Default', path: ['description'] }], summaryFieldsByKind: { part: [{ label: 'Cost', path: ['cost'] }, { label: 'Use', path: ['facet', 'usage'] }] } } }, 'example');
    assert.deepEqual(result.nodes[0].fields, [{ label: 'Cost', value: '2' }, { label: 'Use', value: 'Known use' }]);
    assert.deepEqual(result.nodes[1].fields, [{ label: 'Default', value: 'fallback' }]);
});
test('attribute style overrides inherit base shape and do not affect other kinds', () => {
    const loop = loopConfig({ kindStyles: { part: { shape: 'square', color: 'blue', variants: [{ field: 'category', value: 'growing', color: 'green', label: 'Growing part' }] } } });
    const result = buildLoopMap([node('a', 'part', { category: 'growing' }), node('b', 'part', { category: 'other' }), node('c', 'other', { category: 'growing' })], [], [], { kinds: [], loop }, 'example');
    assert.equal(result.nodes[0].kindColor, 'green');
    assert.equal(result.nodes[0].kindLabel, 'Growing part'); assert.equal(result.nodes[0].kindShape, 'square');
    assert.equal(result.nodes[1].kindColor, 'blue'); assert.equal(result.nodes[2].kindColor, undefined);
});
test('an intermediate display step keeps the final partner as context', () => {
    const nodes = [node('a', 'part'), node('b', 'part'), node('x', 'result')];
    const loop = loopConfig({ relationGroups: [{ label: 'result', side: 'right', displayStep: 0, viaPrefix: '+', steps: [{ edgeKinds: ['input'], direction: 'out' }, { edgeKinds: ['input'], direction: 'in' }] }] });
    const result = buildLoopMap(nodes, [edge('a', 'input', 'a', 'x'), edge('b', 'input', 'b', 'x')], [], { kinds: [], loop }, 'example');
    assert.deepEqual(result.nodes[0].relationGroups[0].items, [{ id: 'x', via: [{ id: 'b', name: 'b' }], note: '+ b' }]);
});

test('structural focus starts on the most connected module and leaves configured views unchanged', () => {
    const nodes = [node('isolated', 'module', {}, 'source-manifest.csv'), node('a', 'module', {}, 'src/a.ts'), node('b', 'module', {}, 'src/b.ts'), node('c', 'module', {}, 'src/c.ts')];
    const edges = [edge('a', 'imports', 'a', 'b'), edge('b', 'imports', 'a', 'c'), edge('duplicate', 'imports', 'a', 'b')];
    const automatic = buildLoopMap(nodes, edges, [], { kinds: [] }, 'example');
    assert.equal(automatic.defaultFocus, 'a');
    const configured = buildLoopMap(nodes, edges, [], { kinds: [], loop: loopConfig({ stages: [{ id: 's', title: 'Modules', kinds: ['module'] }] }) }, 'example');
    assert.equal(configured.defaultFocus, undefined);
});

test('structural focus prefers production code over a busier test module', () => {
    const nodes = [node('test', 'module', {}, 'test/test.ts'), node('prod', 'module', {}, 'src/main.ts'), node('helper', 'module', {}, 'src/helper.ts')];
    const model = buildLoopMap(nodes, [edge('a', 'imports', 'test', 'prod'), edge('b', 'imports', 'test', 'helper')], [], { kinds: [] }, 'example');
    assert.equal(model.defaultFocus, 'helper');
});

test('repository namespace metadata labels logical groups without changing identity', () => {
    const m = buildLoopMap([node('Acme.Logging', 'package', { category: 'namespace', scope: 'repository', directories: ['one', 'two'], packageName: 'Acme.Logging' })], [], [], { kinds: [] }, 'example');
    assert.equal(m.nodes[0].kind, 'package');
    assert.equal(m.nodes[0].kindLabel, '내부 네임스페이스');
    assert.equal(m.stages.find(s => s.nodeIds.includes('Acme.Logging')).title, '내부 네임스페이스 Acme.Logging');
    assert.equal(m.stages.find(s => s.nodeIds.includes('Acme.Logging')).id, 'folder:패키지 Acme.Logging');
    assert.equal(m.nodes[0].name, 'Acme.Logging');
});
