import type { Graph, Node } from '../dist/core/model.js';
import type { JsonValue } from '../dist/core/canonical.js';
import { canonicalJson } from '../dist/core/canonical.js';
import { filterGraph } from '../dist/query/explore-model.js';
import { object } from './mcp-schema.mjs';
export type Link = (route: string, params?: Record<string, string>) => string;
export function stringArg(args: Record<string, unknown>, key: string): string | undefined { const value = args[key]; return typeof value === 'string' ? value : undefined; }
export function page<T>(values: readonly T[], args: Record<string, unknown>) {
    const offset = typeof args['offset'] === 'number' ? args['offset'] : 0, limit = typeof args['limit'] === 'number' ? args['limit'] : 50;
    return { items: values.slice(offset, offset + limit), total: values.length, offset, limit, truncated: offset > 0 || offset + limit < values.length, nextOffset: offset + limit < values.length ? offset + limit : null };
}
/** Nested source data keeps scalar values intact and exposes a continuation for every array. */
export function pageJson(value: JsonValue, args: Record<string, unknown>): JsonValue {
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
        const selected = page(value, args);
        return { ...selected, items: selected.items.map(item => pageJson(item, args)) };
    }
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, pageJson(child, args)]));
}
export const layerOf = (node: Node): string => String(node.attributes['layer'] ?? '');
export function scopeGraph(graph: Graph, presentation: unknown, args: Record<string, unknown>) {
    const config = object(presentation) ? presentation : {}, kinds = config['kinds'];
    const hidden = new Set(Array.isArray(kinds) ? kinds.filter(object).filter(kind => kind['hidden'] === true).map(kind => kind['id']) : []);
    const visible = graph.nodes.filter(node => !hidden.has(node.kind));
    const layers = [...new Set(visible.map(layerOf))];
    const requestedNode = stringArg(args, 'id');
    const node = requestedNode ? visible.find(entry => entry.id === requestedNode) : undefined;
    const preferred = typeof config['defaultLayer'] === 'string' ? config['defaultLayer'] : '';
    const layer = stringArg(args, 'layer') ?? (node ? layerOf(node) : layers.includes(preferred) ? preferred : layers[0] ?? '');
    const nodes = visible.filter(entry => layerOf(entry) === layer), ids = new Set(nodes.map(entry => entry.id));
    const allLayerIds = new Set(graph.nodes.filter(entry => layerOf(entry) === layer).map(entry => entry.id));
    const edges = graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
    const facets = graph.facets.filter(facet => ids.has(facet.nodeId));
    const findings = graph.findings.filter(finding => finding.targetIds.length ? finding.targetIds.some(id => allLayerIds.has(id)) : !layer || finding.metrics['layer'] === layer);
    return { layer, layers, nodes, edges, facets, findings };
}
export type Scope = ReturnType<typeof scopeGraph>;
export function findNodes(scope: Scope, args: Record<string, unknown>) {
    const kind = stringArg(args, 'kind'), q = stringArg(args, 'q');
    const projected = filterGraph(scope.nodes, scope.edges, scope.facets, { ...(kind ? { kind } : {}), ...(q ? { q } : {}) });
    const tags = Array.isArray(args['tags']) ? args['tags'] : [], facets = object(args['facets']) ? args['facets'] : {};
    return projected.nodes.filter(node => {
        const nodeTags = node.attributes['tags'];
        return tags.every(tag => Array.isArray(nodeTags) && nodeTags.includes(tag)) && Object.entries(facets).every(([key, value]) => scope.facets.some(facet => facet.nodeId === node.id && facet.key === key && canonicalJson(facet.value) === canonicalJson(value)));
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
