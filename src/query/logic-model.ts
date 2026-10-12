import { executionCategory, productLogicPath } from '../core/logic-policy.js';
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
type LogicIndex = ReturnType<typeof buildIndex>;
const indexes = new WeakMap<LogicGraph, Map<boolean, LogicIndex>>();
function index(graph: LogicGraph, includeEstimated = false): LogicIndex {
    let cached = indexes.get(graph);
    if (!cached) { cached = new Map(); indexes.set(graph, cached); }
    let value = cached.get(includeEstimated);
    if (!value) { value = buildIndex(graph, includeEstimated); cached.set(includeEstimated, value); }
    return value;
}
function buildIndex(graph: LogicGraph, includeEstimated: boolean) {
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
    const incoming = new Map<string, Edge[]>(), outgoing = new Map<string, Edge[]>();
    for (const edge of edges) {
        const ins = incoming.get(edge.target) ?? []; ins.push(edge); incoming.set(edge.target, ins);
        const outs = outgoing.get(edge.source) ?? []; outs.push(edge); outgoing.set(edge.source, outs);
    }
    const described = [...nodes.values()].sort(compare).map(describe);
    const priority = (node: LogicNode): number => node.entrypoints.some(entry => executionCategory(entry.category)) ? 0 : node.entrypoints.some(entry => entry.category === 'public-api') ? 1 : 2;
    const ranked = described.filter(item => productLogicPath(item.node.sources[0]?.path ?? '')).sort((a, b) => priority(a) - priority(b) || (incoming.get(b.node.id)?.length ?? 0) - (incoming.get(a.node.id)?.length ?? 0) || compare(a.node, b.node));
    const entries = ranked.filter(item => item.entrypoints.length > 0);
    return { nodes, edges, describe, described, ranked, entries, incoming, outgoing };
}
export type LogicOverviewMetadata = { readonly defaultFocus?: string; readonly executableModuleIds: readonly string[]; };
export function logicOverviewMetadata(graph: LogicGraph): LogicOverviewMetadata {
    const data = index(graph), first = data.ranked[0];
    return { ...(first ? { defaultFocus: first.node.id } : {}), executableModuleIds: [...new Set(data.ranked.filter(item => item.entrypoints.some(entry => executionCategory(entry.category))).map(item => String(item.node.attributes['module'] ?? '')))] };
}
export function rankedLogicFunctions(graph: LogicGraph): readonly Node[] {
    return index(graph).ranked.map(item => item.node);
}
function page<T>(items: readonly T[], options: LogicPageOptions) {
    const offset = bounded(options.offset, 0, 0, 10000000), limit = bounded(options.limit, 50, 1, 200);
    return { items: items.slice(offset, offset + limit), total: items.length, offset, limit, truncated: offset > 0 || offset + limit < items.length, nextOffset: offset + limit < items.length ? offset + limit : null };
}
export function logicNodes(graph: LogicGraph): readonly LogicNode[] {
    const data = index(graph);
    return data.described;
}
export function logicLookupBucket(id: string): string {
    let hash = 0;
    for (const char of id) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
    return (hash % 256).toString(16).padStart(2, '0');
}
export function logicEntrypoints(graph: LogicGraph, options: LogicPageOptions = {}) {
    const data = index(graph);
    return page(data.entries, options);
}
export function logicCalls(graph: LogicGraph, options: LogicCallOptions) {
    const data = index(graph, options.includeEstimated), node = data.nodes.get(options.id), direction = options.direction ?? 'both';
    const incoming = direction === 'out' ? [] : data.incoming.get(options.id) ?? [], outgoing = direction === 'in' ? [] : data.outgoing.get(options.id) ?? [];
    const incomingPage = page(incoming, options), outgoingPage = page(outgoing, options);
    const relatedIds = new Set([...incomingPage.items, ...outgoingPage.items].flatMap(edge => [edge.source, edge.target]));
    return { found: node !== undefined, node: node ? data.describe(node) : null, direction, incoming: incomingPage, outgoing: outgoingPage, relatedNodes: [...relatedIds].flatMap(id => data.nodes.get(id) ?? []).sort(compare), basis: 'static-call-graph' as const };
}
/** Breadth-first static reachability is not an observed runtime trace or execution order. */
export function logicFlow(graph: LogicGraph, options: LogicFlowOptions) {
    const data = index(graph, options.includeEstimated), root = data.nodes.get(options.id);
    const depth = bounded(options.depth, 3, 0, 10), maxNodes = bounded(options.maxNodes, 100, 1, 500), maxEdges = bounded(options.maxEdges, 100, 1, 500);
    const nodes: (LogicNode & { readonly depth: number; })[] = [], edges: Edge[] = [], reasons = new Set<LogicTruncation>();
    const visited = new Set<string>(), outgoing = data.outgoing;
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
