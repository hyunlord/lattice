import { canonicalJson } from "./canonical.js";
import { semanticRecord } from "./graph.js";
import type { Edge, Facet, Finding, Graph, Node, Source, View } from "./model.js";

export type RecordChange<T> = {
    readonly id: string;
    readonly before: T;
    readonly after: T;
};
export type RecordDiff<T> = {
    readonly added: readonly T[];
    readonly removed: readonly T[];
    readonly changed: readonly RecordChange<T>[];
};
export type GraphDiff = {
    readonly nodes: RecordDiff<Node>;
    readonly edges: RecordDiff<Edge>;
    readonly facets: RecordDiff<Facet>;
    readonly findings: RecordDiff<Finding>;
    readonly views: RecordDiff<View>;
};

function diffRecords<T extends { readonly id: string; readonly sources: readonly Source[]; }>(before: readonly T[], after: readonly T[]): RecordDiff<T> {
    const previous = new Map(before.map(record => [record.id, record]));
    const current = new Map(after.map(record => [record.id, record]));
    const added: T[] = [];
    const removed: T[] = [];
    const changed: RecordChange<T>[] = [];
    for (const id of [...new Set([...previous.keys(), ...current.keys()])].sort()) {
        const left = previous.get(id);
        const right = current.get(id);
        if (left === undefined && right !== undefined) added.push(right);
        else if (left !== undefined && right === undefined) removed.push(left);
        else if (left !== undefined && right !== undefined && canonicalJson(semanticRecord(left)) !== canonicalJson(semanticRecord(right))) {
            changed.push({ id, before: left, after: right });
        }
    }
    return { added, removed, changed };
}

/** Compare graph records by stable ID; observation metadata does not constitute a change. */
export function diffGraphs(before: Graph, after: Graph): GraphDiff {
    return {
        nodes: diffRecords(before.nodes, after.nodes),
        edges: diffRecords(before.edges, after.edges),
        facets: diffRecords(before.facets, after.facets),
        findings: diffRecords(before.findings, after.findings),
        views: diffRecords(before.views, after.views),
    };
}
