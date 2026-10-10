import type { Node as GraphNode, Edge, Facet, Graph } from '../core/model.js';
type BrowserGraph = Pick<Graph, 'nodes' | 'edges' | 'facets' | 'findings'>;
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const layerOf = (node: GraphNode) => String(node.attributes['layer'] ?? '');
function layerFindings(data: BrowserGraph, layer: string) {
    const ids = new Set(data.nodes.filter(node => layerOf(node) === layer).map(node => node.id));
    return data.findings.filter(finding => finding.targetIds.length ? finding.targetIds.some(id => ids.has(id)) : (!layer || finding.metrics?.['layer'] === layer));
}
export function semantic(value: unknown, record = true): unknown {
    if (Array.isArray(value)) return value.map(item => semantic(item, false));
    if (object(value)) return Object.fromEntries(Object.keys(value).sort().filter(key => !record || !['sources', 'contentHash'].includes(key)).map(key => [key, semantic(value[key], false)]));
    return value;
}
export function nodeIdentity(node: GraphNode) { return JSON.stringify([layerOf(node), node.kind, node.attributes['originalId'] ?? node.id]); }
function comparisonRecords<T>(records: readonly T[], identity: (record: T) => string, normalize: (record: T) => unknown) { return records.map(record => ({ key: identity(record), record, value: normalize(record) })); }
export function snapshotComparisons(data: BrowserGraph, selectedNodes: readonly GraphNode[], layer: string) {
    const identities = new Map(data.nodes.map(node => [node.id, nodeIdentity(node)]));
    const endpoint = (id: string) => identities.get(id) || id;
    const selectedIds = new Set(selectedNodes.map(node => node.id));
    const edgeIdentity = (edge: Edge) => JSON.stringify([endpoint(edge.source), endpoint(edge.target), edge.kind, edge.field, edge.directed, edge.attributes?.['ruleId'] ?? '']);
    const edgeIdentities = new Map(data.edges.map(edge => [edge.id, edgeIdentity(edge)]));
    const facetIdentity = (facet: Facet) => JSON.stringify([endpoint(facet.nodeId), facet.key, facet.ruleId]);
    return {
        nodes: comparisonRecords(selectedNodes, nodeIdentity, node => {
            const attributes = { ...node.attributes };
            if (attributes['originalId'] !== undefined) delete attributes['identityNamespace'];
            return { ...node, id: nodeIdentity(node), attributes };
        }),
        findings: comparisonRecords(layerFindings(data, layer), finding => finding.ruleId, finding => {
            const metrics = { ...finding.metrics };
            if (finding.ruleId === 'auto:highest-degree-hubs' && finding.basis === 'computed') {
                if (Array.isArray(metrics['degrees'])) metrics['degrees'] = metrics['degrees'].map(value => object(value) && typeof value['nodeId'] === 'string' ? { ...value, nodeId: endpoint(value['nodeId']) } : value).sort((left, right) => {
                    const a = JSON.stringify(semantic(left)), b = JSON.stringify(semantic(right));
                    return a < b ? -1 : a > b ? 1 : 0;
                });
                if (Array.isArray(metrics['edgeIds'])) metrics['edgeIds'] = metrics['edgeIds'].map(value => typeof value === 'string' ? edgeIdentities.get(value) ?? value : value).sort();
            }
            return { ...finding, id: finding.ruleId, targetIds: finding.targetIds.map(endpoint).sort(), metrics };
        }),
        edges: comparisonRecords((data.edges || []).filter(edge => selectedIds.has(edge.source) || selectedIds.has(edge.target)), edgeIdentity, edge => ({ ...edge, id: edgeIdentity(edge), source: endpoint(edge.source), target: endpoint(edge.target) })),
        facets: comparisonRecords((data.facets || []).filter(facet => selectedIds.has(facet.nodeId)), facetIdentity, facet => ({ ...facet, id: facetIdentity(facet), nodeId: endpoint(facet.nodeId) })),
    };
}
export type Comparison<T> = { readonly key: string; readonly record: T; readonly value: unknown; };
export type RecordChange<T> = { readonly id: string; readonly previous: T | undefined; readonly current: T | undefined; readonly status: string; };
export function compareRecords<T>(before: readonly Comparison<T>[], after: readonly Comparison<T>[]): RecordChange<T>[] {
    const left = new Map(before.map(item => [item.key, item])); const right = new Map(after.map(item => [item.key, item]));
    return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(id => {
        const previous = left.get(id), current = right.get(id);
        if (previous && current && JSON.stringify(semantic(previous.value)) === JSON.stringify(semantic(current.value))) return [];
        return [{ id, previous: previous?.record, current: current?.record, status: !previous ? '추가' : !current ? '삭제' : '변경' }];
    });
}

export type SourceArea = { readonly directory: string; readonly count: number; };
export type ChangedArea = SourceArea & { readonly changes: readonly RecordChange<GraphNode>[]; };
function directories(nodes: readonly GraphNode[]): string[] {
    return [...new Set(nodes.flatMap(node => node.sources.length ? node.sources.map(source => {
        const path = source.path;
        return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) || '/' : '.';
    }) : ['(출처 없음)']))];
}
function areaOrder(left: SourceArea, right: SourceArea): number {
    return right.count - left.count || (left.directory < right.directory ? -1 : left.directory > right.directory ? 1 : 0);
}
export function sourceInventory(nodes: readonly GraphNode[]): SourceArea[] {
    const areas = new Map<string, Set<string>>();
    for (const node of nodes) for (const directory of directories([node])) {
        const ids = areas.get(directory) ?? new Set<string>();
        ids.add(node.id); areas.set(directory, ids);
    }
    return [...areas].map(([directory, ids]) => ({ directory, count: ids.size })).sort(areaOrder);
}
// Layer and hidden-kind scope are independent caller-owned presentation constraints.
export function changedAreas(before: BrowserGraph, after: BrowserGraph, layer: string, hiddenKinds: ReadonlySet<string> = new Set()): ChangedArea[] {
    const select = (data: BrowserGraph) => data.nodes.filter(node => layerOf(node) === layer && !hiddenKinds.has(node.kind));
    const previous = snapshotComparisons(before, select(before), layer), current = snapshotComparisons(after, select(after), layer);
    const changes = compareRecords(previous.nodes, current.nodes);
    const changedIds = new Set(changes.map(change => change.id));
    const previousNodes = new Map(previous.nodes.map(item => [item.key, item.record]));
    const paths = (node: GraphNode) => JSON.stringify([...new Set(node.sources.map(source => source.path))].sort());
    for (const item of current.nodes) {
        const old = previousNodes.get(item.key);
        if (old && !changedIds.has(item.key) && paths(old) !== paths(item.record)) changes.push({ id: item.key, previous: old, current: item.record, status: '출처 이동' });
    }
    changes.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const areas = new Map<string, Map<string, RecordChange<GraphNode>>>();
    for (const change of changes) {
        const records = [change.previous, change.current].filter((node): node is GraphNode => node !== undefined);
        for (const directory of directories(records)) {
            const changes = areas.get(directory) ?? new Map<string, RecordChange<GraphNode>>();
            changes.set(change.id, change); areas.set(directory, changes);
        }
    }
    return [...areas].map(([directory, changes]) => ({ directory, count: changes.size, changes: [...changes.values()] })).sort(areaOrder);
}
