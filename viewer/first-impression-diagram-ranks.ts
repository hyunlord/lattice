type Connection = { readonly source: string; readonly target: string; };
/** Condense genuine cycles before assigning dependency depth; never order a cycle as a DAG. */
export function dependencyLayers(ids: readonly string[], edges: readonly Connection[], starts: readonly string[]): readonly (readonly string[])[] {
    const reachable = new Map(ids.map(id => [id, new Set([id, ...edges.filter(edge => edge.source === id).map(edge => edge.target)])]));
    for (const via of ids) for (const id of ids) if (reachable.get(id)?.has(via)) for (const next of reachable.get(via) ?? []) reachable.get(id)?.add(next);
    const groups: string[][] = [];
    for (const id of ids) {
        const group = groups.find(items => items.some(other => reachable.get(id)?.has(other) && reachable.get(other)?.has(id)));
        if (group) group.push(id); else groups.push([id]);
    }
    const owner = new Map(groups.flatMap((group, index) => group.map(id => [id, index] as const)));
    const ranks = groups.map(() => 0);
    for (let pass = 0; pass < groups.length; pass++) for (const edge of edges) {
        const source = owner.get(edge.source), target = owner.get(edge.target);
        if (source !== undefined && target !== undefined && source !== target) ranks[target] = Math.max(ranks[target] ?? 0, (ranks[source] ?? 0) + 1);
    }
    const finalRank = Math.max(0, ...ranks);
    for (let index = 0; index < groups.length; index++) {
        const group = groups[index] ?? [];
        if (group.every(id => !starts.includes(id) && !edges.some(edge => edge.source === id || edge.target === id))) ranks[index] = finalRank;
    }
    const layers = Array.from({ length: Math.max(0, ...ranks) + 1 }, (_, rank) => groups.flatMap((group, index) => ranks[index] === rank ? group : []));
    const positions = new Map(ids.map((id, index) => [id, index]));
    for (let sweep = 0; sweep < 6; sweep++) {
        const downward = sweep % 2 === 0;
        for (const layer of downward ? layers : [...layers].reverse()) {
            const barycenter = (id: string) => {
                const neighbors = edges.filter(edge => downward ? edge.target === id : edge.source === id).map(edge => positions.get(downward ? edge.source : edge.target) ?? 0);
                return neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : positions.get(id) ?? 0;
            };
            layer.sort((a, b) => Number(starts.includes(b)) - Number(starts.includes(a)) || barycenter(a) - barycenter(b) || ids.indexOf(a) - ids.indexOf(b));
            layer.forEach((id, index) => positions.set(id, index));
        }
    }
    return layers;
}
