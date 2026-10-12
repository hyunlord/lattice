import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseMobileDependencyLayout } from '../viewer/dependency-layout.js';
const candidate = (columns, gap, height, routed, required = 12) => ({ columns, gap, height, routed, required });
test('mobile fit chooses all required directions inside viewport before a shorter incomplete drawing', () => {
    const good = candidate(3, 32, 440, 12);
    assert.equal(chooseMobileDependencyLayout([candidate(3, 24, 390, 11), good, candidate(2, 48, 700, 12)], 500), good);
});
test('a long chain remains an explicit viewport failure even when every direction routes', () => {
    const tall = candidate(2, 32, 1100, 12);
    const result = chooseMobileDependencyLayout([tall], 500);
    assert.equal(result, tall);
    assert.ok(result.height > 500);
});
test('high fanout and SCC obstruction do not turn fewer routed edges into a fit', () => {
    const obstructed = candidate(3, 32, 300, 10);
    const complete = candidate(2, 48, 650, 12);
    assert.equal(chooseMobileDependencyLayout([obstructed, complete], 500), complete);
});
test('equal valid layouts preserve deterministic order and empty candidates remain absent', () => {
    const first = candidate(3, 32, 400, 12);
    assert.equal(chooseMobileDependencyLayout([first, candidate(2, 32, 400, 12)], 500), first);
    assert.equal(chooseMobileDependencyLayout([], 500), undefined);
});
test('compact names keep distinct package identity when suffixes collide', async () => {
    const { compactDependencyLabels } = await import('../viewer/dependency-layout.js');
    const stages = ['@scope/common', '@scope/view', '@other/common'].map(id => ({ id, title: id }));
    const names = compactDependencyLabels(stages);
    assert.deepEqual([...names.values()].map(label => label.prefix + label.name), stages.map(stage => stage.title));
    assert.equal(new Set([...names.values()].map(label => `${label.prefix}|${label.name}`)).size, 3);
});
test('compact endpoints retain whole mutual groups and keep unrelated packages in the full model', async () => {
    const { mobileDependencyStageIds } = await import('../viewer/dependency-layout.js');
    const stages = ['manifest:a', 'manifest:b', 'manifest:c', 'manifest:unused'].map(id => ({ id, title: id, nodeIds: [], groups: [], incoming: [], outgoing: [] }));
    const view = { stages, flows: [{ source: stages[0].id, target: stages[1].id, count: 4 }, { source: stages[1].id, target: stages[2].id, count: 1 }, { source: stages[2].id, target: stages[1].id, count: 1 }] };
    assert.deepEqual([...mobileDependencyStageIds(view, [view.flows[0]])].sort(), stages.slice(0, 3).map(s => s.id));
    assert.equal(view.stages.length, 4);
    assert.equal(mobileDependencyStageIds(view, []).size, 4);
});
test('long common prefixes are explicit and reconstruct each original package name', async () => {
    const { compactDependencyLabels } = await import('../viewer/dependency-layout.js');
    const stages = ['namespace-example-reader', 'namespace-example-writer', 'root'].map(id => ({ id, title: id }));
    const labels = compactDependencyLabels(stages);
    for (const stage of stages) { const label = labels.get(stage.id); assert.equal(label.prefix + label.name, stage.title); }
    assert.equal(labels.get(stages[0].id).prefix, 'namespace-example-');
    assert.equal(labels.get('root').prefix, '');
});
test('out-of-viewport path or unreadable label never qualifies through node count alone', () => {
    const invalid = { ...candidate(3, 32, 200, 12), contained: false };
    const readable = { ...candidate(2, 32, 400, 12), contained: true };
    assert.equal(chooseMobileDependencyLayout([invalid, readable], 500), readable);
});

test('a package name equal to a shared prefix does not become an empty label', async () => {
    const { compactDependencyLabels } = await import('../viewer/dependency-layout.js');
    const stages = ['scope/', 'scope/a', 'scope/b'].map(id => ({ id, title: id }));
    for (const label of compactDependencyLabels(stages).values()) assert.notEqual(label.name, '');
});

test('compact routing reserves short local directions before long fan-in without changing selected identities', async () => {
    const { mobileDependencyRouteOrder } = await import('../viewer/dependency-package-arrows.js');
    const flows = [{ source: 'far', target: 'sink' }, { source: 'near', target: 'sink' }];
    const boxes = new Map([['far', { x: 20, y: 20, width: 120, height: 44 }], ['near', { x: 20, y: 300, width: 120, height: 44 }], ['sink', { x: 20, y: 400, width: 260, height: 44 }]]);
    assert.deepEqual(mobileDependencyRouteOrder(flows, boxes), [flows[1], flows[0]]);
    assert.deepEqual(flows.map(flow => flow.source), ['far', 'near']);
});

test('ten-source mobile fan-in retains each directed path and count label in a bounded two-column channel', async () => {
    const { routePackageDependencies, mobileDependencyRouteOrder } = await import('../viewer/dependency-package-arrows.js');
    const boxes = new Map(Array.from({ length: 10 }, (_, index) => [`source-${index}`, { x: index % 2 ? 195 : 16, y: 56 + Math.floor(index / 2) * 100, width: 123, height: 44 }]));
    boxes.set('target', { x: 16, y: 556, width: 302, height: 44 });
    boxes.set('caption', { x: 16, y: 24, width: 302, height: 16 });
    const flows = Array.from({ length: 10 }, (_, index) => ({ source: `source-${index}`, target: 'target', count: 2, weight: 1 }));
    const routes = routePackageDependencies(mobileDependencyRouteOrder(flows, boxes), boxes, 334, 624, () => 22);
    assert.equal(routes.length, 10);
    assert.equal(new Set(routes.map(route => route.flow.source)).size, 10);
    assert.ok(routes.every(route => route.labelBox.y + route.labelBox.height <= 624));
});
