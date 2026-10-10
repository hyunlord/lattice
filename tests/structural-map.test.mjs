import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuralMap, structuralSummary } from '../dist/query/structural-map-model.js';
const node = (id, path, attributes = {}, kind = 'module') => ({ id, kind, name: path, attributes, contentHash: 'h', sources: [{ path, line: 1, pointer: '', contentHash: 'h' }] });
const edge = (id, source, target) => ({ id, source, target, kind: 'imports', directed: true, field: '', sources: [] });
test('package dependency counts importing files rather than package members or duplicate statements', () => {
    const nodes = [node('a', 'src/a.go'), node('b', 'src/b.go'), ...Array.from({ length: 9 }, (_, i) => node(`u${i}`, `src/util/u${i}.go`)), node('package', 'src/util/u0.go', { directories: ['src/util'] }, 'package')];
    const model = buildStructuralMap(nodes, [edge('a', 'a', 'package'), edge('a2', 'a', 'package'), edge('b', 'b', 'package')]);
    assert.deepEqual(model.flows, [{ source: 'folder:src', target: 'folder:src/util', count: 2, sourceFiles: ['src/a.go', 'src/b.go'], label: '2개 파일 사용' }]);
});
test('wide folder trees fold to at most nine chunks without losing descendants', () => {
    const nodes = Array.from({ length: 18 }, (_, i) => node(`m${i}`, `src/feature${i}/index.ts`));
    const model = buildStructuralMap(nodes, []);
    assert(model.rootStageIds.length <= 9);
    const roots = model.stages.filter(s => model.rootStageIds.includes(s.id));
    assert.deepEqual(new Set(roots.flatMap(s => s.descendantNodeIds)), new Set(nodes.map(n => n.id)));
    assert(roots.some(s => s.childIds.length === 18));
});
test('most connected chunk is selected before isolated folders', () => {
    const model = buildStructuralMap([node('bin', 'bin/a.go'), node('app', 'src/a.go'), node('util', 'src/util/a.go')], [edge('i', 'app', 'util')]);
    assert.equal(model.defaultStage, 'folder:src');
});
test('deterministic descriptions prefer module prose, then local README, then public names', () => {
    const publicNode = node('n', 'src/a.go', { publicNames: [{ name: 'Search', uses: 7 }, { name: 'Parse', uses: 3 }] });
    const readme = node('readme', 'src/README.md', { sourceDescription: { text: 'Searchable input records. Extra sentence.', kind: 'readme' } }, 'document');
    assert.equal(structuralSummary([publicNode], [], 'src'), '공개 이름: Search · Parse');
    assert.equal(structuralSummary([publicNode], [readme], 'src'), 'Searchable input records.');
    assert.equal(structuralSummary([{ ...publicNode, attributes: { sourceDescription: { text: 'Package search matches input.', kind: 'module-doc' } } }], [readme], 'src'), 'Package search matches input.');
});

test('namespaces spanning folders remain logical packages instead of claiming every folder is used', () => {
    const nodes = [node('a', 'app/A.cs'), node('b', 'one/B.cs'), node('c', 'two/C.cs'), node('pkg', 'one/B.cs', { directories: ['one', 'two'], packageName: 'Shared' }, 'package')];
    const model = buildStructuralMap(nodes, [edge('i', 'a', 'pkg')]);
    assert.deepEqual(model.flows.map(f => [f.target, f.count]), [['folder:패키지 Shared', 1]]);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:패키지 Shared').nodeIds, ['pkg']);
});
test('parent folders retain only their direct modules when children are separately visible', () => {
    const model = buildStructuralMap([node('root', 'main.go'), node('src', 'src/main.go'), node('util', 'src/util/util.go')], []);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:.').nodeIds, ['root']);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:src').nodeIds, ['src']);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:src/util').nodeIds, ['util']);
});

test('declaration descriptions do not masquerade as folder purpose', () => {
    const module = node('a', 'src/a.go', { sourceDescription: { text: 'ConcurrentSet stores values.', kind: 'declaration-doc' }, publicNames: [{ name: 'Run', uses: 4 }] });
    assert.equal(structuralSummary([module], [], 'src'), '공개 이름: Run');
    const model = buildStructuralMap([module], []);
    assert.equal(model.stages[0].summary, '공개 이름: Run');
});

test('thirteen sibling folders preserve connected chunks and aggregate only the remainder', () => {
    const nodes = Array.from({ length: 13 }, (_, i) => node(`m${i}`, `src/feature${i}/index.ts`));
    const edges = Array.from({ length: 7 }, (_, i) => edge(`e${i}`, `m${i}`, `m${i + 1}`));
    const model = buildStructuralMap(nodes, edges);
    assert.equal(model.rootStageIds.length, 9);
    assert(model.rootStageIds.includes('folder:src'));
    assert(model.flows.some(flow => model.rootStageIds.includes(flow.source) && model.rootStageIds.includes(flow.target)));
    assert.equal(model.rootStageIds.filter(id => /feature[0-7]$/.test(id)).length, 8);
    const visible = model.stages.filter(s => model.rootStageIds.includes(s.id));
    const coveredChildren = new Set(visible.filter(s => s.id !== 'folder:src').flatMap(s => s.descendantNodeIds));
    const effective = visible.flatMap(s => s.id === 'folder:src' ? s.descendantNodeIds.filter(id => !coveredChildren.has(id)) : s.descendantNodeIds);
    assert.equal(effective.length, nodes.length);
    assert.equal(new Set(effective).size, nodes.length);
});
