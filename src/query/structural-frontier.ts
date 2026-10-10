import type { LoopFlow, LoopStage } from './loop-map-types.js';

export function components(ids: readonly string[], links: readonly { source: string; target: string; }[]): string[][] {
    const forward = new Map<string, string[]>(ids.map(id => [id, []])), reverse = new Map<string, string[]>(ids.map(id => [id, []]));
    for (const link of links) if (forward.has(link.source) && forward.has(link.target)) { forward.get(link.source)?.push(link.target); reverse.get(link.target)?.push(link.source); }
    const seen = new Set<string>(), order: string[] = [];
    for (const id of ids) {
        const pending = [{ id, finish: false }];
        while (pending.length) {
            const next = pending.pop(); if (!next) break;
            if (next.finish) { order.push(next.id); continue; }
            if (seen.has(next.id)) continue;
            seen.add(next.id); pending.push({ id: next.id, finish: true });
            for (const target of forward.get(next.id) ?? []) if (!seen.has(target)) pending.push({ id: target, finish: false });
        }
    }
    const result: string[][] = []; seen.clear();
    for (const id of order.reverse()) {
        if (seen.has(id)) continue;
        const pending = [id], group: string[] = [];
        while (pending.length) { const next = pending.pop(); if (!next || seen.has(next)) continue; seen.add(next); group.push(next); for (const target of reverse.get(next) ?? []) if (!seen.has(target)) pending.push(target); }
        result.push(group.sort());
    }
    return result;
}

export function structuralFrontier(input: readonly LoopStage[], flows: readonly LoopFlow[], production: (path: string) => boolean) {
    const pathOf = (stage: LoopStage): string => stage.directoryPath ?? stage.id.slice('folder:'.length);
    const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    const originals = new Map(input.map(stage => [pathOf(stage), stage]));
    const leaves = input.filter(stage => stage.nodeIds.length);
    if (!leaves.length) return { stages: [] as LoopStage[], rootStageIds: [] as string[], defaultStage: '' };
    const paths = new Set<string>(['.']);
    for (const leaf of leaves) { let path = pathOf(leaf); paths.add(path); while (path !== '.') { path = parent(path); paths.add(path); } }
    const stages = new Map<string, LoopStage>();
    const treeId = new Map<string, string>();
    const ordered = [...paths].sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length || a.localeCompare(b));
    for (const path of ordered) {
        const original = originals.get(path);
        const children = [...paths].filter(child => child !== path && parent(child) === path).map(child => treeId.get(child)).filter((id): id is string => id !== undefined);
        const direct = original?.nodeIds.length ? original : undefined;
        if (direct) stages.set(direct.id, { ...direct, directoryPath: path, descendantNodeIds: direct.nodeIds, childIds: [], folderCount: 0 });
        if (!children.length && direct) { treeId.set(path, direct.id); continue; }
        if (direct) children.unshift(direct.id);
        const id = `directory:${path}`, descendants = children.flatMap(child => stages.get(child)?.descendantNodeIds ?? []);
        const base = original ?? { id, title: path, summary: '', unit: '파일', nodeIds: [], groups: [], incoming: [], outgoing: [] };
        stages.set(id, { ...base, id, directoryPath: path, nodeIds: [], descendantNodeIds: descendants, childIds: children, folderCount: [...paths].filter(child => child !== path && (path === '.' || child.startsWith(path + '/'))).length });
        for (const child of children) { const stage = stages.get(child); if (stage) stages.set(child, { ...stage, parentId: id }); }
        treeId.set(path, id);
    }
    const pinned = new Set(flows.flatMap(flow => [flow.source, flow.target]).filter(id => id.startsWith('directory:')));
    const top = treeId.get('.');
    const roots = top ? [top] : [];
    // Expand only complete child sets. A sole wide parent exposes real children across pages.
    while (true) {
        const candidates = roots.flatMap((id, index) => {
            const stage = stages.get(id), children = stage?.childIds ?? [];
            return !pinned.has(id) && children.length && (roots.length === 1 || roots.length - 1 + children.length <= 9) ? [{ id, index, children, path: stage?.directoryPath ?? '.' }] : [];
        }).sort((a, b) => Number(production(b.path)) - Number(production(a.path)) || a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
        const chosen = candidates[0]; if (!chosen) break;
        roots.splice(chosen.index, 1, ...chosen.children);
    }
    return { stages: [...stages.values()], rootStageIds: roots, defaultStage: roots[0] ?? '' };
}
