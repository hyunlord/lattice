import type { LoopFlow, LoopMap, LoopStage } from './loop-map-types.js';


export function structuralScopeModel(model: LoopMap, requested?: 'production' | 'all'): LoopMap {
    const scope = model.structuralScope; if (!scope) return model;
    const all = !scope.productionCount || (requested ?? scope.default) === 'all';
    const roots = all ? scope.allRootStageIds : model.rootStageIds ?? [];
    const stageById = new Map(model.stages.map(stage => [stage.id, stage])); const included = new Set<string>();
    const visit = (id: string): void => { if (included.has(id)) return; included.add(id); for (const child of stageById.get(id)?.childIds ?? []) visit(child); };
    for (const id of roots) visit(id);
    return { ...model, rootStageIds: roots, ...(all ? { defaultStage: scope.allDefaultStage } : {}), stages: model.stages.filter(stage => included.has(stage.id)), flows: model.flows.filter(flow => included.has(flow.source) && included.has(flow.target)), ...(model.verifiedCycleStageGroups ? { verifiedCycleStageGroups: model.verifiedCycleStageGroups.filter(group => group.every(id => included.has(id))) } : {}) };
}

export type DependencyView = { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly actualCycles?: readonly (readonly string[])[]; };
export function dependencyView(model: LoopMap, ids: readonly string[]): DependencyView {
    const stages = ids.flatMap(id => { const stage = model.stages.find(item => item.id === id); return stage ? [stage] : []; });
    const stageById = new Map(model.stages.map(stage => [stage.id, stage]));
    const ancestor = (id: string): string | undefined => {
        let current: string | undefined = id;
        while (current) { if (ids.includes(current)) return current; current = stageById.get(current)?.parentId; }
        return undefined;
    };
    const groups = new Map<string, { source: string; target: string; files: Set<string>; projectFiles: Set<string>; }>();
    for (const flow of model.flows) {
        const source = ancestor(flow.source) ?? flow.source, target = ancestor(flow.target) ?? flow.target;
        if (!source || !target || source === target) continue;
        const key = JSON.stringify([source, target]); const group = groups.get(key) ?? { source, target, files: new Set<string>(), projectFiles: new Set<string>() };
        for (const file of flow.sourceFiles ?? []) group.files.add(file); for (const file of flow.projectSourceFiles ?? []) group.projectFiles.add(file); groups.set(key, group);
    }
    const flows = [...groups.values()].map(group => ({ source: group.source, target: group.target, count: group.files.size, sourceFiles: [...group.files].sort(), projectSourceFiles: [...group.projectFiles].sort(), label: group.projectFiles.size ? `${group.files.size - group.projectFiles.size}개 파일 · 프로젝트 선언 ${group.projectFiles.size}개` : `${group.files.size}개 파일` }));
    const effective = stages.map(stage => {
        const nested = stages.filter(other => { let parent = other.parentId; while (parent) { if (parent === stage.id) return true; parent = stageById.get(parent)?.parentId; } return false; });
        const covered = new Set(nested.flatMap(other => other.descendantNodeIds ?? other.nodeIds));
        const nodeIds = (stage.descendantNodeIds ?? stage.nodeIds).filter(id => !covered.has(id));
        const related = (direction: 'incoming' | 'outgoing') => flows.filter(flow => (direction === 'incoming' ? flow.target : flow.source) === stage.id).map(flow => ({ name: stageById.get(direction === 'incoming' ? flow.source : flow.target)?.title ?? '', description: dependencyFlowDescription(flow) }));
        return { ...stage, nodeIds, groups: [{ title: '모듈', items: nodeIds.map(id => ({ id })) }], incoming: related('incoming'), outgoing: related('outgoing') };
    });
    const actualCycles = (model.verifiedCycleStageGroups ?? []).map(cycle => [...new Set(cycle.flatMap(id => ancestor(id) ?? []))]).filter(cycle => cycle.length > 1);
    return { stages: effective, flows: flows.filter(flow => ids.includes(flow.source) && ids.includes(flow.target)), actualCycles };
}

