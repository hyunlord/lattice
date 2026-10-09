import { canonicalJson } from "./canonical.js";
import { validateDigest, validateGraph } from "./graph-validation.js";
import type { Digest, Graph, GraphDraft, Source } from "./model.js";

function byId<T extends { readonly id: string; }>(records: readonly T[]): T[] {
    return [...records].sort((a, b) => compare(a.id, b.id));
}
function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
function sourceIdentity(source: Source): Omit<Source, "revision" | "url"> {
    const { revision: _revision, url: _url, ...semantic } = source;
    return semantic;
}
export function semanticRecord<T extends { readonly sources: readonly Source[]; }>(record: T) {
    return { ...record, sources: record.sources.map(sourceIdentity).sort((a, b) => compare(canonicalJson(a), canonicalJson(b))) };
}
function freezeTree(value: unknown): void {
    if (value !== null && typeof value === "object") {
        for (const child of Object.values(value)) freezeTree(child);
        Object.freeze(value);
    }
}

/** Accepts typed graph records from adapters; raw files require their adapter parser. */
export function createGraph(input: GraphDraft, digest: Digest): Graph {
    canonicalJson(input);
    validateGraph(input);
    const draft = cloneValidated(input);
    const hashText = (value: unknown): string => {
        const hash = digest(canonicalJson(value));
        validateDigest(hash, "digest result");
        return hash;
    };
    const nodes = byId(draft.nodes).map(node => {
        const record = { id: node.id, kind: node.kind, name: node.name, attributes: node.attributes, sources: node.sources };
        return { ...record, contentHash: hashText(semanticRecord(record)) };
    });
    const edges = byId(draft.edges);
    const facets = byId(draft.facets);
    const findings = byId(draft.findings).map(finding => ({ ...finding, targetIds: [...finding.targetIds].sort() }));
    const views = byId(draft.views);
    const inputs = [...draft.inputs].sort((a, b) => compare(a.path, b.path));
    const payload = {
        schemaVersion: 1,
        nodes: nodes.map(semanticRecord), edges: edges.map(semanticRecord),
        facets: facets.map(semanticRecord), findings: findings.map(semanticRecord),
        views: views.map(semanticRecord), lensDigest: draft.lensDigest,
        adapterVersions: draft.adapterVersions, inputDigests: inputs,
    };
    const graph: Graph = { ...draft, schemaVersion: 1, hash: hashText(payload), nodes, edges, facets, findings, views, inputs, snapshots: byId(draft.snapshots) };
    freezeTree(graph);
    return graph;
}

function cloneValidated<T>(value: T): T {
    // This clone has a typed signature; only enumerable JSON data reaches it.
    if (value === null || typeof value !== "object") return value;
    const result = Object.assign(Array.isArray(value) ? [] : {}, value);
    for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && "value" in descriptor) {
            const child: unknown = descriptor.value;
            Object.defineProperty(result, key, { value: cloneValidated(child), enumerable: true, configurable: true, writable: true });
        }
    }
    return result;
}
