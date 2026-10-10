import type { Edge, Facet, Node } from '../core/model.js';

export type GraphProjection = { readonly nodes: Node[]; readonly edges: Edge[]; };
export type FilterOptions = { readonly kind?: string; readonly edgeKind?: string; readonly facet?: string; readonly value?: string; readonly q?: string; };
export type GraphPath = { readonly nodeIds: string[]; readonly edgeIds: string[]; };
export type GraphGroup = { readonly id: string; readonly label: string; readonly nodeIds: string[]; internalEdges: number; };
export type GroupLink = { readonly source: string; readonly target: string; readonly kind: string; readonly directed: boolean; count: number; readonly edgeIds: string[]; };
export type GroupedGraph = { readonly groups: GraphGroup[]; readonly links: GroupLink[]; };
export type Hub = { readonly id: string; readonly degree: number; };
type Step = { readonly id: string; readonly edgeId: string; };
type Direction = 'out' | 'in' | 'both';
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function induced(nodes: readonly Node[], edges: readonly Edge[], ids: ReadonlySet<string>): GraphProjection {
    return { nodes: nodes.filter(node => ids.has(node.id)), edges: edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
}

export function filterGraph(nodes: readonly Node[], edges: readonly Edge[], facets: readonly Facet[], options: FilterOptions): GraphProjection {
    const matches = new Set(facets.filter(facet => facet.key === options.facet && (options.value === undefined || JSON.stringify(facet.value) === options.value)).map(facet => facet.nodeId));
    const q = options.q?.trim().toLowerCase();
    const ids = new Set(nodes.filter(node => (!options.kind || node.kind === options.kind) && (!options.facet || matches.has(node.id)) && (!q || `${node.id} ${node.name} ${JSON.stringify(node.attributes)}`.toLowerCase().includes(q))).map(node => node.id));
    return induced(nodes, edges.filter(edge => !options.edgeKind || edge.kind === options.edgeKind), ids);
}

function adjacency(nodes: readonly Node[], edges: readonly Edge[], direction: Direction): Map<string, Step[]> {
    const result = new Map(nodes.map(node => [node.id, new Array<Step>()]));
    for (const edge of edges) {
        const source = result.get(edge.source), target = result.get(edge.target);
        if (!source || !target) continue;
        if (!edge.directed || direction !== 'in') source.push({ id: edge.target, edgeId: edge.id });
        if (!edge.directed || direction !== 'out') target.push({ id: edge.source, edgeId: edge.id });
    }
    for (const steps of result.values()) steps.sort((a, b) => compare(a.id, b.id) || compare(a.edgeId, b.edgeId));
    return result;
}

export function shortestPath(nodes: readonly Node[], edges: readonly Edge[], from: string, to: string): GraphPath | undefined {
    const adjacent = adjacency(nodes, edges, 'out');
    if (!adjacent.has(from) || !adjacent.has(to)) return undefined;
    const queue = [from], visited = new Set([from]);
    const previous = new Map<string, Step>();
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        if (current === undefined) break;
        if (current === to) {
            const nodeIds = [to], edgeIds: string[] = [];
            let cursor = to;
            for (let step = previous.get(cursor); step; step = previous.get(cursor)) {
                nodeIds.push(step.id); edgeIds.push(step.edgeId); cursor = step.id;
            }
            return { nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse() };
        }
        for (const step of adjacent.get(current) ?? []) {
            if (visited.has(step.id)) continue;
            visited.add(step.id); previous.set(step.id, { id: current, edgeId: step.edgeId }); queue.push(step.id);
        }
    }
    return undefined;
}

/** Reachability selects nodes; every edge between selected endpoints remains in the result. */
export function neighborhood(nodes: readonly Node[], edges: readonly Edge[], from: string, hops: number, direction: Direction): GraphProjection {
    const adjacent = adjacency(nodes, edges, direction);
    if (!adjacent.has(from)) return { nodes: [], edges: [] };
    const visited = new Set([from]);
    let frontier = [from];
    const limit = Number.isFinite(hops) ? Math.max(0, Math.floor(hops)) : 0;
    for (let depth = 0; depth < limit && frontier.length; depth++) {
        const next: string[] = [];
        for (const id of frontier) for (const step of adjacent.get(id) ?? []) {
            if (visited.has(step.id)) continue;
            visited.add(step.id); next.push(step.id);
        }
        frontier = next;
    }
    return induced(nodes, edges, visited);
}

function groupLabel(node: Node, by: 'kind' | 'folder'): string {
    if (by === 'kind') return node.kind;
    const path = node.sources[0]?.path ?? '';
    const slash = path.lastIndexOf('/');
    return slash < 0 ? '.' : path.slice(0, slash) || '.';
}

export function groupGraph(nodes: readonly Node[], edges: readonly Edge[], by: 'kind' | 'folder'): GroupedGraph {
    // Groups and links are mutable accumulators until the complete projection is returned.
    const groups = new Map<string, GraphGroup>(), membership = new Map<string, string>();
    for (const node of nodes) {
        const label = groupLabel(node, by), id = JSON.stringify([by, label]);
        const group = groups.get(id) ?? { id, label, nodeIds: [], internalEdges: 0 };
        group.nodeIds.push(node.id); groups.set(id, group); membership.set(node.id, id);
    }
    const links = new Map<string, GroupLink>();
    for (const edge of edges) {
        let source = membership.get(edge.source), target = membership.get(edge.target);
        if (source === undefined || target === undefined) continue;
        if (source === target) {
            const group = groups.get(source);
            if (group) group.internalEdges++;
            continue;
        }
        if (!edge.directed && compare(source, target) > 0) [source, target] = [target, source];
        const key = JSON.stringify([source, target, edge.kind, edge.directed]);
        const link = links.get(key) ?? { source, target, kind: edge.kind, directed: edge.directed, count: 0, edgeIds: [] };
        link.count++; link.edgeIds.push(edge.id); links.set(key, link);
    }
    for (const group of groups.values()) group.nodeIds.sort(compare);
    for (const link of links.values()) link.edgeIds.sort(compare);
    return { groups: [...groups.values()].sort((a, b) => compare(a.label, b.label)), links: [...links.entries()].sort(([a], [b]) => compare(a, b)).map(([, link]) => link) };
}

export function rankHubs(nodes: readonly Node[], edges: readonly Edge[]): Hub[] {
    const incident = new Map(nodes.map(node => [node.id, new Set<string>()]));
    for (const edge of edges) {
        const source = incident.get(edge.source), target = incident.get(edge.target);
        if (!source || !target) continue;
        source.add(edge.id); target.add(edge.id);
    }
    return [...incident.entries()].map(([id, ids]) => ({ id, degree: ids.size })).sort((a, b) => b.degree - a.degree || compare(a.id, b.id));
}
