import { canonicalJson } from '../dist/core/canonical.js';
import type { Graph } from '../dist/core/model.js';
import { automaticViews } from '../dist/query/views-model.js';
import { McpArgumentError, type ToolName } from './mcp-schema.mjs';
import { findNodes, layerOf, page, pageJson, scopeGraph, stringArg, type Link } from './mcp-query-scope.mjs';
import { matrixQuery, traceQuery } from './mcp-query-relations.mjs';

export function queryGraph(name: ToolName, args: Record<string, unknown>, graph: Graph, presentation: unknown, link: Link): object {
    const scope = scopeGraph(graph, presentation, args);
    const summary = { graphHash: graph.hash, repository: graph.repository, layer: scope.layer };
    switch (name) {
        case 'lattice_overview': {
            const distribution = [...new Set(scope.nodes.map(node => node.kind))].sort().map(kind => ({ kind, count: scope.nodes.filter(node => node.kind === kind).length }));
            const facetDistributions = [...new Set(scope.facets.map(facet => facet.key))].sort().map(key => {
                const facets = scope.facets.filter(facet => facet.key === key);
                const values = [...new Map(facets.map(facet => [canonicalJson(facet.value), facet.value])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
                return { key, values: page(values.map(([valueKey, value]) => ({ value, count: new Set(facets.filter(facet => canonicalJson(facet.value) === valueKey).map(facet => facet.nodeId)).size })), args) };
            });
            return { ...summary, facetDistributions: page(facetDistributions, args), layers: page(scope.layers, args), counts: { nodes: scope.nodes.length, edges: scope.edges.length, facets: scope.facets.length, findings: scope.findings.length }, distribution: page(distribution, args), findings: page(scope.findings.map(finding => ({ id: finding.id, ruleId: finding.ruleId, severity: finding.severity, message: finding.message, targetCount: finding.targetIds.length, gate: finding.gate ?? null })), args), views: page([...graph.views, ...automaticViews(scope.nodes, scope.edges)].map(view => ({ id: view.id, type: view.type, label: view.label })), args), link: link('/home', { layer: scope.layer }) };
        }
        case 'lattice_find':
            return { ...summary, ...page(findNodes(scope, args).map(node => ({ ...node, attributes: pageJson(node.attributes, args), sources: page(node.sources, args), link: link(`/node/${encodeURIComponent(node.id)}`, { layer: scope.layer }) })), args), link: link('/list', { layer: scope.layer, ...(stringArg(args, 'kind') ? { kind: stringArg(args, 'kind') ?? '' } : {}), ...(stringArg(args, 'q') ? { q: stringArg(args, 'q') ?? '' } : {}) }) };
        case 'lattice_node': {
            const node = scope.nodes.find(entry => entry.id === args['id']);
            if (!node) throw new McpArgumentError('id', 'node is absent or hidden in the selected layer');
            const incident = graph.edges.filter(edge => edge.source === node.id || edge.target === node.id);
            const edges = incident.map(edge => ({ ...edge, sources: page(edge.sources, args), targetLayer: layerOf(graph.nodes.find(entry => entry.id === (edge.source === node.id ? edge.target : edge.source)) ?? node) }));
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
