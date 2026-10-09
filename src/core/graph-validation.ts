import { GraphInputError } from "./errors.js";
import type { GraphDraft, Source } from "./model.js";

export function validateDigest(value: string, path: string): void {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new GraphInputError(path, "expected lowercase SHA-256 hex");
}

function validatePath(path: string): void {
    if (!path || path.startsWith("/") || /[\\\x00-\x1f]/.test(path) || /^[A-Za-z]:/.test(path) || path.split("/").some(part => ["", ".", ".."].includes(part))) {
        throw new GraphInputError(path, "expected repository-relative POSIX path");
    }
}

function unique(values: readonly string[], path: string): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (!value || seen.has(value)) throw new GraphInputError(path, `empty or duplicate identity: ${value}`);
        seen.add(value);
    }
}

function validateSource(source: Source): void {
    validatePath(source.path);
    validateDigest(source.contentHash, source.path);
    if (!Number.isSafeInteger(source.line) || source.line < 1 || (source.endLine !== undefined && (!Number.isSafeInteger(source.endLine) || source.endLine < source.line))) {
        throw new GraphInputError(source.path, "invalid source line span");
    }
}

export function validateGraph(graph: GraphDraft): void {
    const collections = { nodes: graph.nodes, edges: graph.edges, facets: graph.facets, findings: graph.findings, views: graph.views, snapshots: graph.snapshots };
    for (const [name, records] of Object.entries(collections)) unique(records.map(record => record.id), name);
    unique(graph.inputs.map(input => input.path), "inputs");
    const ids = new Set(graph.nodes.map(node => node.id));
    const requireNode = (id: string): void => {
        if (!ids.has(id)) throw new GraphInputError(id, "unresolved node reference");
    };
    for (const edge of graph.edges) { requireNode(edge.source); requireNode(edge.target); }
    for (const facet of graph.facets) requireNode(facet.nodeId);
    for (const finding of graph.findings) {
        for (const id of finding.targetIds) requireNode(id);
        unique(finding.targetIds, finding.id);
    }
    for (const records of [graph.nodes, graph.edges, graph.facets, graph.findings, graph.views]) {
        for (const record of records) for (const source of record.sources) validateSource(source);
    }
    for (const input of graph.inputs) { validatePath(input.path); validateDigest(input.contentHash, input.path); }
    if (graph.lensDigest !== null) validateDigest(graph.lensDigest, "lensDigest");
    validateDigest(graph.repository.sourceFingerprint, "sourceFingerprint");
}
