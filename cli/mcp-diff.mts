import type { Graph } from '../dist/core/model.js';
import { compareRecords, snapshotComparisons, type Comparison } from '../dist/query/history-model.js';
import { page, pageJson, scopeGraph } from './mcp-query-scope.mjs';

type DiffRecord = Graph['nodes'][number] | Graph['edges'][number] | Graph['facets'][number] | Graph['findings'][number];
function evidence(record: DiffRecord | undefined, args: Record<string, unknown>): object {
    if (!record) throw new Error('Comparison record is unavailable');
    return {
        ...record, sources: page(record.sources, args),
        ...('attributes' in record && record.attributes ? { attributes: pageJson(record.attributes, args) } : {}),
        ...('metrics' in record ? { metrics: pageJson(record.metrics, args), targetIds: page(record.targetIds, args) } : {}),
        ...('value' in record ? { value: pageJson(record.value, args) } : {}),
    };
}
function changes<T extends DiffRecord>(before: readonly Comparison<T>[], after: readonly Comparison<T>[], args: Record<string, unknown>) {
    const records = compareRecords(before, after);
    return {
        added: page(records.filter(record => record.previous === undefined).map(record => ({ id: record.id, after: evidence(record.current, args) })), args),
        removed: page(records.filter(record => record.current === undefined).map(record => ({ id: record.id, before: evidence(record.previous, args) })), args),
        changed: page(records.filter(record => record.previous !== undefined && record.current !== undefined).map(record => ({ id: record.id, before: evidence(record.previous, args), after: evidence(record.current, args) })), args),
    };
}
/** The web-selected layer is authoritative for both revisions, including incident correspondence edges. */
export function webDiff(beforeGraph: Graph, afterGraph: Graph, presentation: unknown, args: Record<string, unknown>) {
    const afterScope = scopeGraph(afterGraph, presentation, args);
    if (beforeGraph.nodes === afterGraph.nodes && beforeGraph.edges === afterGraph.edges && beforeGraph.facets === afterGraph.facets && beforeGraph.findings === afterGraph.findings) {
        return { layer: afterScope.layer, nodes: changes([], [], args), edges: changes([], [], args), facets: changes([], [], args), findings: changes([], [], args) };
    }
    const beforeScope = scopeGraph(beforeGraph, presentation, { ...args, layer: afterScope.layer });
    const before = snapshotComparisons(beforeGraph, beforeScope.nodes, afterScope.layer);
    const after = snapshotComparisons(afterGraph, afterScope.nodes, afterScope.layer);
    return {
        layer: afterScope.layer,
        nodes: changes(before.nodes, after.nodes, args),
        edges: changes(before.edges, after.edges, args),
        facets: changes(before.facets, after.facets, args),
        findings: changes(before.findings, after.findings, args),
    };
}