export type Point = { readonly x: number; readonly y: number; };
export type Obstacle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
export type RouteSpace = { readonly width: number; readonly height: number; readonly obstacles: readonly Obstacle[]; readonly occupied?: ReadonlySet<string>; };
export function orthogonalRoute(start: Point, end: Point, space: RouteSpace): readonly Point[] {
    const step = 8; const columns = Math.ceil(space.width / step) + 1, rows = Math.ceil(space.height / step) + 1;
    const cell = (p: Point) => Math.round(p.y / step) * columns + Math.round(p.x / step);
    const point = (index: number): Point => ({ x: index % columns * step, y: Math.floor(index / columns) * step });
    const from = cell(start), to = cell(end); const blocked = new Uint8Array(columns * rows);
    for (const box of space.obstacles) for (let y = Math.max(0, Math.ceil(box.y / step)); y <= Math.min(rows - 1, Math.floor((box.y + box.height) / step)); y++) for (let x = Math.max(0, Math.ceil(box.x / step)); x <= Math.min(columns - 1, Math.floor((box.x + box.width) / step)); x++) blocked[y * columns + x] = 1;
    blocked[from] = 0; blocked[to] = 0;
    const queue = [from], previous = new Map<number, number>(); previous.set(from, from);
    for (let index = 0; index < queue.length && !previous.has(to); index++) {
        const current = queue[index]; if (current === undefined) continue;
        const x = current % columns, y = Math.floor(current / columns);
        const neighbors = [x > 0 ? current - 1 : -1, x < columns - 1 ? current + 1 : -1, y > 0 ? current - columns : -1, y < rows - 1 ? current + columns : -1].filter(n => n >= 0 && !blocked[n] && !previous.has(n) && !space.occupied?.has([current, n].sort((a, b) => a - b).join(':')));
        neighbors.sort((a, b) => { const p = point(a), q = point(b); return Math.abs(p.x - end.x) + Math.abs(p.y - end.y) - Math.abs(q.x - end.x) - Math.abs(q.y - end.y); });
        for (const next of neighbors) { previous.set(next, current); queue.push(next); }
    }
    if (!previous.has(to)) return [];
    const reversed: Point[] = []; let current = to;
    while (current !== from) { reversed.push(point(current)); const prior = previous.get(current); if (prior === undefined) return []; current = prior; }
    reversed.push(point(from)); const route = [start, ...reversed.reverse(), end];
    return route.filter((p, index) => { const before = route[index - 1], after = route[index + 1]; return !before || !after || (before.x !== p.x || p.x !== after.x) && (before.y !== p.y || p.y !== after.y); });
}

