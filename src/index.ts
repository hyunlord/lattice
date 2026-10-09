export const schemaVersion = 1;
export { canonicalJson } from "./core/canonical.js";
export type { JsonValue, JsonObject } from "./core/canonical.js";
export { GraphInputError } from "./core/errors.js";
export { createGraph } from "./core/graph.js";
export type { Source, NodeDraft, Node, Edge, Facet, Finding, View, InputDigest, Snapshot, Repository, GraphDraft, Graph, Digest } from "./core/model.js";
