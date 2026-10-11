import type { LoopFlow, LoopMap, LoopStage } from './loop-map-types.js';
import { dependencyComponents, projectedDependencyRelations } from './structural-dependency-groups.js';


export function structuralScopeModel(model: LoopMap, requested?: 'production' | 'all'): LoopMap {
    const scope = model.structuralScope; if (!scope) return model;
    const all = !scope.productionCount || (requested ?? scope.default) === 'all';
    const roots = all ? scope.allRootStageIds : model.rootStageIds ?? [];
    const stageById = new Map(model.stages.map(stage => [stage.id, stage])); const included = new Set<string>();
    const visit = (id: string): void => { if (included.has(id)) return; included.add(id); for (const child of stageById.get(id)?.childIds ?? []) visit(child); };
    for (const id of roots) visit(id);
    return { ...model, ...(model.structuralDependencyGroups ? { structuralDependencyGroups: model.structuralDependencyGroups.filter(group => group.scope === (all ? 'all' : 'production')) } : {}), rootStageIds: roots, ...(all ? { defaultStage: scope.allDefaultStage, ...(scope.allSourceRoot ? { structuralSourceRoot: scope.allSourceRoot } : {}), ...(scope.allEntryStageIds ? { structuralEntryStageIds: scope.allEntryStageIds } : {}) } : {}), stages: model.stages.filter(stage => included.has(stage.id)), flows: model.flows.filter(flow => included.has(flow.source) && included.has(flow.target)), ...(model.verifiedCycleStageGroups ? { verifiedCycleStageGroups: model.verifiedCycleStageGroups.filter(group => group.every(id => included.has(id))) } : {}) };
}

export type DependencyView = { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly actualCycles?: readonly (readonly string[])[]; };
export function dependencyView(model: LoopMap, ids: readonly string[]): DependencyView {
    const stages = ids.flatMap(id => { const stage = model.stages.find(item => item.id === id); return stage ? [stage] : []; });
    const stageById = new Map(model.stages.map(stage => [stage.id, stage]));
    const { flows, relatedFlows, actualCycles } = projectedDependencyRelations(model.stages, model.flows, ids, model.verifiedCycleStageGroups);
    const effective = stages.map(stage => {
        const nested = stages.filter(other => { let parent = other.parentId; while (parent) { if (parent === stage.id) return true; parent = stageById.get(parent)?.parentId; } return false; });
        const covered = new Set(nested.flatMap(other => other.descendantNodeIds ?? other.nodeIds));
        const nodeIds = (stage.descendantNodeIds ?? stage.nodeIds).filter(id => !covered.has(id));
        const related = (direction: 'incoming' | 'outgoing') => relatedFlows.filter(flow => (direction === 'incoming' ? flow.target : flow.source) === stage.id).map(flow => ({ name: stageById.get(direction === 'incoming' ? flow.source : flow.target)?.title ?? '', description: dependencyFlowDescription(flow) }));
        return { ...stage, nodeIds, groups: [{ title: '모듈', items: nodeIds.map(id => ({ id })) }], incoming: related('incoming'), outgoing: related('outgoing') };
    });
    return { stages: effective, flows, actualCycles };
}

