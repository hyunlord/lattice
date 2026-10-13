import type { FirstImpressionFlow } from '../dist/query/first-impression-types.js';
export function representativePath(flows: readonly FirstImpressionFlow[]): { readonly flow: FirstImpressionFlow; readonly edges: readonly FirstImpressionFlow['edges'][number][]; } | undefined {
    let best: { readonly flow: FirstImpressionFlow; readonly edges: readonly FirstImpressionFlow['edges'][number][]; readonly score: number; } | undefined;
    for (const flow of flows) {
        const nodes = new Map(flow.nodes.map(node => [node.id, node]));
        const outgoing = new Map<string, FirstImpressionFlow['edges'][number][]>();
        for (const edge of flow.edges) { const edges = outgoing.get(edge.source) ?? []; edges.push(edge); outgoing.set(edge.source, edges); }
        let visits = 0;
        const visit = (id: string, path: readonly FirstImpressionFlow['edges'][number][], seen: ReadonlySet<string>) => {
            if (++visits > 512) return;
            const componentCount = new Set([...seen].map(node => nodes.get(node)?.componentId).filter(Boolean)).size;
            const score = path.length * 100 + componentCount;
            if (path.length && (!best || score > best.score)) best = { flow, edges: path, score };
            if (path.length >= 5) return;
            for (const edge of outgoing.get(id) ?? []) if (!seen.has(edge.target)) visit(edge.target, [...path, edge], new Set([...seen, edge.target]));
        };
        visit(flow.rootId, [], new Set([flow.rootId]));
    }
    return best;
}
