import type { Graph, Node, Edge, Source } from '../core/model.js';
import type { JsonValue } from '../core/canonical.js';
export type LogicGraph = Pick<Graph, 'nodes' | 'edges'>;
export type LogicPageOptions = { readonly offset?: number; readonly limit?: number; };
export type LogicEntrypoint = { readonly category: string; readonly rule: string; readonly source: Source; };
export type LogicNode = { readonly node: Node; readonly packageIds: readonly string[]; readonly entrypoints: readonly LogicEntrypoint[]; };
export type LogicFlowOptions = { readonly id: string; readonly depth?: number; readonly maxNodes?: number; readonly maxEdges?: number; readonly includeEstimated?: boolean; };
export type LogicCallOptions = LogicPageOptions & { readonly id: string; readonly direction?: 'in' | 'out' | 'both'; readonly includeEstimated?: boolean; };
export type LogicTruncation = 'depth' | 'maxNodes' | 'maxEdges';
const compare = (a: { readonly id: string; }, b: { readonly id: string; }): number => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const bounded = (value: number | undefined, fallback: number, min: number, max: number): number => Number.isInteger(value) ? Math.max(min, Math.min(max, value ?? fallback)) : fallback;
const record = (value: JsonValue | undefined): value is { readonly [key: string]: JsonValue; } => value !== null && typeof value === 'object' && !Array.isArray(value);
function entrypoints(node: Node): readonly LogicEntrypoint[] {
    const values = node.attributes['entrypoints'];
    if (!Array.isArray(values)) return [];
    return values.flatMap(value => {
        if (!record(value) || typeof value['category'] !== 'string' || typeof value['rule'] !== 'string') return [];
        const source = value['source'];
        if (!record(source) || typeof source['path'] !== 'string' || typeof source['line'] !== 'number' || typeof source['pointer'] !== 'string' || typeof source['contentHash'] !== 'string') return [];
        return [{ category: value['category'], rule: value['rule'], source: { path: source['path'], line: source['line'], pointer: source['pointer'], contentHash: source['contentHash'], ...(typeof source['url'] === 'string' ? { url: source['url'] } : {}), ...(typeof source['revision'] === 'string' ? { revision: source['revision'] } : {}), ...(typeof source['endLine'] === 'number' ? { endLine: source['endLine'] } : {}) } }];
    });
}
function index(graph: LogicGraph, includeEstimated = false) {
    const nodes = new Map(graph.nodes.filter(node => node.kind === 'function').map(node => [node.id, node]));
    const packages = graph.nodes.filter(node => node.kind === 'package');
    const packageIds = new Map<string, string[]>();
    const add = (member: string, id: string) => { const ids = packageIds.get(member) ?? []; if (!ids.includes(id)) ids.push(id); packageIds.set(member, ids); };
    for (const pkg of packages) {
        const members = pkg.attributes['memberIds'];
        if (Array.isArray(members)) for (const member of members) if (typeof member === 'string') add(member, pkg.id);
    }
    const packageSet = new Set(packages.map(node => node.id));
    for (const edge of graph.edges) if (edge.kind === 'contains' && packageSet.has(edge.source)) add(edge.target, edge.source);
    const describe = (node: Node): LogicNode => ({ node, entrypoints: entrypoints(node), packageIds: [...new Set([...(packageIds.get(node.id) ?? []), ...(packageIds.get(String(node.attributes['module'] ?? '')) ?? [])])].sort() });
    const edges = graph.edges.filter(edge => edge.kind === 'calls' && edge.directed && nodes.has(edge.source) && nodes.has(edge.target) && (edge.attributes?.['resolution'] === 'exact' || (includeEstimated && edge.attributes?.['resolution'] === 'estimated'))).sort(compare);
    return { nodes, edges, describe };
}
function page<T>(items: readonly T[], options: LogicPageOptions) {
    const offset = bounded(options.offset, 0, 0, 10000000), limit = bounded(options.limit, 50, 1, 200);
    return { items: items.slice(offset, offset + limit), total: items.length, offset, limit, truncated: offset > 0 || offset + limit < items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
export function logicNodes(graph: LogicGraph): readonly LogicNode[] {
    const data = index(graph);
    return [...data.nodes.values()].sort(compare).map(data.describe);
}
export function logicLookupBucket(id: string): string {
    let hash = 0;
    for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    return (hash % 256).toString(16).padStart(2, '0');
}
export function logicEntrypoints(graph: LogicGraph, options: LogicPageOptions = {}) {
    const data = index(graph);
    return page([...data.nodes.values()].sort(compare).map(data.describe).filter(node => node.entrypoints.length > 0), options);
}
export function logicCalls(graph: LogicGraph, options: LogicCallOptions) {
    const data = index(graph, options.includeEstimated), node = data.nodes.get(options.id), direction = options.direction ?? 'both';
    const incoming = direction === 'out' ? [] : data.edges.filter(edge => edge.target === options.id), outgoing = direction === 'in' ? [] : data.edges.filter(edge => edge.source === options.id);
    const incomingPage = page(incoming, options), outgoingPage = page(outgoing, options);
    const relatedIds = new Set([...incomingPage.items, ...outgoingPage.items].flatMap(edge => [edge.source, edge.target]));
    return { found: node !== undefined, node: node ? data.describe(node) : null, direction, incoming: incomingPage, outgoing: outgoingPage, relatedNodes: [...data.nodes.values()].filter(item => relatedIds.has(item.id)).sort(compare), basis: 'static-call-graph' as const };
}
/** Breadth-first static reachability is not an observed runtime trace or execution order. */
export function logicFlow(graph: LogicGraph, options: LogicFlowOptions) {
    const data = index(graph, options.includeEstimated), root = data.nodes.get(options.id);
    const depth = bounded(options.depth, 3, 0, 10), maxNodes = bounded(options.maxNodes, 100, 1, 500), maxEdges = bounded(options.maxEdges, 100, 1, 500);
    const nodes: (LogicNode & { readonly depth: number; })[] = [], edges: Edge[] = [], reasons = new Set<LogicTruncation>();
    const visited = new Set<string>(), outgoing = new Map<string, Edge[]>();
    for (const edge of data.edges) { const items = outgoing.get(edge.source) ?? []; items.push(edge); outgoing.set(edge.source, items); }
    if (root) { nodes.push({ ...data.describe(root), depth: 0 }); visited.add(root.id); }
    for (let cursor = 0; cursor < nodes.length; cursor++) {
        const current = nodes[cursor];
        if (!current) continue;
        const next = outgoing.get(current.node.id) ?? [];
        for (const edge of next) {
            if (current.depth >= depth) { reasons.add('depth'); continue; }
            if (edges.length >= maxEdges) { reasons.add('maxEdges'); continue; }
            const target = data.nodes.get(edge.target);
            if (!target) continue;
            if (!visited.has(target.id)) {
                if (nodes.length >= maxNodes) { reasons.add('maxNodes'); continue; }
                visited.add(target.id); nodes.push({ ...data.describe(target), depth: current.depth + 1 });
            }
            edges.push(edge);
        }
    }
    return { found: root !== undefined, root: options.id, basis: 'static-call-graph' as const, depth, maxNodes, maxEdges, nodes, edges, truncated: reasons.size > 0, truncationReasons: [...reasons].sort() };
}
