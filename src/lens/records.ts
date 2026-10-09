import { canonicalJson } from "../core/canonical.js";
import type { JsonObject } from "../core/canonical.js";
import { GraphInputError } from "../core/errors.js";
import type { Source, NodeDraft, Edge } from "../core/model.js";
import type { ExtractedRecord } from "../adapters/types.js";
import { resolveRecords } from "../adapters/resolve.js";
import type { ReferenceDiagnostic } from "../adapters/resolve.js";
import { array, object, string } from "./runtime.js";
function sourceAt(definition: ExtractedRecord, pointer: string): Source {
    const source = definition.fields[pointer];
    if (!source) throw new GraphInputError(pointer, "Missing lens source span");
    return source;
}
export function prepareRecords(base: readonly ExtractedRecord[], config: JsonObject, definition: ExtractedRecord) {
    const ids = new Set(base.map(record => record.node.id));
    const synthetics = array(config["synthetics"] ?? []).map((value, index): ExtractedRecord => {
        const rule = object(value), id = string(rule["id"]), pointer = `/synthetics/${index}`;
        if (!id || ids.has(id)) throw new GraphInputError(pointer, `Synthetic ID collides: ${id}`);
        ids.add(id);
        const attributes = object(rule["attributes"] ?? {});
        const fields = Object.fromEntries(Object.entries(definition.fields).filter(([key]) => key.startsWith(`${pointer}/attributes/`)).map(([key, source]) => [key.slice(`${pointer}/attributes`.length), source]));
        return { node: { id, kind: string(rule["kind"]), name: string(rule["name"]), attributes, sources: [sourceAt(definition, pointer)] }, fields };
    });
    const original = [...base, ...synthetics];
    const resolved = resolveLayered(original);
    const identity = (sources: readonly Source[]): string => canonicalJson(sources.map(source => [source.path, source.pointer]));
    const fields = new Map(original.map(record => [identity(record.node.sources), record.fields]));
    const records = resolved.nodes.map(node => {
        const mapped = fields.get(identity(node.sources));
        if (!mapped) throw new GraphInputError(node.id, "Missing resolved record fields");
        return { node, fields: mapped };
    });
    return { ...resolved, records };
}
function resolveLayered(records: readonly ExtractedRecord[]) {
    const groups = new Map<string, { readonly namespace: string | undefined; readonly records: ExtractedRecord[]; }>();
    for (const record of records) {
        const layer = typeof record.node.attributes["layer"] === "string" ? record.node.attributes["layer"] : undefined;
        const namespace = typeof record.node.attributes["identityNamespace"] === "string" ? record.node.attributes["identityNamespace"] : layer;
        const key = canonicalJson([layer ?? null, namespace ?? null]);
        const group = groups.get(key) ?? { namespace, records: [] };
        group.records.push(record); groups.set(key, group);
    }
    const nodes: NodeDraft[] = [], edges: Edge[] = [], diagnostics: ReferenceDiagnostic[] = [];
    for (const { namespace, records: group } of groups.values()) {
        const originals = new Map(group.map(record => [canonicalJson(record.node.sources), record]));
        const inputs = group.map(record => {
            const originalId = record.node.attributes["originalId"] ?? record.node.attributes["id"];
            const id = namespace !== undefined && typeof originalId === "string" ? originalId : namespace !== undefined && record.node.id.startsWith(`${namespace}:`) ? record.node.id.slice(namespace.length + 1) : record.node.id;
            const { layer: _layer, originalId: _originalId, identityNamespace: _namespace, ...attributes } = record.node.attributes;
            return { ...record, node: { ...record.node, id, attributes: record.references === false ? {} : namespace === undefined ? record.node.attributes : attributes } };
        });
        const resolved = resolveRecords(inputs);
        const qualify = (id: string): string => namespace === undefined ? id : `${namespace}:${id}`;
        for (const node of resolved.nodes) {
            const original = originals.get(canonicalJson(node.sources));
            if (!original) throw new GraphInputError(node.id, "Missing original record");
            nodes.push({ ...node, id: qualify(node.id), attributes: original.node.attributes });
        }
        for (const edge of resolved.edges) {
            const source = qualify(edge.source), target = qualify(edge.target);
            edges.push({ ...edge, id: `reference:${canonicalJson([source, target, edge.field])}`, source, target });
        }
        diagnostics.push(...resolved.diagnostics);
    }
    if (new Set(nodes.map(node => node.id)).size !== nodes.length) throw new GraphInputError("records", "Layer namespaces produce colliding graph IDs");
    return { nodes: nodes.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), edges: edges.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), diagnostics };
}
