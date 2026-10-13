import type { Edge } from '../core/model.js';
import { logicFlow, type LogicGraph } from './logic-model.js';
/** Bound the preview by distinct calls, retaining a real contiguous path before sibling branches. */
const projections = new WeakMap<LogicGraph, LogicGraph>();
function callProjection(graph: LogicGraph): LogicGraph {
    const cached = projections.get(graph);
    if (cached) return cached;
    const unique = new Map<string, Edge>();
    for (const edge of graph.edges) {
        if (edge.kind !== 'calls' || !edge.directed || edge.attributes?.['resolution'] !== 'exact') continue;
        const key = JSON.stringify([edge.source, edge.target]), previous = unique.get(key);
        if (!previous || edge.id < previous.id) unique.set(key, edge);
    }
    const projected = { nodes: graph.nodes, edges: [...unique.values()] };
    projections.set(graph, projected);
    return projected;
}
export function firstImpressionFlow(graph: LogicGraph, rootId: string, componentByNode: ReadonlyMap<string, string>) {
    const candidate = logicFlow(callProjection(graph), { id: rootId, depth: 3, maxNodes: 48, maxEdges: 96 });
    const outgoing = new Map<string, Edge[]>();
    for (const edge of candidate.edges) { const values = outgoing.get(edge.source) ?? []; values.push(edge); outgoing.set(edge.source, values); }
    // Search only the already bounded candidate; length is structure, not a claim about runtime priority.
    const components = new Map(candidate.nodes.map(item => [item.node.id, componentByNode.get(String(item.node.attributes['module'] ?? item.node.id))]));
    const coverage = (edges: readonly Edge[]): number => new Set([rootId, ...edges.map(edge => edge.target)].flatMap(id => components.get(id) ?? [])).size;
    let best: Edge[] = [], budget = 512;
    const pending: { readonly id: string; readonly edges: readonly Edge[]; readonly seen: ReadonlySet<string>; }[] = [{ id: rootId, edges: [], seen: new Set([rootId]) }];
    while (pending.length && budget-- > 0) {
        const item = pending.pop(); if (!item) break;
        if (item.edges.length > best.length || item.edges.length === best.length && coverage(item.edges) > coverage(best)) best = [...item.edges];
        if (item.edges.length >= 3) continue;
        for (const edge of [...(outgoing.get(item.id) ?? [])].reverse()) if (!item.seen.has(edge.target)) pending.push({ id: edge.target, edges: [...item.edges, edge], seen: new Set([...item.seen, edge.target]) });
    }
    const ids = new Set([rootId, ...best.flatMap(edge => [edge.source, edge.target])]), selected = new Map(best.map(edge => [edge.id, edge]));
    for (const edge of candidate.edges) {
        if (selected.size >= 8) break;
        if (!ids.has(edge.source) || !ids.has(edge.target) && ids.size >= 6) continue;
        ids.add(edge.target); selected.set(edge.id, edge);
    }
    return { ...candidate, nodes: candidate.nodes.filter(item => ids.has(item.node.id)), edges: [...selected.values()], truncated: candidate.truncated || ids.size < candidate.nodes.length || selected.size < candidate.edges.length };
}
