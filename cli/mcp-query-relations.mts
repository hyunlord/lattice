import type { Graph } from '../dist/core/model.js';
import { neighborhood, shortestPath } from '../dist/query/explore-model.js';
import { automaticViews, normalizeView } from '../dist/query/views-model.js';
import { McpArgumentError } from './mcp-schema.mjs';
import { page, stringArg, type Scope, type Link } from './mcp-query-scope.mjs';
export function traceQuery(scope: Scope, args: Record<string, unknown>, link: Link) {
    const from = stringArg(args, 'from') ?? '', to = stringArg(args, 'to'), edgeKind = stringArg(args, 'edgeKind');
    const edges = scope.edges.filter(edge => !edgeKind || edge.kind === edgeKind);
    const params = { layer: scope.layer, from, ...(to ? { to } : {}), ...(edgeKind ? { edgeKind } : {}) };
    if (to !== undefined) {
        const path = shortestPath(scope.nodes, edges, from, to);
        return { mode: 'path', found: path !== undefined, nodes: page(path?.nodeIds.map(id => scope.nodes.find(node => node.id === id)).filter(node => node !== undefined) ?? [], args), edges: page(path?.edgeIds.map(id => edges.find(edge => edge.id === id)).filter(edge => edge !== undefined) ?? [], args), pathLength: path?.edgeIds.length ?? null, link: link('/explore', { ...params, mode: 'path' }) };
    }
    const hops = typeof args['hops'] === 'number' ? args['hops'] : 1;
    const direction = args['direction'] === 'in' || args['direction'] === 'both' ? args['direction'] : 'out';
    const result = neighborhood(scope.nodes, edges, from, hops, direction);
    return { mode: 'neighborhood', hops, direction, visited: result.nodes.length, nodes: page(result.nodes, args), edges: page(result.edges, args), link: link('/explore', { ...params, mode: 'neighbors', hops: String(hops), direction }) };
}
export function matrixQuery(graph: Graph, scope: Scope, args: Record<string, unknown>, link: Link) {
    const requested = stringArg(args, 'view');
    const views = [...graph.views, ...automaticViews(scope.nodes, scope.edges)];
    const view = views.find(entry => entry.type === 'matrix' && entry.id === (requested ?? 'auto-kind-matrix'));
    if (!view) throw new McpArgumentError('view', `unknown matrix ${requested}`);
    const projection = normalizeView(view, scope.nodes, scope.edges);
    if (projection.type !== 'matrix') return { id: view.id, projection, link: link(`/views/${encodeURIComponent(view.id)}`, { layer: scope.layer, origin: graph.views.includes(view) ? 'lens' : 'auto' }) };
    return {
        id: view.id, label: view.label, description: view.description, type: projection.type, mode: projection.mode, coverage: projection.coverage,
        rows: page(projection.rows.map(axis => ({ ...axis, nodeIds: page(axis.nodeIds, args) })), args),
        columns: page(projection.columns.map(axis => ({ ...axis, nodeIds: page(axis.nodeIds, args) })), args),
        cells: page(projection.cells.map(cell => ({ ...cell, nodeIds: page(cell.nodeIds, args), edgeIds: page(cell.edgeIds, args), sources: page(cell.sources, args) })), args),
        sources: page(view.sources, args), link: link(`/views/${encodeURIComponent(view.id)}`, { layer: scope.layer, origin: graph.views.includes(view) ? 'lens' : 'auto' }),
    };
}
