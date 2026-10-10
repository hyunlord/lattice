import type { JsonObject, JsonValue } from "./canonical.js";

export type Source = {
    readonly path: string;
    readonly line: number;
    readonly endLine?: number;
    readonly pointer: string;
    readonly contentHash: string;
    readonly revision?: string;
    readonly url?: string;
};
export type NodeDraft = {
    readonly id: string;
    readonly kind: string;
    readonly name: string;
    readonly attributes: JsonObject;
    readonly sources: readonly Source[];
};
export type Node = NodeDraft & { readonly contentHash: string; };
export type Edge = {
    readonly id: string;
    readonly kind: string;
    readonly source: string;
    readonly target: string;
    readonly directed: boolean;
    readonly field: string;
    readonly sources: readonly Source[];
    readonly attributes?: JsonObject;
};
export type Facet = {
    readonly id: string;
    readonly nodeId: string;
    readonly key: string;
    readonly value: JsonValue;
    readonly ruleId: string;
    readonly sources: readonly Source[];
};
export type Finding = {
    readonly id: string;
    readonly ruleId: string;
    readonly severity: "info" | "warning" | "error";
    readonly targetIds: readonly string[];
    readonly metrics: JsonObject;
    readonly message: string;
    readonly basis: "computed" | "authored-interpretation" | "source-support";
    readonly sources: readonly Source[];
    readonly intent?: string;
    readonly implementation?: string;
    readonly gate?: {
        readonly metric: string;
        readonly comparator: "eq" | "ne" | "gt" | "gte" | "lt" | "lte";
        readonly threshold: number;
        readonly status: "pass" | "fail" | "unknown";
    };
};
export type View = {
    readonly id: string;
    readonly type: "matrix" | "cycle" | "distribution" | "table" | "gallery" | "status" | "graph";
    readonly label: string;
    readonly description?: string;
    readonly query: JsonObject;
    readonly sources: readonly Source[];
};
export type InputDigest = { readonly path: string; readonly contentHash: string; };
export type Snapshot = {
    readonly id: string;
    readonly commit?: string;
    readonly graphHash: string;
    readonly lensHash: string | null;
    readonly inputFingerprint: string;
    readonly coverage: string;
    readonly artifactPath: string;
};
export type Repository = {
    readonly name: string;
    readonly remoteUrl?: string;
    readonly commit?: string;
    readonly dirty: boolean;
    readonly sourceFingerprint: string;
};
export type GraphDraft = {
    readonly repository: Repository;
    readonly nodes: readonly NodeDraft[];
    readonly edges: readonly Edge[];
    readonly facets: readonly Facet[];
    readonly findings: readonly Finding[];
    readonly views: readonly View[];
    readonly snapshots: readonly Snapshot[];
    readonly lensDigest: string | null;
    readonly adapterVersions: Readonly<Record<string, string>>;
    readonly inputs: readonly InputDigest[];
};
export type Graph = Omit<GraphDraft, "nodes"> & {
    readonly schemaVersion: 1;
    readonly hash: string;
    readonly nodes: readonly Node[];
};
export type Digest = (canonicalText: string) => string;
