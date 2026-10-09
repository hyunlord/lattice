import type { Finding, Node, Snapshot } from '../dist/core/model.js';
import type { JsonValue } from '../dist/core/canonical.js';
import type { BrowserGraph } from './data.js';
import { compareRecords, nodeIdentity, snapshotComparisons } from './history-model.js';
import { valueKey } from './list-model.js';

export type HistoryEntry = { readonly snapshot: Snapshot; readonly graph?: BrowserGraph; readonly error?: string; };
export type FacetBucket = { readonly value: JsonValue | undefined; readonly valueKey: string; readonly counts: readonly (number | null)[]; };
export type FacetTrend = { readonly key: string; readonly buckets: readonly FacetBucket[]; };
export function facetTrends(entries: readonly HistoryEntry[], layer: string, hiddenKinds: ReadonlySet<string> = new Set()): FacetTrend[] {
    const observations = entries.map(entry => {
        if (!entry.graph) return undefined;
        const nodes = entry.graph.nodes.filter(node => String(node.attributes['layer'] ?? '') === layer && !hiddenKinds.has(node.kind));
        const ids = new Set(nodes.map(node => node.id));
        return { ids, facets: entry.graph.facets.filter(facet => ids.has(facet.nodeId)) };
    });
    const keys = [...new Set(observations.flatMap(observation => observation?.facets.map(facet => facet.key) ?? []))].sort();
    return keys.map(key => {
        const values = new Map<string, JsonValue | undefined>();
        const counts = observations.map(observation => {
            if (!observation) return undefined;
            const buckets = new Map<string, Set<string>>(), classified = new Set<string>();
            for (const facet of observation.facets.filter(facet => facet.key === key)) {
                const encoded = valueKey(facet.value), ids = buckets.get(encoded) ?? new Set<string>();
                values.set(encoded, facet.value); ids.add(facet.nodeId); buckets.set(encoded, ids); classified.add(facet.nodeId);
            }
            const missing = [...observation.ids].filter(id => !classified.has(id));
            values.set(valueKey(undefined), undefined); buckets.set(valueKey(undefined), new Set(missing));
            return buckets;
        });
        return { key, buckets: [...values].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([encoded, value]) => ({ value, valueKey: encoded, counts: counts.map(count => count ? count.get(encoded)?.size ?? 0 : null) })) };
    });
}

export type FindingTransition = {
    readonly ruleId: string;
    readonly status: 'new-failure' | 'resolved-failure' | 'failure-observed' | 'failure-unobserved' | 'added' | 'removed' | 'changed';
    readonly previous: Finding | undefined;
    readonly current: Finding | undefined;
};
export function findingTransitions(before: BrowserGraph, after: BrowserGraph, layer: string): FindingTransition[] {
    const previous = snapshotComparisons(before, before.nodes, layer).findings;
    const current = snapshotComparisons(after, after.nodes, layer).findings;
    return compareRecords(previous, current).map(change => {
        const oldStatus = change.previous?.gate?.status, newStatus = change.current?.gate?.status;
        let status: FindingTransition['status'] = !change.previous ? 'added' : !change.current ? 'removed' : 'changed';
        if (newStatus === 'fail' && oldStatus !== 'fail') status = oldStatus === 'pass' ? 'new-failure' : 'failure-observed';
        if (oldStatus === 'fail' && newStatus !== 'fail') status = newStatus === 'pass' ? 'resolved-failure' : 'failure-unobserved';
        return { ruleId: change.id, status, previous: change.previous, current: change.current };
    });
}

export type NodeObservation = {
    readonly snapshot: Snapshot;
    readonly node: Node | undefined;
    readonly previous: Node | undefined;
    readonly previousSnapshot: Snapshot | undefined;
    readonly status: 'unknown' | 'first-observed' | 'present' | 'absent' | 'added' | 'removed' | 'changed';
    readonly firstObserved: boolean;
    readonly sourceMoved: boolean;
    readonly error: string | undefined;
};
export function nodeTimeline(entries: readonly HistoryEntry[], node: Node): NodeObservation[] {
    const identity = nodeIdentity(node), layer = String(node.attributes['layer'] ?? '');
    let seen = false;
    return entries.map((entry, index) => {
        const previousEntry = entries[index - 1], graph = entry.graph;
        const current = graph?.nodes.find(candidate => nodeIdentity(candidate) === identity);
        const previous = previousEntry?.graph?.nodes.find(candidate => nodeIdentity(candidate) === identity);
        let status: NodeObservation['status'] = graph ? current ? 'present' : 'absent' : 'unknown';
        if (graph && previousEntry?.graph) {
            if (current && !previous) status = 'added';
            if (!current && previous) status = 'removed';
            if (current && previous && compareRecords(snapshotComparisons(previousEntry.graph, [previous], layer).nodes, snapshotComparisons(graph, [current], layer).nodes).length) status = 'changed';
        }
        const firstObserved = !!current && !seen;
        if (firstObserved) { seen = true; if (!previousEntry?.graph) status = 'first-observed'; }
        const paths = (record: Node) => JSON.stringify([...new Set(record.sources.map(source => source.path))].sort());
        return { snapshot: entry.snapshot, node: current, previous, previousSnapshot: previousEntry?.graph ? previousEntry.snapshot : undefined, status, firstObserved, sourceMoved: !!current && !!previous && paths(current) !== paths(previous), error: entry.error };
    });
}
