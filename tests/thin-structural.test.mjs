import test from 'node:test';
import assert from 'node:assert/strict';
import * as thin from '../dist/query/thin-structural-model.js';
import { dependencyView, displayedDependencyFlows, dependencyCountLabel } from '../viewer/dependency-layout.js';
const stage = (id, extra = {}) => ({ id, title: id, summary: 'role', unit: 'files', nodeIds: [id], groups: [], incoming: [], outgoing: [], ...extra });
const stages = [stage('a', { childIds: ['a/x'], descendantNodeIds: ['a', 'ax'] }), stage('a/x', { parentId: 'a' }), stage('b'), stage('c')];
const flows = [{ source: 'a/x', target: 'b', label: '', sourceFiles: ['shared.ts', 'a.csproj'], projectSourceFiles: ['a.csproj'] }, { source: 'b', target: 'a/x', label: '', sourceFiles: ['b.ts'] }, { source: 'a/x', target: 'c', label: '', sourceFiles: ['shared.ts'] }, { source: 'b', target: 'c', label: '', sourceFiles: ['shared.ts', 'b.ts'] }];
const model = { stages, flows, rootStageIds: ['a', 'b', 'c'], structural: true, nodes: [], lead: '', statusLabels: { present: '', absent: '', unknown: '' } };
test('summary projection preserves exact root and folded arrow counts without evidence lists', () => {
    assert.equal(typeof thin.thinStructuralOverview, 'function');
    const projected = thin.thinStructuralOverview(model);
    const before = dependencyView(model, model.rootStageIds), after = dependencyView(projected, model.rootStageIds);
    const counts = view => displayedDependencyFlows(view, undefined, true).map(flow => [flow.source, flow.target, flow.count, dependencyCountLabel(flow)]);
    assert.deepEqual(counts(after), counts(before));
    assert.equal(after.stages[0].nodeCount, 2);
    assert.equal(JSON.stringify(projected).includes('shared.ts'), false);
    assert.ok(projected.stages.every(stage => stage.nodeIds.length === 0 && (stage.descendantNodeIds?.length ?? 0) === 0));
    assert.equal(after.flows.find(flow => flow.source === 'a' && flow.target === 'b').projectCount, 1);
});
test('arbitrary expanded levels retain ancestors and exact arrow counts', () => {
    const ids = ['a/x', 'b']; const projected = thin.thinStructuralOverview(model, ids);
    assert.ok(projected.stages.some(stage => stage.id === 'a'));
    assert.deepEqual(dependencyView(projected, ids).flows.map(f => [f.source, f.target, f.count]), dependencyView(model, ids).flows.map(f => [f.source, f.target, f.count]));
    assert.equal(projected.stages.find(stage => stage.id === 'a/x').parentId, 'a');
});
test('manifest root pages match twelve-to-twenty-four card pagination and all-scope identities', () => {
    const roots = Array.from({ length: 13 }, (_, i) => `manifest:p${i}`), allRoots = roots.map(id => 'all:' + id);
    const stages = [...roots, ...allRoots].map(id => stage(id));
    const source = { ...model, stages, flows: [{ source: roots[0], target: roots[12], label: '', sourceFiles: ['one.ts'] }, { source: allRoots[0], target: allRoots[12], label: '', sourceFiles: ['one.ts'] }], rootStageIds: roots, structuralScope: { default: 'production', productionCount: 13, auxiliaryCount: 0, allRootStageIds: allRoots, allDefaultStage: allRoots[0] } };
    const summary = thin.thinStructuralOverview(source);
    assert.deepEqual(summary.structuralDependencyPages.map(page => page.stageIds.length), [13, 13]);
    assert.deepEqual(dependencyView(summary, roots).flows.map(f => f.count), [1]);
    assert.deepEqual(dependencyView(summary, allRoots).flows.map(f => f.count), [1]);
});
test('a visible parent count excludes visible child membership before identities are stripped', () => {
    const source = { ...model, stages: [stage('a', { childIds: ['a/x'], descendantNodeIds: ['a', 'a/x'] }), stage('a/x', { parentId: 'a' })], flows: [] };
    const ids = ['a', 'a/x'], summary = thin.thinStructuralOverview(source, ids);
    assert.deepEqual(dependencyView(summary, ids).stages.map(stage => stage.nodeCount), [1, 1]);
});

test('reused projector indexes unrelated stages and flows only once across pages', () => {
    let stageReads = 0, flowReads = 0;
    const stages = Array.from({ length: 400 }, (_, i) => {
        const value = stage(`p${i}`);
        Object.defineProperty(value, 'id', { enumerable: true, get() { stageReads++; return `p${i}`; } });
        return value;
    });
    const flows = Array.from({ length: 200 }, (_, i) => {
        const value = { target: `p${i * 2 + 1}`, label: '', sourceFiles: [`file${i}`] };
        Object.defineProperty(value, 'source', { enumerable: true, get() { flowReads++; return `p${i * 2}`; } });
        return value;
    });
    const source = { ...model, stages, flows, rootStageIds: [] };
    assert.equal(typeof thin.createStructuralOverviewProjector, 'function');
    const project = thin.createStructuralOverviewProjector(source);
    stageReads = 0; flowReads = 0;
    for (let i = 0; i < 200; i++) {
        const result = project([`p${i * 2}`, `p${i * 2 + 1}`]);
        assert.equal(result.structuralDependencyPages[0].flows[0].count, 1);
    }
    assert.ok(stageReads < 12000, `stage reads ${stageReads}`);
    assert.ok(flowReads < 2000, `flow reads ${flowReads}`);
});
