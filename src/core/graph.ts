import { canonicalJson, validateCanonical } from "./canonical.js";
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
export function recordProjector() {
    const identities = new Map<string, { readonly identity: Omit<Source, "revision" | "url">; readonly key: string; }>();
    const sources = new WeakMap<Source, { readonly identity: Omit<Source, "revision" | "url">; readonly key: string; }>();
    return <T extends { readonly sources: readonly Source[]; }>(record: T) => {
        const projected = record.sources.map(source => {
            const cached = sources.get(source);
            if (cached) return cached;
            const identity = sourceIdentity(source);
            const key = canonicalJson(identity);
            const entry = identities.get(key) ?? { identity, key };
            identities.set(key, entry);
            sources.set(source, entry);
            return entry;
        }).sort((a, b) => compare(a.key, b.key)).map(source => source.identity);
        return { ...record, sources: projected };
    };
}
export function semanticRecord<T extends { readonly sources: readonly Source[]; }>(record: T) {
    return recordProjector()(record);
}
function freezeTree(value: unknown): void {
    if (value !== null && typeof value === "object") {
        for (const child of Object.values(value)) freezeTree(child);
        Object.freeze(value);
    }
}

/** Accepts typed graph records from adapters; raw files require their adapter parser. */
export function createGraph(input: GraphDraft, digest: Digest): Graph {
    validateCanonical(input);
    validateGraph(input);
    const draft = cloneValidated(input);
    const semantic = recordProjector();
    const hashText = (value: unknown): string => {
        const hash = digest(canonicalJson(value));
        validateDigest(hash, "digest result");
        return hash;
    };
    const nodes = byId(draft.nodes).map(node => {
        const record = { id: node.id, kind: node.kind, name: node.name, attributes: node.attributes, sources: node.sources };
        return { ...record, contentHash: hashText(semantic(record)) };
    });
    const edges = byId(draft.edges);
    const facets = byId(draft.facets);
    const findings = byId(draft.findings).map(finding => ({ ...finding, targetIds: [...finding.targetIds].sort() }));
    const views = byId(draft.views);
    const inputs = [...draft.inputs].sort((a, b) => compare(a.path, b.path));
    const payload = {
        schemaVersion: 1,
        nodes: nodes.map(semantic), edges: edges.map(semantic),
        facets: facets.map(semantic), findings: findings.map(semantic),
        views: views.map(semantic), lensDigest: draft.lensDigest,
        adapterVersions: draft.adapterVersions, inputDigests: inputs,
    };
    const graph: Graph = { ...draft, schemaVersion: 1, hash: hashText(payload), nodes, edges, facets, findings, views, inputs, snapshots: byId(draft.snapshots) };
    freezeTree(graph);
    return graph;
}

function cloneValidated<T>(value: T, copies = new WeakMap<object, T>()): T {
    // This clone has a typed signature; only enumerable JSON data reaches it.
    if (value === null || typeof value !== "object") return value;
    const cached = copies.get(value);
    if (cached !== undefined) return cached;
    const result = Object.assign(Array.isArray(value) ? [] : {}, value);
    copies.set(value, result);
    for (const key of Object.keys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && "value" in descriptor) {
            const child: unknown = descriptor.value;
            Object.defineProperty(result, key, { value: cloneValidated(child, copies), enumerable: true, configurable: true, writable: true });
        }
    }
    return result;
}
