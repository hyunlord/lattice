import { residentIndex, residentOverview } from './mcp-resident-index.mjs';
import { logicEntrypoints, logicCalls, logicFlow } from '../dist/query/logic-model.js';
import type { Graph } from '../dist/core/model.js';
import { McpArgumentError, type ToolName } from './mcp-schema.mjs';
import { findNodes, layerOf, page, pageJson, scopeGraph, stringArg, type Link } from './mcp-query-scope.mjs';
import { matrixQuery, traceQuery } from './mcp-query-relations.mjs';

export function queryGraph(name: ToolName, args: Record<string, unknown>, graph: Graph, presentation: unknown, link: Link): object {
    const scope = scopeGraph(graph, presentation, args);
    const summary = { graphHash: graph.hash, repository: graph.repository, layer: scope.layer };
    switch (name) {
        case 'lattice_entrypoints': return { ...summary, ...logicEntrypoints(scope, { ...(typeof args['offset'] === 'number' ? { offset: args['offset'] } : {}), ...(typeof args['limit'] === 'number' ? { limit: args['limit'] } : {}) }), link: link('/logic', { layer: scope.layer }) };
        case 'lattice_calls': return { ...summary, ...logicCalls(scope, { id: stringArg(args, 'id') ?? '', ...(typeof args['offset'] === 'number' ? { offset: args['offset'] } : {}), ...(typeof args['limit'] === 'number' ? { limit: args['limit'] } : {}), ...(args['direction'] === 'in' || args['direction'] === 'out' || args['direction'] === 'both' ? { direction: args['direction'] } : {}), includeEstimated: args['includeEstimated'] === true }), link: link('/logic', { layer: scope.layer, id: stringArg(args, 'id') ?? '' }) };
        case 'lattice_flow': return { ...summary, ...logicFlow(scope, { id: stringArg(args, 'id') ?? '', ...(typeof args['depth'] === 'number' ? { depth: args['depth'] } : {}), ...(typeof args['maxNodes'] === 'number' ? { maxNodes: args['maxNodes'] } : {}), ...(typeof args['maxEdges'] === 'number' ? { maxEdges: args['maxEdges'] } : {}), includeEstimated: args['includeEstimated'] === true }), link: link('/logic', { layer: scope.layer, id: stringArg(args, 'id') ?? '' }) };
        case 'lattice_overview': {
            const overview = residentOverview(scope), distribution = overview.distribution;
            const facetDistributions = overview.facets.map(facet => ({ key: facet.key, values: page(facet.values, args) }));
            return { ...summary, facetDistributions: page(facetDistributions, args), layers: page(scope.layers, args), counts: { nodes: scope.nodes.length, edges: scope.edges.length, facets: scope.facets.length, findings: scope.findings.length }, distribution: page(distribution, args), findings: page(scope.findings.map(finding => ({ id: finding.id, ruleId: finding.ruleId, severity: finding.severity, message: finding.message, targetCount: finding.targetIds.length, gate: finding.gate ?? null })), args), views: page([...graph.views, ...overview.views].map(view => ({ id: view.id, type: view.type, label: view.label })), args), link: link('/home', { layer: scope.layer }) };
        }
        case 'lattice_find':
            return { ...summary, ...page(findNodes(scope, args).map(node => ({ ...node, attributes: pageJson(node.attributes, args), sources: page(node.sources, args), link: link(`/node/${encodeURIComponent(node.id)}`, { layer: scope.layer }) })), args), link: link('/list', { layer: scope.layer, ...(stringArg(args, 'kind') ? { kind: stringArg(args, 'kind') ?? '' } : {}), ...(stringArg(args, 'q') ? { q: stringArg(args, 'q') ?? '' } : {}) }) };
        case 'lattice_node': {
            const node = scope.nodes.find(entry => entry.id === args['id']);
            if (!node) throw new McpArgumentError('id', 'node is absent or hidden in the selected layer');
            const index = residentIndex(graph), incident = index.incident.get(node.id) ?? [];
            const edges = incident.map(edge => ({ ...edge, sources: page(edge.sources, args), targetLayer: layerOf(index.nodes.get(edge.source === node.id ? edge.target : edge.source) ?? node) }));
            return { ...summary, node: { ...node, attributes: pageJson(node.attributes, args), sources: page(node.sources, args) }, incoming: page(edges.filter(edge => edge.directed && edge.target === node.id), args), outgoing: page(edges.filter(edge => edge.directed && edge.source === node.id), args), undirected: page(edges.filter(edge => !edge.directed), args), facets: page(scope.facets.filter(facet => facet.nodeId === node.id).map(facet => ({ ...facet, sources: page(facet.sources, args) })), args), findings: page(scope.findings.filter(finding => finding.targetIds.includes(node.id)).map(finding => ({ ...finding, metrics: pageJson(finding.metrics, args), targetIds: page(finding.targetIds, args), sources: page(finding.sources, args) })), args), intent: node.attributes['intent'] ?? null, implementation: node.attributes['implementation'] ?? null, link: link(`/node/${encodeURIComponent(node.id)}`, { layer: scope.layer }) };
        }
        case 'lattice_trace': return { ...summary, ...traceQuery(scope, args, link) };
        case 'lattice_matrix': return { ...summary, ...matrixQuery(graph, scope, args, link) };
        case 'lattice_findings': {
            const findings = scope.findings.filter(finding => (!args['severity'] || finding.severity === args['severity']) && (!args['rule'] || finding.ruleId === args['rule']) && (!args['node'] || finding.targetIds.includes(String(args['node']))) && (!args['gate'] || (finding.gate?.status ?? 'none') === args['gate']));
            return { ...summary, ...page(findings.map(finding => ({ ...finding, metrics: pageJson(finding.metrics, args), targetIds: page(finding.targetIds, args), sources: page(finding.sources, args) })), args), link: link('/home', { layer: scope.layer }) };
        }
        case 'lattice_interpretation_context': case 'lattice_write_interpretation': case 'lattice_draft_lens': case 'lattice_diff': case 'lattice_freshness': throw new McpArgumentError('name', `${name} requires repository I/O`);
        default: { const exhaustive: never = name; throw new McpArgumentError('name', String(exhaustive)); }
    }
}