export type Point = { readonly x: number; readonly y: number; };
export type Obstacle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
export function dependencyRouteIntersects(points: readonly Point[], box: Obstacle): boolean {
    return points.slice(1).some((b, index) => {
        const a = points[index]; if (!a) return false;
        return a.x === b.x ? a.x >= box.x && a.x <= box.x + box.width && Math.max(a.y, b.y) >= box.y && Math.min(a.y, b.y) <= box.y + box.height
            : a.y >= box.y && a.y <= box.y + box.height && Math.max(a.x, b.x) >= box.x && Math.min(a.x, b.x) <= box.x + box.width;
    });
}
export function selectDependencyRoutes<T extends { readonly flow: DependencyPair; readonly points: readonly Point[]; }>(routes: readonly T[]): readonly T[] {
    const selected: T[] = [];
    for (const route of [...routes].sort((a, b) => b.flow.weight - a.flow.weight || a.flow.source.localeCompare(b.flow.source) || a.flow.target.localeCompare(b.flow.target))) {
        const collision = selected.some(other => other.points.slice(1).some((end, index) => {
            const start = other.points[index]; if (!start) return false;
            const padding = Math.max(3, Math.min(6, 1.5 + Math.log2(other.flow.weight + 1) * .55));
            return dependencyRouteIntersects(route.points, { x: Math.min(start.x, end.x) - padding, y: Math.min(start.y, end.y) - padding, width: Math.abs(start.x - end.x) + padding * 2, height: Math.abs(start.y - end.y) + padding * 2 });
        }));
        if (!collision) selected.push(route);
    }
    return selected;
}
export function straightDependencyRoute(source: Obstacle, target: Obstacle, obstacles: readonly Obstacle[]): readonly Point[] | undefined {
    const x = source.x + source.width / 2;
    if (x <= target.x + 12 || x >= target.x + target.width - 12) return undefined;
    const downward = target.y >= source.y + source.height;
    if (!downward && source.y < target.y + target.height) return undefined;
    const route = [{ x, y: downward ? source.y + source.height + 2 : source.y - 2 }, { x, y: downward ? target.y - 3 : target.y + target.height + 3 }];
    return obstacles.some(box => dependencyRouteIntersects(route, box)) ? undefined : route;
}
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

export const dependencyLevels = dependencyComponents;

/** Unconnected sources remain visible after the connected architecture. */
export function dependencyOverviewLevels(view: DependencyView): ReturnType<typeof dependencyLevels> {
    const levels = dependencyLevels(view), connected = new Set(view.flows.flatMap(flow => [flow.source, flow.target]));
    const last = Math.max(-1, ...levels.filter(group => group.stages.some(stage => connected.has(stage.id))).map(group => group.level));
    return levels.map(group => last >= 0 && group.stages.every(stage => !connected.has(stage.id)) ? { ...group, level: last + 1 } : group);
}


