import { automaticViews } from '../dist/query/views-model.js';
import { canonicalJson, type JsonValue } from '../dist/core/canonical.js';
import type { Scope } from './mcp-query-scope.mjs';
import type { Graph, Node, Edge } from '../dist/core/model.js';
type ResidentIndex = { readonly nodes: ReadonlyMap<string, Node>; readonly incident: ReadonlyMap<string, readonly Edge[]>; };
const indexes = new WeakMap<Graph, ResidentIndex>();
/** Immutable graph identity binds indexes to exactly one observed source generation. */
export function residentIndex(graph: Graph): ResidentIndex {
    const cached = indexes.get(graph);
    if (cached) return cached;
    const incident = new Map<string, Edge[]>();
    const add = (id: string, edge: Edge) => { const edges = incident.get(id) ?? []; edges.push(edge); incident.set(id, edges); };
    for (const edge of graph.edges) { add(edge.source, edge); if (edge.target !== edge.source) add(edge.target, edge); }
    const index = { nodes: new Map(graph.nodes.map(node => [node.id, node])), incident };
    indexes.set(graph, index);
    return index;
}

type OverviewIndex = { readonly views: ReturnType<typeof automaticViews>; readonly distribution: readonly { readonly kind: string; readonly count: number; }[]; readonly facets: readonly { readonly key: string; readonly values: readonly { readonly value: JsonValue; readonly count: number; }[]; }[]; };
const overviews = new WeakMap<Scope, OverviewIndex>();
export function residentOverview(scope: Scope): OverviewIndex {
    const cached = overviews.get(scope);
    if (cached) return cached;
    const kinds = new Map<string, number>();
    for (const node of scope.nodes) kinds.set(node.kind, (kinds.get(node.kind) ?? 0) + 1);
    const facets = new Map<string, Map<string, { readonly value: JsonValue; readonly nodes: Set<string>; }>>();
    for (const facet of scope.facets) {
        let values = facets.get(facet.key);
        if (!values) { values = new Map(); facets.set(facet.key, values); }
        const key = canonicalJson(facet.value);
        let value = values.get(key);
        if (!value) { value = { value: facet.value, nodes: new Set() }; values.set(key, value); }
        value.nodes.add(facet.nodeId);
    }
    const compare = ([a]: readonly [string, unknown], [b]: readonly [string, unknown]) => a < b ? -1 : a > b ? 1 : 0;
    const result = {
        views: automaticViews(scope.nodes, scope.edges),
        distribution: [...kinds].sort(compare).map(([kind, count]) => ({ kind, count })),
        facets: [...facets].sort(compare).map(([key, values]) => ({ key, values: [...values].sort(compare).map(([, value]) => ({ value: value.value, count: value.nodes.size })) })),
    };
    overviews.set(scope, result);
    return result;
}
