import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyLevels, dependencyView, orthogonalRoute } from '../viewer/dependency-layout.js';

const stage = (id, parentId, nodeIds = []) => ({ id, title: id, summary: '', unit: '모듈', nodeIds, descendantNodeIds: nodeIds, groups: [], incoming: [], outgoing: [], ...(parentId ? { parentId } : {}) });
test('folded dependency counts distinct importing files and excludes visible descendant membership', () => {
    const root = { ...stage('folder:.'), descendantNodeIds: ['main', 'a', 'b'] };
    const src = { ...stage('folder:src', 'folder:.', ['a']), descendantNodeIds: ['a', 'b'] };
    const util = stage('folder:src/util', 'folder:src', ['b']);
    const model = { stages: [root, src, util], flows: [{ source: src.id, target: util.id, sourceFiles: ['src/a.go', 'src/a.go'] }] };
    const visible = dependencyView(model, [root.id, src.id, util.id]);
    assert.deepEqual(visible.stages.map(s => s.nodeIds), [['main'], ['a'], ['b']]);
    assert.equal(visible.flows[0].count, 1);
});
test('dependency layering condenses actual cycles without treating unrelated siblings as a ring', () => {
    const stages = ['app', 'api', 'core', 'util'].map(id => stage(id));
    const flows = [{ source: 'app', target: 'api' }, { source: 'api', target: 'core' }, { source: 'core', target: 'api' }, { source: 'core', target: 'util' }];
    const layers = dependencyLevels({ stages, flows });
    assert.deepEqual(layers.map(g => [g.stages.map(s => s.id), g.level, g.cyclic]), [[['app'], 0, false], [['api', 'core'], 1, true], [['util'], 2, false]]);
});
test('orthogonal dependency route goes around labels and boxes instead of crossing them', () => {
    const obstacle = { x: 40, y: 24, width: 40, height: 64 };
    const points = orthogonalRoute({ x: 16, y: 48 }, { x: 112, y: 48 }, { width: 128, height: 128, obstacles: [obstacle] });
    assert.ok(points.length >= 4);
    for (let index = 1; index < points.length; index++) { const a = points[index - 1], b = points[index]; assert.ok(a.x === b.x || a.y === b.y); for (let t = 0; t <= 1; t += .01) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; assert.ok(!(x > 40 && x < 80 && y > 24 && y < 88)); } }
});
test('an off-page dependency stays in the selected chunk explanation', () => {
    const stages = [stage('folder:src'), ...Array.from({ length: 18 }, (_, i) => stage(`folder:src/feature${i}`, 'folder:src', [`module${i}`]))];
    const flows = [{ source: 'folder:src/feature0', target: 'folder:src/feature9', sourceFiles: ['src/feature0/index.ts'] }];
    const view = dependencyView({ stages, flows }, stages.slice(1, 10).map(s => s.id));
    assert.equal(view.flows.length, 0);
    assert.deepEqual(view.stages[0].outgoing, [{ name: 'folder:src/feature9', description: '1개 파일이 사용: index.ts' }]);
});
test('dense maps disclose a selected neighborhood and can restore every dependency', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const flows = Array.from({ length: 18 }, (_, index) => ({ source: `source${index}`, target: 'foundation', sourceFiles: [`source${index}.ts`] }));
    const view = { stages: [], flows };
    assert.equal(displayedDependencyFlows(view, 'source4', false).length, 1);
    assert.equal(displayedDependencyFlows(view, 'source4', true).length, 18);
    assert.equal(displayedDependencyFlows({ stages: [], flows: flows.slice(0, 7) }, 'source4', false).length, 7);
});
test('label bands leave a free routing cell between a rounded label and the next card', async () => {
    const { dependencyBandHeight } = await import('../viewer/dependency-layout.js');
    assert.equal(dependencyBandHeight(5, 1100), 136);
    const label = { x: 310, y: 158, width: 92, height: 20 };
    const card = { x: 170, y: 206, width: 368, height: 102 };
    const points = orthogonalRoute({ x: 416, y: 168 }, { x: 352, y: 192 }, { width: 1100, height: 500, obstacles: [label, card] });
    assert.ok(points.length > 1);
});

test('dependency labels distinguish identical leaf names and ports stay separate', async () => {
    const { uniqueDependencyNames, dependencyPort, reserveDependencyRoute } = await import('../viewer/dependency-layout.js');
    const names = uniqueDependencyNames([{ id: 'a', title: 'src/main/nodes' }, { id: 'b', title: 'src/test/nodes' }, { id: 'c', title: 'src/parser' }]);
    assert.deepEqual([...names.values()], ['main/nodes', 'test/nodes', 'parser']);
    const box = { x: 24, y: 24, width: 160, height: 80 }; assert.equal(new Set(Array.from({ length: 8 }, (_, i) => dependencyPort(box, i, 8))).size, 8);
    const occupied = new Set(); reserveDependencyRoute([{ x: 16, y: 48 }, { x: 112, y: 48 }], 128, occupied);
    const route = orthogonalRoute({ x: 16, y: 48 }, { x: 112, y: 48 }, { width: 128, height: 128, obstacles: [], occupied });
    assert.ok(route.some(point => point.y !== 48));
});