export type DependencyPair = LoopFlow & { readonly reverseCount?: number; readonly reverseSourceFiles?: readonly string[]; readonly reverseProjectSourceFiles?: readonly string[]; readonly weight: number; };
export function dependencyPairs(flows: readonly LoopFlow[]): readonly DependencyPair[] {
    const pairs = new Map<string, DependencyPair>();
    for (const flow of flows) {
        const key = JSON.stringify([flow.source, flow.target].sort()); const prior = pairs.get(key);
        const count = flow.sourceFiles?.length ? new Set(flow.sourceFiles).size : flow.count ?? 0;
        if (!prior) pairs.set(key, { ...flow, count, weight: count });
        else if (prior.source !== flow.source) pairs.set(key, { ...prior, reverseCount: count, reverseSourceFiles: flow.sourceFiles ?? [], reverseProjectSourceFiles: flow.projectSourceFiles ?? [], weight: prior.weight + count });
    }
    return [...pairs.values()].sort((a, b) => b.weight - a.weight || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
}
export function displayedDependencyFlows(view: DependencyView, selected: string | undefined, showAll: boolean): readonly DependencyPair[] {
    const levels = dependencyLevels(view); const owner = new Map(levels.flatMap((group, index) => group.stages.map(stage => [stage.id, index] as const)));
    const projected = new Map<string, LoopFlow>();
    for (const flow of view.flows) {
        const sourceGroup = owner.get(flow.source), targetGroup = owner.get(flow.target);
        if (sourceGroup !== undefined && sourceGroup === targetGroup) continue;
        const source = sourceGroup === undefined ? flow.source : levels[sourceGroup]?.stages[0]?.id ?? flow.source;
        const target = targetGroup === undefined ? flow.target : levels[targetGroup]?.stages[0]?.id ?? flow.target;
        const key = JSON.stringify([source, target]); const previous = projected.get(key);
        const sourceFiles = [...new Set([...(previous?.sourceFiles ?? []), ...(flow.sourceFiles ?? [])])].sort();
        const count = sourceFiles.length || (previous?.count ?? 0) + (flow.count ?? 0);
        const projectSourceFiles = [...new Set([...(previous?.projectSourceFiles ?? []), ...(flow.projectSourceFiles ?? [])])].sort();
        projected.set(key, { ...flow, source, target, count, sourceFiles, projectSourceFiles, label: `${count}개 연결 근거` });
    }
    const pairs = dependencyPairs([...projected.values()]);
    if (showAll) return pairs;
    const selectedGroup = selected ? owner.get(selected) : undefined;
    const selectedId = selectedGroup === undefined ? selected : levels[selectedGroup]?.stages[0]?.id;
    return (selectedId ? pairs.filter(flow => flow.source === selectedId || flow.target === selectedId) : pairs).slice(0, 5);
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
export function dependencyHeadingParts(stage: LoopStage, _stages: readonly LoopStage[]): readonly string[] { return [stage.title]; }

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

export function dependencyPairSources(view: DependencyView, pair: Pick<LoopFlow, 'source' | 'target'>, endpoint: 'source' | 'target' = 'source'): readonly string[] {
    const groups = dependencyLevels(view); const owner = new Map(groups.flatMap(group => group.stages.map(stage => [stage.id, group.stages[0]?.id ?? stage.id] as const)));
    return [...new Set(view.flows.filter(flow => owner.get(flow.source) === owner.get(pair.source) && owner.get(flow.target) === owner.get(pair.target)).map(flow => view.stages.find(stage => stage.id === flow[endpoint])?.title ?? flow[endpoint]))].sort();
}

export function dependencyCardRole(stage: LoopStage): { readonly text: string; readonly label: string; } {
    const fresh = stage.interpretation && !stage.interpretation.stale;
    const summary = fresh ? stage.interpretation?.summary : stage.summaryEvidence?.length ? stage.summary : undefined;
    return { text: summary?.split(/(?<=[.!?。])\s/u)[0] || stage.summaryDetail?.text || '역할 설명 없음 — 요약 실행 필요', label: fresh ? 'AI 요약' : summary ? '문서 설명' : stage.summaryDetail?.label ?? '' };
}

export function featuredDependencyRoles(view: DependencyView, entryStageIds: readonly string[]): readonly LoopStage[] {
    const entries = new Set(entryStageIds);
    return [...view.stages].sort((a, b) => Number(entries.has(b.id)) - Number(entries.has(a.id)) || (b.descendantNodeIds ?? b.nodeIds).length - (a.descendantNodeIds ?? a.nodeIds).length || a.id.localeCompare(b.id)).slice(0, 3);
}

export function internalDependencyFacts(view: DependencyView, memberIds: readonly string[]): readonly LoopFlow[] {
    const members = new Set(memberIds);
    const ranked = view.flows.filter(flow => flow.source !== flow.target && members.has(flow.source) && members.has(flow.target)).map(flow => {
        const sourceFiles = [...new Set(flow.sourceFiles ?? [])].sort();
        return { ...flow, sourceFiles, count: sourceFiles.length };
    }).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source) || a.target.localeCompare(b.target));
    return ranked;
}

export function dependencyCoverage(view: DependencyView, shown: readonly DependencyPair[]): { readonly externalArrows: number; readonly internalDirections: number; readonly hiddenExternalArrows: number; } {
    const internalDirections = dependencyLevels(view).reduce((sum, group) => sum + internalDependencyFacts(view, group.stages.map(stage => stage.id)).length, 0);
    return { externalArrows: shown.length, internalDirections, hiddenExternalArrows: displayedDependencyFlows(view, undefined, true).length - shown.length };
}

export function dependencyFlowDescription(flow: LoopFlow): string {
    const project = new Set(flow.projectSourceFiles ?? []), files = flow.sourceFiles ?? [];
    const names = (values: readonly string[]) => values.map(file => file.split('/').at(-1)).join(', ');
    return project.size ? `${files.length - project.size}개 파일이 사용: ${names(files.filter(file => !project.has(file)))} · 프로젝트 공통 선언 ${project.size}개: ${names([...project])} (프로젝트 전체 범위)` : `${flow.count ?? files.length}개 파일이 사용: ${names(files)}`;
}

export function dependencyCountLabel(flow: LoopFlow): string {
    const declarations = new Set(flow.projectSourceFiles ?? []).size;
    const files = Math.max(0, (flow.sourceFiles?.length ?? flow.count ?? 0) - declarations);
    return [files ? `${files}개 파일` : '', declarations ? `의존 선언 ${declarations}개` : ''].filter(Boolean).join(' · ') || '0개 파일';
}
