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
    assert.equal(dependencyBandHeight(5, 1100), 88);
    const label = { x: 310, y: 158, width: 92, height: 20 };
    const card = { x: 170, y: 206, width: 368, height: 102 };
    const points = orthogonalRoute({ x: 416, y: 168 }, { x: 352, y: 192 }, { width: 1100, height: 500, obstacles: [label, card] });
    assert.ok(points.length > 1);
});