export function dependencyLevels(view: DependencyView): readonly { readonly stages: readonly LoopStage[]; readonly cyclic: boolean; readonly foldedCycle: boolean; readonly level: number; }[] {
    const reaches = (start: string, target: string): boolean => {
        const pending = [start], seen = new Set<string>();
        while (pending.length) { const id = pending.pop(); if (!id || seen.has(id)) continue; seen.add(id); for (const flow of view.flows.filter(flow => flow.source === id)) { if (flow.target === target) return true; pending.push(flow.target); } }
        return false;
    };
    const assigned = new Set<string>(); const groups = view.stages.flatMap(stage => {
        if (assigned.has(stage.id)) return [];
        const stages = view.stages.filter(other => other.id === stage.id || reaches(stage.id, other.id) && reaches(other.id, stage.id)); stages.forEach(other => assigned.add(other.id));
        const cyclic = stages.length > 1 && (view.actualCycles?.some(cycle => stages.every(stage => cycle.includes(stage.id))) ?? false);
        return [{ stages, cyclic, foldedCycle: stages.length > 1 && !cyclic, level: 0 }];
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

export function dependencyBandHeight(flowCount: number, width: number, rowHeight = 48): number {
    const columns = Math.max(1, Math.floor((width - 48) / 240));
    return flowCount ? 40 + Math.ceil(flowCount / columns) * rowHeight : 32;
}

export function factoredTitle(title: string, titles: readonly string[]): { readonly prefix: string; readonly name: string; } {
    const parts = title.split('/'), leaf = parts.at(-1) ?? title;
    if (leaf.length <= 24) return { prefix: '', name: title };
    const candidates = [...leaf.matchAll(/\./g)].map(match => leaf.slice(0, (match.index ?? 0) + 1)).reverse();
    const prefix = candidates.find(value => titles.some(other => other !== title && ((other.split('/').at(-1) ?? other).startsWith(value) || (other.split('/').at(-1) ?? other) === value.slice(0, -1))));
    return prefix ? { prefix: [...parts.slice(0, -1), prefix].join('/'), name: leaf.slice(prefix.length) } : { prefix: '', name: title };
}

export function sharedFolderPrefix(paths: readonly string[]): string {
    const candidates = new Set(paths.flatMap(path => { const parts = path.split('/'); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/')); }));
    return [...candidates].map(prefix => ({ prefix, count: paths.filter(path => path.startsWith(`${prefix}/`)).length })).filter(item => item.count >= 2).sort((a, b) => b.count * b.prefix.length - a.count * a.prefix.length || a.prefix.localeCompare(b.prefix))[0]?.prefix ?? '';
}

export function dependencyStageTitle(stage: LoopStage): string { return stage.headingParts?.[0] ? stage.headingParts[0] : stage.title; }

export function uniqueDependencyNames(stages: readonly LoopStage[]): ReadonlyMap<string, string> {
    return new Map(stages.map(stage => {
        const parts = (stage.title === '.' ? '루트' : stage.title).split('/');
        for (let length = 1; length <= parts.length; length++) {
            const name = parts.slice(-length).join('/');
            if (stages.every(other => other.id === stage.id || other.title.split('/').slice(-length).join('/') !== name)) {
                if (name.length > 24 && parts.length > 2) {
                    const candidates: string[] = [];
                    for (let prefix = 1; prefix < parts.length - 1; prefix++) for (let suffix = 1; suffix < parts.length - prefix; suffix++) {
                        const shorten = (value: string): string => `${value.split('/').slice(0, prefix).join('/')}/…/${value.split('/').slice(-suffix).join('/')}`;
                        const shortened = shorten(stage.title);
                        if (stages.every(other => other.id === stage.id || shorten(other.title) !== shortened)) candidates.push(shortened);
                    }
                    for (let start = 1; start < parts.length - 1; start++) {
                        const shorten = (value: string): string => { const path = value.split('/'); return `…/${path[start] ?? ''}/…/${path.at(-1) ?? ''}`; };
                        if (stages.every(other => other.id === stage.id || shorten(other.title) !== shorten(stage.title))) candidates.push(shorten(stage.title));
                    }
                    const shortest = candidates.sort((a, b) => a.length - b.length || a.localeCompare(b))[0]; if (shortest) return [stage.id, shortest];
                }
                return [stage.id, name];
            }
        }
        return [stage.id, stage.title];
    }));
}
export function dependencyHeadingParts(stage: LoopStage, stages: readonly LoopStage[]): readonly string[] {
    const paths = [...new Set(stages.flatMap(item => item.headingParts ?? [item.title]))];
    const names = uniqueDependencyNames(paths.map(path => ({ ...stage, id: path, title: path })));
    return (stage.headingParts ?? [stage.title]).map(path => { const name = names.get(path) ?? path; return name.includes('/') ? name : path.split('/').slice(-2).join('/'); });
}

export function dependencyPort(box: Obstacle, index: number, count: number): number {
    return Math.round((box.x + box.width / 2 + (index - (count - 1) / 2) * Math.min(8, (box.width - 24) / Math.max(1, count))) / 8) * 8;
}
export function clearDependencyPort(box: Obstacle, preferred: number, above: boolean, obstacles: readonly Obstacle[], ownObstacle?: Obstacle): number {
    const edge = above ? box.y - 3 : box.y + box.height + 2; const outer = above ? Math.floor((box.y - 16) / 8) * 8 : Math.ceil((box.y + box.height + 16) / 8) * 8;
    const candidates = Array.from({ length: Math.max(0, Math.floor((box.width - 24) / 8)) }, (_, index) => Math.ceil((box.x + 12) / 8) * 8 + index * 8).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    return [preferred, ...candidates].find(x => obstacles.every(r => r === ownObstacle || x <= r.x || x >= r.x + r.width || Math.max(edge, outer) <= r.y || Math.min(edge, outer) >= r.y + r.height)) ?? preferred;
}
export function reserveDependencyRoute(points: readonly Point[], width: number, occupied: Set<string>): void {
    const columns = Math.ceil(width / 8) + 1;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i]; if (!a || !b) continue;
        let x = Math.round(a.x / 8), y = Math.round(a.y / 8); const tx = Math.round(b.x / 8), ty = Math.round(b.y / 8);
        while (x !== tx || y !== ty) { const before = y * columns + x; if (x !== tx) x += Math.sign(tx - x); else y += Math.sign(ty - y); occupied.add([before, y * columns + x].sort((a, b) => a - b).join(':')); }
    }
}

export function dependencyLabelLines(view: DependencyView): ReadonlyMap<string, readonly string[]> {
    const originalNames = uniqueDependencyNames(view.stages); const values = [...originalNames.values()]; const names = new Map([...originalNames].map(([id, name]) => { const shortened = factoredTitle(name, values).name; return [id, values.filter(value => factoredTitle(value, values).name === shortened).length === 1 ? shortened : name]; }));
    return new Map(view.flows.map(flow => { const endpoint = (id: string): string => { const stage = view.stages.find(item => item.id === id); const grouped = (stage?.scopePaths?.length ?? 0) > 1 || stage?.childIds?.some(child => !view.stages.some(item => item.id === child)); return `${names.get(id) ?? id}${grouped ? ' 묶음' : ''}`; }; const from = endpoint(flow.source), to = endpoint(flow.target); const pair = `${from} → ${to}`; return [JSON.stringify([flow.source, flow.target]), pair.length <= 30 ? [pair, flow.label] : [from, `→ ${to}`, flow.label]]; }));
}

export function dependencyLabelRowHeight(flows: readonly LoopFlow[], lines: ReadonlyMap<string, readonly string[]>): number {
    return flows.some(flow => (lines.get(JSON.stringify([flow.source, flow.target]))?.length ?? 0) > 2) ? 64 : 48;
}

export function dependencyFlowDescription(flow: LoopFlow): string {
    const project = new Set(flow.projectSourceFiles ?? []), files = flow.sourceFiles ?? [];
    const names = (values: readonly string[]) => values.map(file => file.split('/').at(-1)).join(', ');
    return project.size ? `${files.length - project.size}개 파일이 사용: ${names(files.filter(file => !project.has(file)))} · 프로젝트 공통 선언 ${project.size}개: ${names([...project])} (프로젝트 전체 범위)` : `${flow.count ?? files.length}개 파일이 사용: ${names(files)}`;
}
