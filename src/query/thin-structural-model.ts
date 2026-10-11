import type { LoopMap, LoopFlow, LoopStage, LoopDependencyPage } from './loop-map-types.js';
import { displayedFlowProjection, projectedDependencyRelations } from './structural-dependency-groups.js';
const compactFlow = (flow: LoopFlow): LoopFlow => {
    const { sourceFiles, projectSourceFiles, ...rest } = flow;
    return { ...rest, count: sourceFiles ? new Set(sourceFiles).size : flow.count ?? 0, projectCount: projectSourceFiles ? new Set(projectSourceFiles).size : flow.projectCount ?? 0 };
};
/** Source membership remains in the deferred full model; first-screen counts are computed before stripping it. */
export function thinStructuralOverview(model: LoopMap, visibleIds?: readonly string[]): LoopMap {
    return createStructuralOverviewProjector(model)(visibleIds);
}
/** Reuse tree and adjacency indexes when exporting many independently loaded pages. */
export function createStructuralOverviewProjector(model: LoopMap): (visibleIds?: readonly string[]) => LoopMap {
    if (!model.structural) return () => model;
    const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    const stageOrder = new Map(model.stages.map((stage, index) => [stage.id, index]));
    const flowOrder = new Map(model.flows.map((flow, index) => [flow, index]));
    const children = new Map<string, string[]>(), adjacent = new Map<string, Set<LoopFlow>>(), cycles = new Map<string, Set<readonly string[]>>();
    for (const stage of model.stages) if (stage.parentId) {
        const list = children.get(stage.parentId) ?? []; list.push(stage.id); children.set(stage.parentId, list);
    }
    for (const flow of model.flows) for (const id of [flow.source, flow.target]) {
        const list = adjacent.get(id) ?? new Set<LoopFlow>(); list.add(flow); adjacent.set(id, list);
    }
    for (const cycle of model.verifiedCycleStageGroups ?? []) for (const id of cycle) {
        const list = cycles.get(id) ?? new Set<readonly string[]>(); list.add(cycle); cycles.set(id, list);
    }
    const packageOverview = model.stages.some(stage => stage.id.startsWith('manifest:') || stage.id.startsWith('manifest-folder:'));
    const compactStages = new Map<string, LoopStage>();
    const compactStage = (stage: LoopStage): LoopStage => {
        let result = compactStages.get(stage.id);
        if (!result) { result = { ...stage, nodeCount: stage.nodeIds.length, descendantNodeCount: (stage.descendantNodeIds ?? stage.nodeIds).length, nodeIds: [], descendantNodeIds: [], groups: [], incoming: [], outgoing: [] }; compactStages.set(stage.id, result); }
        return result;
    };
    const compactGroups = model.structuralDependencyGroups?.map(group => ({ ...group, nodeIds: [] })) ?? [];
    const relationsFor = (ids: readonly string[]) => {
        const relevant = new Set<string>(), flows = new Set<LoopFlow>(), verified = new Set<readonly string[]>(), pending = [...ids];
        while (pending.length) {
            const id = pending.pop(); if (!id || relevant.has(id)) continue; relevant.add(id);
            for (const child of children.get(id) ?? []) pending.push(child);
            for (const flow of adjacent.get(id) ?? []) flows.add(flow);
            for (const cycle of cycles.get(id) ?? []) verified.add(cycle);
        }
        for (const id of [...relevant]) { let parent = byId.get(id)?.parentId; while (parent && !relevant.has(parent)) { relevant.add(parent); parent = byId.get(parent)?.parentId; } }
        return projectedDependencyRelations([...relevant].flatMap(id => byId.get(id) ?? []), [...flows].sort((a, b) => (flowOrder.get(a) ?? 0) - (flowOrder.get(b) ?? 0)), ids, [...verified]);
    };
    return (visibleIds?: readonly string[]): LoopMap => {
        const sets = visibleIds ? [visibleIds] : [model.rootStageIds ?? [], model.structuralScope?.allRootStageIds ?? []];
        const kept = new Set<string>([...(model.rootStageIds ?? []), ...(model.structuralScope?.allRootStageIds ?? []), ...(visibleIds ?? [])]);
        for (const id of [...kept]) { let parent = byId.get(id)?.parentId; while (parent && !kept.has(parent)) { kept.add(parent); parent = byId.get(parent)?.parentId; } }
        const pages: LoopDependencyPage[] = [];
        const rootsFlows = new Map<string, LoopFlow>();
        for (const ids of sets) {
            if (!ids.length) continue;
            const relations = relationsFor(ids);
            const size = visibleIds ? ids.length : packageOverview ? Math.max(12, Math.min(24, ids.length)) : 9;
            for (let offset = 0; offset < ids.length; offset += size) {
                const selected = ids.slice(offset, offset + size), visible = new Set(selected), stages = selected.flatMap(id => byId.get(id) ?? []);
                const flows = relations.flows.filter(flow => visible.has(flow.source) && visible.has(flow.target));
                const relatedFlows = relations.flows.filter(flow => visible.has(flow.source) || visible.has(flow.target));
                const actualCycles = relations.actualCycles.map(cycle => cycle.filter(id => visible.has(id))).filter(cycle => cycle.length > 1);
                const nodeCounts = Object.fromEntries(stages.map(stage => {
                    const nested = stages.filter(other => { let parent = other.parentId; while (parent) { if (parent === stage.id) return true; parent = byId.get(parent)?.parentId; } return false; });
                    const covered = new Set(nested.flatMap(other => other.descendantNodeIds ?? other.nodeIds));
                    return [stage.id, (stage.descendantNodeIds ?? stage.nodeIds).filter(id => !covered.has(id)).length];
                }));
                pages.push({ stageIds: selected, nodeCounts, flows: flows.map(compactFlow), relatedFlows: relatedFlows.map(compactFlow), actualCycles, displayFlows: displayedFlowProjection({ stages, flows, actualCycles }).map(compactFlow) });
            }
            for (const flow of relations.flows) rootsFlows.set(JSON.stringify([flow.source, flow.target]), compactFlow(flow));
        }
        const stages = [...kept].sort((a, b) => (stageOrder.get(a) ?? 0) - (stageOrder.get(b) ?? 0)).flatMap(id => { const stage = byId.get(id); return stage ? [compactStage(stage)] : []; });
        return { ...model, structuralProjection: 'summary', structuralDependencyPages: pages, stages, flows: [...rootsFlows.values()], nodes: [], structuralDependencyGroups: compactGroups, verifiedCycleStageGroups: pages.flatMap(page => page.actualCycles) };
    };
}