test('every dependency label names its endpoints and count without tracing a shared path', async () => {
    const { dependencyLabelLines } = await import('../viewer/dependency-layout.js');
    const stages = [{ id: 'a', title: 'source' }, { id: 'b', title: 'test/helpers' }, { id: 'c', title: 'long-package-name-with-many-characters' }];
    const labels = dependencyLabelLines({ stages, flows: [{ source: 'a', target: 'b', label: '28개 파일' }, { source: 'a', target: 'c', label: '1개 파일' }] });
    assert.deepEqual(labels.get('["a","b"]'), ['source → helpers', '28개 파일']);
    assert.deepEqual(labels.get('["a","c"]'), ['source', '→ long-package-name-with-many-characters', '1개 파일']);
});

test('fractional card bounds preserve the free grid corridor beside a label', () => {
    for (const fixture of [
        { start: { x: 232, y: 224 }, end: { x: 160, y: 240 }, label: { x: 22, y: 206, width: 196, height: 32 }, card: { x: 12, y: 255.25, width: 310, height: 172.34375 } },
        { start: { x: 232, y: 1664 }, end: { x: 168, y: 1968 }, label: { x: 22, y: 1934, width: 196, height: 32 }, card: { x: 12, y: 1981.34375, width: 310, height: 115.25 } }
    ]) {
        const route = orthogonalRoute(fixture.start, fixture.end, { width: 334, height: 2200, obstacles: [fixture.label, fixture.card] });
        assert.ok(route.length > 1);
        for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i]; for (let t = 0; t <= 1; t += .01)for (const obstacle of [fixture.label, fixture.card]) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; assert.ok(!(x > obstacle.x && x < obstacle.x + obstacle.width && y > obstacle.y && y < obstacle.y + obstacle.height)); } }
    }
});

test('a long label affects only the dependency gap that contains it', async () => {
    const { dependencyLabelLines, dependencyLabelRowHeight } = await import('../viewer/dependency-layout.js');
    const short = { source: 'a', target: 'b', label: '7개 파일' }, long = { source: 'b', target: 'c', label: '1개 파일' };
    const lines = dependencyLabelLines({ stages: [{ id: 'a', title: 'test' }, { id: 'b', title: 'src' }, { id: 'c', title: 'long-namespace-with-many-characters' }], flows: [short, long] });
    assert.equal(dependencyLabelRowHeight([short], lines), 48);
    assert.equal(dependencyLabelRowHeight([long], lines), 64);
});

test('folding independent one-way imports does not claim an original cycle', () => {
    const stages = [stage('a'), stage('a/x', 'a'), stage('a/y', 'a'), stage('b'), stage('b/x', 'b'), stage('b/y', 'b')];
    const flows = [{ source: 'a/x', target: 'b/x', sourceFiles: ['a/x.ts'] }, { source: 'b/y', target: 'a/y', sourceFiles: ['b/y.ts'] }];
    const folded = dependencyLevels(dependencyView({ stages, flows }, ['a', 'b']));
    assert.equal(folded[0].cyclic, false); assert.equal(folded[0].foldedCycle, true);
    const actual = dependencyLevels(dependencyView({ stages, flows: [...flows, { source: 'b/x', target: 'a/x', sourceFiles: ['b/x.ts'] }] }, ['a', 'b']));
    assert.equal(actual[0].cyclic, true); assert.equal(actual[0].foldedCycle, false);
});
test('project-wide declarations remain distinct from importing files after folding', () => {
    const stages = [stage('a'), stage('a/x', 'a'), stage('b')];
    const flows = [{ source: 'a/x', target: 'b', sourceFiles: ['a/use.cs', 'a/GlobalUsings.cs'], projectSourceFiles: ['a/GlobalUsings.cs'] }];
    const view = dependencyView({ stages, flows }, ['a', 'b']); assert.equal(view.flows[0].count, 2);
    assert.equal(view.flows[0].label, '1개 파일 · 프로젝트 선언 1개');
    assert.match(view.stages[0].outgoing[0].description, /1개 파일이 사용: use.cs · 프로젝트 공통 선언 1개: GlobalUsings.cs/);
});

test('namespace identity keeps its specific category over the generic package label', async () => {
    const { label } = await import('../viewer/loop-map-shared.js');
    assert.equal(label({ kind: 'package', kindLabel: '네임스페이스' }, { context: { kindLabel: () => '패키지' } }), '네임스페이스');
});

test('shared folder prefixes stop at the first distinct path segment', async () => {
    const { sharedFolderPrefix, dependencyBandHeight } = await import('../viewer/dependency-layout.js');
    assert.equal(sharedFolderPrefix(['src/Serilog/Core', 'src/Serilog/Settings/KeyValuePairs']), 'src/Serilog');
    assert.equal(sharedFolderPrefix(['src/alpha/shared/a', 'src/beta/shared/b']), 'src');
    assert.equal(sharedFolderPrefix(['src/only']), '');
    assert.ok(dependencyBandHeight(0, 1100) >= 32, 'a skipped-level target port needs a free corridor');
});
