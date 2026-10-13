import type { Edge, Facet, Finding, Node, Source } from '../dist/core/model.js';
import type { LogicNode } from '../dist/query/logic-model.js';
import { layerOf, page } from './mcp-query-scope.mjs';

const textLimit = 240;
const evidenceLimit = 3;
function sourceSpan(source: Source) {
    return { path: source.path, line: source.line, ...(source.endLine === undefined ? {} : { endLine: source.endLine }), contentHash: source.contentHash };
}
export function compactNode(node: Node, args: Record<string, unknown>) {
    const description = node.attributes['description'];
    const summary = typeof description === 'string' ? description.slice(0, textLimit) : null;
    const selected = page(node.sources, args), items = selected.items.slice(0, evidenceLimit).map(sourceSpan);
    return {
        id: node.id, kind: node.kind, name: node.name, layer: layerOf(node), contentHash: node.contentHash,
        summary, sources: { ...selected, items, preview: { limit: evidenceLimit, omittedInPage: selected.items.length - items.length, fullRequest: { name: 'lattice_node', arguments: { id: node.id, layer: layerOf(node), offset: selected.offset, limit: selected.limit, compact: false } } } },
        omitted: { attributes: Object.keys(node.attributes).length, summaryCharacters: typeof description === 'string' ? description.length - (summary?.length ?? 0) : 0, sources: selected.total - items.length },
    };
}
export function compactLogicNode(item: LogicNode, args: Record<string, unknown>) {
    const packageIds = item.packageIds.slice(0, evidenceLimit);
    const entrypoints = item.entrypoints.slice(0, evidenceLimit).map(entry => ({
        category: entry.category.slice(0, textLimit), rule: entry.rule.slice(0, textLimit), source: sourceSpan(entry.source),
        ...(entry.category.length > textLimit ? { omittedCategoryCharacters: entry.category.length - textLimit } : {}),
        ...(entry.rule.length > textLimit ? { omittedRuleCharacters: entry.rule.length - textLimit } : {}),
    }));
    return { node: compactNode(item.node, args), packageIds, entrypoints, omittedPackageIds: item.packageIds.length - packageIds.length, omittedEntrypoints: item.entrypoints.length - entrypoints.length };
}
export function compactEdge(edge: Edge, targetLayer: string) {
    const identity = { id: edge.id, kind: edge.kind, source: edge.source, target: edge.target, directed: edge.directed, targetLayer };
    const resolution = edge.attributes?.['resolution'];
    return { ...identity, resolution: typeof resolution === 'string' ? resolution : null, omittedFields: Object.keys(edge).length + 1 - Object.keys(identity).length };
}
export function compactFacet(facet: Facet) {
    const identity = { id: facet.id, nodeId: facet.nodeId, key: facet.key };
    return { ...identity, omittedFields: Object.keys(facet).length - Object.keys(identity).length };
}
export function compactFinding(finding: Finding) {
    const identity = { id: finding.id, ruleId: finding.ruleId, severity: finding.severity };
    return { ...identity, omittedFields: Object.keys(finding).length - Object.keys(identity).length };
}
