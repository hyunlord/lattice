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
    const leaves = input.filter(stage => stage.nodeIds.length), leafById = new Map(leaves.map(stage => [stage.id, stage]));
    const stages = new Map<string, LoopStage>(leaves.map(stage => { const { parentId: _parent, childIds: _children, ...direct } = stage; return [stage.id, { ...direct, title: stage.id === 'folder:.' ? '루트 직접 파일' : stage.title, descendantNodeIds: stage.nodeIds }]; }));
    const roots = new Set(leaves.map(stage => stage.id)), members = new Map(leaves.map(stage => [stage.id, [stage.id]]));
    const original = components([...roots], flows), component = new Map(original.flatMap((group, index) => group.map(id => [id, index] as const)));
    const weight = new Map(leaves.map(stage => [stage.id, new Set(flows.filter(flow => flow.source === stage.id || flow.target === stage.id).flatMap(flow => (flow.sourceFiles ?? []).filter(production))).size]));
    const pathOf = (id: string) => id.slice('folder:'.length);
    const belongs = (id: string, path: string) => (members.get(id) ?? []).every(leaf => pathOf(leaf) !== path && (path === '.' || pathOf(leaf).startsWith(path + '/')));
    const cachedWeight = new Map<string, number>();
    const rootWeight = (id: string): number => { const cached = cachedWeight.get(id); if (cached !== undefined) return cached; const value = (members.get(id) ?? []).reduce((sum, leaf) => sum + (production(pathOf(leaf)) ? weight.get(leaf) ?? 0 : 0), 0); cachedWeight.set(id, value); return value; };
    const owner = () => new Map([...roots].flatMap(root => (members.get(root) ?? []).map(leaf => [leaf, root])));
    const safe = (folded: readonly string[], target: string): boolean => {
        const current = owner(), proposed = new Map([...current].map(([leaf, root]) => [leaf, folded.includes(root) ? target : root]));
        const ids = [...new Set(proposed.values())], projected = flows.flatMap(flow => { const source = proposed.get(flow.source), destination = proposed.get(flow.target); return source && destination && source !== destination ? [{ source, target: destination }] : []; });
        return components(ids, projected).every(group => group.length < 2 || new Set([...proposed].filter(([, root]) => group.includes(root)).map(([leaf]) => component.get(leaf))).size === 1);
    };
    const merge = (id: string, folded: readonly string[]) => {
        const prior = stages.get(id), children = [...new Set(folded.flatMap(child => child === id ? prior?.childIds ?? [] : [child]))];
        const contents = [...new Set(folded.flatMap(child => members.get(child) ?? []))];
        const scopePaths = contents.map(pathOf).sort(), nodeIds = contents.flatMap(leaf => leafById.get(leaf)?.nodeIds ?? []);
        const included = new Set(contents), boundary = new Map<string, Set<string>>();
        for (const flow of flows) if (included.has(flow.source) !== included.has(flow.target)) {
            const leaf = included.has(flow.source) ? flow.source : flow.target;
            if (!boundary.has(leaf)) boundary.set(leaf, new Set());
            for (const file of flow.sourceFiles ?? []) if (production(file)) boundary.get(leaf)?.add(file);
        }
        const ordered = [...contents].sort((a, b) => (boundary.get(b)?.size ?? 0) - (boundary.get(a)?.size ?? 0) || (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || a.localeCompare(b)).map(pathOf);
        const common = (scopePaths[0]?.split('/') ?? []).filter((_part, index, parts) => scopePaths.every(path => path.split('/').slice(0, index + 1).join('/') === parts.slice(0, index + 1).join('/'))).join('/');
        const prefix = common && !scopePaths.includes(common) ? common + '/' : '';
        const names = ordered.slice(0, 2).map(path => prefix ? path.slice(prefix.length) : path);
        const title = scopePaths.length === 1 ? scopePaths[0] ?? id : `${prefix}${names.join(' · ')}${scopePaths.length > 2 ? ` 외 ${scopePaths.length - 2}개 폴더` : ''}`;
        stages.set(id, { id, title, headingParts: ordered.slice(0, 2), headingRemainder: Math.max(0, ordered.length - 2), summary: '', scopePaths, unit: '모듈', nodeIds: [], descendantNodeIds: nodeIds, childIds: children, groups: [], incoming: [], outgoing: [] });
        for (const child of children) { const stage = stages.get(child); if (stage) stages.set(child, { ...stage, parentId: id }); }
        for (const root of folded) roots.delete(root);
        roots.add(id); members.set(id, contents); cachedWeight.delete(id);
    };
    const directories = input.filter(stage => stage.childIds?.length).map(stage => pathOf(stage.id));
    for (const path of directories.filter(path => !production(path) && production(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.')).sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))) {
        const folded = [...roots].filter(root => belongs(root, path) || root === `folder:${path}`);
        if (folded.length && safe(folded, `auxiliary:${path}`)) merge(`auxiliary:${path}`, folded);
    }
    let attempts = 0;
    while (roots.size > 9 && attempts++ < 128) {
        const candidates = directories.flatMap(path => {
            const id = leafById.has(`folder:${path}`) ? `remainder:${path}` : `folder:${path}`;
            const available = [...roots].filter(root => root !== id && belongs(root, path)).sort((a, b) => rootWeight(a) - rootWeight(b) || a.localeCompare(b));
            const folded = roots.has(id) ? [id, ...available.slice(0, 1)] : available.slice(0, 2);
            return folded.length === 2 ? [{ id, path, folded, cost: folded.filter(root => root !== id).reduce((sum, root) => sum + rootWeight(root), 0) }] : [];
        }).sort((a, b) => a.cost - b.cost || (b.path === '.' ? 0 : b.path.split('/').length) - (a.path === '.' ? 0 : a.path.split('/').length) || a.path.localeCompare(b.path));
        const choice = candidates.slice(0, 24).find(candidate => safe(candidate.folded, candidate.id));
        if (!choice) break;
        merge(choice.id, choice.folded);
    }
    if (roots.size > 9) {
        // Keep named production anchors; only merge contiguous condensation intervals between them.
        const anchors = new Set<string>(leafById.has('folder:.') ? ['folder:.'] : []);
        const slotCount = (selected: ReadonlySet<string>) => {
            let count = 0, interval = false;
            for (const group of original) {
                const kept = group.filter(id => selected.has(id)).length;
                if (!kept) { interval = true; continue; }
                if (interval) { count++; interval = false; }
                count += kept + Number(kept < group.length);
            }
            return count + Number(interval);
        };
        const ranked = leaves.filter(stage => stage.id !== 'folder:.' && production(pathOf(stage.id))).sort((a, b) => ((weight.get(b.id) ?? 0) + Math.sqrt(b.nodeIds.length)) - ((weight.get(a.id) ?? 0) + Math.sqrt(a.nodeIds.length)) || a.id.localeCompare(b.id));
        for (const stage of ranked) {
            const selected = new Set([...anchors, stage.id]);
            if (slotCount(selected) <= 9) anchors.add(stage.id);
            if (anchors.size >= 8) break;
        }
        roots.clear(); stages.clear(); members.clear(); cachedWeight.clear();
        for (const leaf of leaves) { const { parentId: _parent, childIds: _children, ...direct } = leaf; stages.set(leaf.id, { ...direct, title: leaf.id === 'folder:.' ? '루트 직접 파일' : leaf.title, descendantNodeIds: leaf.nodeIds }); members.set(leaf.id, [leaf.id]); roots.add(leaf.id); }
        let ordinal = 0;
        const foldInterval = (group: readonly string[]) => {
            if (group.length < 2) return;
            merge(`layer:${ordinal++}`, group);
        };
        let interval: string[] = [];
        for (const group of original) {
            if (!group.some(id => anchors.has(id))) { interval.push(...group); continue; }
            foldInterval(interval); interval = [];
            foldInterval(group.filter(id => !anchors.has(id)));
        }
        foldInterval(interval);
    }

    const owners = owner();
    const degree = (root: string) => flows.filter(flow => owners.get(flow.source) !== owners.get(flow.target) && (owners.get(flow.source) === root || owners.get(flow.target) === root)).reduce((sum, flow) => sum + (flow.sourceFiles ?? []).filter(production).length, 0);
    const rootStageIds = [...roots].sort((a, b) => degree(b) / Math.max(1, stages.get(b)?.scopePaths?.length ?? 1) - degree(a) / Math.max(1, stages.get(a)?.scopePaths?.length ?? 1) || a.localeCompare(b));
    return { stages: [...stages.values()], rootStageIds, defaultStage: rootStageIds[0] ?? '' };
}
