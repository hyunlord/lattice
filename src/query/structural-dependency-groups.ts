import type { LoopDependencyGroup, LoopFlow, LoopStage } from './loop-map-types.js';

type Structure = { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly verifiedCycleStageGroups?: readonly (readonly string[])[]; };
export function projectedDependencyRelations(stages: readonly LoopStage[], flows: readonly LoopFlow[], ids: readonly string[], verifiedCycles: readonly (readonly string[])[] = []) {
    const byId = new Map(stages.map(stage => [stage.id, stage]));
    const visible = new Set(ids);
    const ancestor = (id: string): string | undefined => {
        let current: string | undefined = id;
        while (current) { if (visible.has(current)) return current; current = byId.get(current)?.parentId; }
        return undefined;
    };
    const groups = new Map<string, { source: string; target: string; files: Set<string>; projectFiles: Set<string>; }>();
    for (const flow of flows) {
        const source = ancestor(flow.source) ?? flow.source, target = ancestor(flow.target) ?? flow.target;
        if (!source || !target || source === target) continue;
        const key = JSON.stringify([source, target]);
        const group = groups.get(key) ?? { source, target, files: new Set<string>(), projectFiles: new Set<string>() };
        for (const file of flow.sourceFiles ?? []) group.files.add(file);
        for (const file of flow.projectSourceFiles ?? []) group.projectFiles.add(file);
        groups.set(key, group);
    }
    const projected: LoopFlow[] = [...groups.values()].map(group => ({ source: group.source, target: group.target, count: group.files.size, sourceFiles: [...group.files].sort(), projectSourceFiles: [...group.projectFiles].sort(), label: group.projectFiles.size ? `${group.files.size - group.projectFiles.size}개 파일 · 프로젝트 선언 ${group.projectFiles.size}개` : `${group.files.size}개 파일` }));
    const actualCycles = verifiedCycles.map(cycle => [...new Set(cycle.flatMap(id => ancestor(id) ?? []))]).filter(cycle => cycle.length > 1);
    return { flows: projected.filter(flow => visible.has(flow.source) && visible.has(flow.target)), relatedFlows: projected, actualCycles };
}
export function dependencyComponents(view: { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly actualCycles?: readonly (readonly string[])[]; }) {
    const adjacency = new Map<string, string[]>();
    for (const flow of view.flows) adjacency.set(flow.source, [...adjacency.get(flow.source) ?? [], flow.target]);
    const reachable = new Map<string, Set<string>>();
    for (const stage of view.stages) {
        const pending = [stage.id], seen = new Set<string>();
        while (pending.length) { const id = pending.pop(); if (!id || seen.has(id)) continue; seen.add(id); pending.push(...adjacency.get(id) ?? []); }
        reachable.set(stage.id, seen);
    }
    const assigned = new Set<string>();
    const groups = view.stages.flatMap(stage => {
        if (assigned.has(stage.id)) return [];
        const members = view.stages.filter(other => reachable.get(stage.id)?.has(other.id) && reachable.get(other.id)?.has(stage.id));
        members.forEach(other => assigned.add(other.id));
        const cyclic = members.length > 1 && (view.actualCycles?.some(cycle => members.every(member => cycle.includes(member.id))) ?? false);
        return [{ stages: members, cyclic, foldedCycle: members.length > 1 && !cyclic, level: 0 }];
    });
    const owner = new Map(groups.flatMap((group, index) => group.stages.map(stage => [stage.id, index] as const)));
    for (let iteration = 0; iteration < groups.length; iteration++) for (const flow of view.flows) {
        const a = owner.get(flow.source), b = owner.get(flow.target), source = a === undefined ? undefined : groups[a], target = b === undefined ? undefined : groups[b];
        if (source && target && a !== b) target.level = Math.max(target.level, source.level + 1);
    }
    return groups.sort((a, b) => a.level - b.level);
}
/** Identities belong to actual projected groups, never to an arbitrary representative folder. */
export function overviewDependencyGroups(model: Structure & { readonly rootStageIds: readonly string[]; readonly structuralScope: { readonly allRootStageIds: readonly string[]; }; }, requestedScope?: 'production' | 'all'): readonly LoopDependencyGroup[] {
    const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    return (requestedScope ? [requestedScope] : ['production', 'all'] as const).flatMap(scope => {
        const roots = scope === 'all' ? model.structuralScope.allRootStageIds : model.rootStageIds;
        const groups: LoopDependencyGroup[] = [];
        for (let page = 0; page < roots.length; page += 9) {
            const ids = roots.slice(page, page + 9), stages = ids.flatMap(id => byId.get(id) ?? []);
            const relations = projectedDependencyRelations(model.stages, model.flows, ids, model.verifiedCycleStageGroups);
            for (const component of dependencyComponents({ stages, ...relations })) {
                if (component.stages.length < 2) continue;
                const stageIds = component.stages.map(stage => stage.id).sort();
                const nodeIds = [...new Set(component.stages.flatMap(stage => stage.descendantNodeIds ?? stage.nodeIds))].sort();
                groups.push({ id: `overview:${scope}:group:${JSON.stringify(stageIds)}`, scope, stageIds, nodeIds, folded: component.foldedCycle });
            }
        }
        return groups;
    });
}
