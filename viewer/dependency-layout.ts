import type { LoopFlow, LoopMap, LoopStage } from './loop-map-types.js';

export type DependencyView = { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; };
export function dependencyView(model: LoopMap, ids: readonly string[]): DependencyView {
    const stages = ids.flatMap(id => { const stage = model.stages.find(item => item.id === id); return stage ? [stage] : []; });
    const stageById = new Map(model.stages.map(stage => [stage.id, stage]));
    const ancestor = (id: string): string | undefined => {
        let current: string | undefined = id;
        while (current) { if (ids.includes(current)) return current; current = stageById.get(current)?.parentId; }
        return undefined;
    };
    const groups = new Map<string, { source: string; target: string; files: Set<string>; }>();
    for (const flow of model.flows) {
        const source = ancestor(flow.source) ?? flow.source, target = ancestor(flow.target) ?? flow.target;
        if (!source || !target || source === target) continue;
        const key = JSON.stringify([source, target]); const group = groups.get(key) ?? { source, target, files: new Set<string>() };
        for (const file of flow.sourceFiles ?? []) group.files.add(file); groups.set(key, group);
    }
    const flows = [...groups.values()].map(group => ({ source: group.source, target: group.target, count: group.files.size, sourceFiles: [...group.files].sort(), label: `${group.files.size}개 파일` }));
    const effective = stages.map(stage => {
        const nested = stages.filter(other => { let parent = other.parentId; while (parent) { if (parent === stage.id) return true; parent = stageById.get(parent)?.parentId; } return false; });
        const covered = new Set(nested.flatMap(other => other.descendantNodeIds ?? other.nodeIds));
        const nodeIds = (stage.descendantNodeIds ?? stage.nodeIds).filter(id => !covered.has(id));
        const related = (direction: 'incoming' | 'outgoing') => flows.filter(flow => (direction === 'incoming' ? flow.target : flow.source) === stage.id).map(flow => ({ name: stageById.get(direction === 'incoming' ? flow.source : flow.target)?.title ?? '', description: `${flow.count}개 파일이 사용: ${flow.sourceFiles.map(file => file.split('/').at(-1)).join(', ')}` }));
        return { ...stage, nodeIds, groups: [{ title: '모듈', items: nodeIds.map(id => ({ id })) }], incoming: related('incoming'), outgoing: related('outgoing') };
    });
    return { stages: effective, flows: flows.filter(flow => ids.includes(flow.source) && ids.includes(flow.target)) };
}

export type Point = { readonly x: number; readonly y: number; };
export type Obstacle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
export type RouteSpace = { readonly width: number; readonly height: number; readonly obstacles: readonly Obstacle[]; };
export function orthogonalRoute(start: Point, end: Point, space: RouteSpace): readonly Point[] {
    const step = 8; const columns = Math.ceil(space.width / step) + 1, rows = Math.ceil(space.height / step) + 1;
    const cell = (p: Point) => Math.round(p.y / step) * columns + Math.round(p.x / step);
    const point = (index: number): Point => ({ x: index % columns * step, y: Math.floor(index / columns) * step });
    const from = cell(start), to = cell(end); const blocked = new Uint8Array(columns * rows);
    for (const box of space.obstacles) for (let y = Math.max(0, Math.floor(box.y / step)); y <= Math.min(rows - 1, Math.ceil((box.y + box.height) / step)); y++) for (let x = Math.max(0, Math.floor(box.x / step)); x <= Math.min(columns - 1, Math.ceil((box.x + box.width) / step)); x++) blocked[y * columns + x] = 1;
    blocked[from] = 0; blocked[to] = 0;
    const queue = [from], previous = new Map<number, number>(); previous.set(from, from);
    for (let index = 0; index < queue.length && !previous.has(to); index++) {
        const current = queue[index]; if (current === undefined) continue;
        const x = current % columns, y = Math.floor(current / columns);
        const neighbors = [x > 0 ? current - 1 : -1, x < columns - 1 ? current + 1 : -1, y > 0 ? current - columns : -1, y < rows - 1 ? current + columns : -1].filter(n => n >= 0 && !blocked[n] && !previous.has(n));
        neighbors.sort((a, b) => { const p = point(a), q = point(b); return Math.abs(p.x - end.x) + Math.abs(p.y - end.y) - Math.abs(q.x - end.x) - Math.abs(q.y - end.y); });
        for (const next of neighbors) { previous.set(next, current); queue.push(next); }
    }
    if (!previous.has(to)) return [];
    const reversed: Point[] = []; let current = to;
    while (current !== from) { reversed.push(point(current)); const prior = previous.get(current); if (prior === undefined) return []; current = prior; }
    reversed.push(point(from)); const route = [start, ...reversed.reverse(), end];
    return route.filter((p, index) => { const before = route[index - 1], after = route[index + 1]; return !before || !after || (before.x !== p.x || p.x !== after.x) && (before.y !== p.y || p.y !== after.y); });
}

export function dependencyLevels(view: DependencyView): readonly { readonly stages: readonly LoopStage[]; readonly cyclic: boolean; readonly level: number; }[] {
    const reaches = (start: string, target: string): boolean => {
        const pending = [start], seen = new Set<string>();
        while (pending.length) { const id = pending.pop(); if (!id || seen.has(id)) continue; seen.add(id); for (const flow of view.flows.filter(flow => flow.source === id)) { if (flow.target === target) return true; pending.push(flow.target); } }
        return false;
    };
    const assigned = new Set<string>(); const groups = view.stages.flatMap(stage => {
        if (assigned.has(stage.id)) return [];
        const stages = view.stages.filter(other => other.id === stage.id || reaches(stage.id, other.id) && reaches(other.id, stage.id)); stages.forEach(other => assigned.add(other.id));
        return [{ stages, cyclic: stages.length > 1, level: 0 }];
    });
    const owner = (id: string) => groups.findIndex(group => group.stages.some(stage => stage.id === id));
    for (let iteration = 0; iteration < groups.length; iteration++) for (const flow of view.flows) {
        const a = owner(flow.source), b = owner(flow.target), source = groups[a], target = groups[b];
        if (source && target && a !== b) target.level = Math.max(target.level, source.level + 1);
    }
    return groups.sort((a, b) => a.level - b.level);
}

export function displayedDependencyFlows(view: DependencyView, selected: string | undefined, showAll: boolean): readonly LoopFlow[] {
    return view.flows.length <= 12 || showAll ? view.flows : view.flows.filter(flow => flow.source === selected || flow.target === selected);
}

export function dependencyBandHeight(flowCount: number, width: number): number {
    const columns = Math.max(1, Math.floor((width - 48) / 144));
    return flowCount ? 48 + Math.ceil(flowCount / columns) * 40 : 16;
}
