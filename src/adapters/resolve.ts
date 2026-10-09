import { canonicalJson, type JsonValue } from "../core/canonical.js";
import type { Edge, NodeDraft, Source } from "../core/model.js";
import { DataInputError, pointerToken, type ExtractedRecord } from "./types.js";

export type ReferenceDiagnostic = {
    readonly code: "duplicate-id" | "ambiguous-reference" | "unresolved-reference";
    readonly value: string;
    readonly source: Source;
};
export type ResolvedRecords = {
    readonly nodes: readonly NodeDraft[];
    readonly edges: readonly Edge[];
    readonly diagnostics: readonly ReferenceDiagnostic[];
};
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
function location(record: ExtractedRecord): Source {
    const source = record.node.sources[0];
    if (source === undefined) throw new DataInputError("<record>", 1, "Record has no source");
    return source;
}
function identity(record: ExtractedRecord): string {
    const source = location(record);
    return canonicalJson([source.path, source.pointer]);
}
function strings(value: JsonValue, visit: (value: string, pointer: string, key: string) => void, pointer = "", key = ""): void {
    if (typeof value === "string") visit(value, pointer, key);
    else if (Array.isArray(value)) value.forEach((child: JsonValue, index: number) => strings(child, visit, `${pointer}/${index}`, key));
    else if (value !== null && typeof value === "object") {
        for (const [name, child] of Object.entries(value)) strings(child, visit, `${pointer}/${pointerToken(name)}`, name);
    }
}
export function resolveRecords(records: readonly ExtractedRecord[]): ResolvedRecords {
    if (records.length > 100_000) throw new DataInputError("<records>", 1, "Input exceeds the 100,000 record limit");
    const ordered = [...records].sort((a, b) => compare(identity(a), identity(b)));
    const aliases = new Map<string, ExtractedRecord[]>();
    const locations = new Set<string>();
    for (const record of ordered) {
        const key = identity(record);
        if (locations.has(key)) {
            const source = location(record);
            throw new DataInputError(source.path, source.line, "Duplicate record source");
        }
        locations.add(key);
        const entries = aliases.get(record.node.id) ?? [];
        entries.push(record);
        aliases.set(record.node.id, entries);
    }
    const used = new Set([...aliases].filter(([, entries]) => entries.length === 1).map(([id]) => id));
    const ids = new Map<ExtractedRecord, string>();
    const diagnostics: ReferenceDiagnostic[] = [];
    for (const record of ordered) {
        let id = record.node.id;
        if ((aliases.get(id)?.length ?? 0) > 1) {
            const source = location(record);
            const base = `record:${encodeURIComponent(source.path)}#${encodeURIComponent(source.pointer)}`;
            id = base;
            let suffix = 1;
            while (used.has(id)) id = `${base}:${suffix++}`;
            diagnostics.push({ code: "duplicate-id", value: record.node.id, source });
        }
        used.add(id);
        ids.set(record, id);
    }
    const nodes: NodeDraft[] = [];
    const edges: Edge[] = [];
    for (const record of ordered) {
        const id = ids.get(record);
        if (id === undefined) throw new Error("Missing assigned record ID");
        nodes.push({ ...record.node, id });
        strings(record.node.attributes, (value, pointer, key) => {
            if (pointer === "/id" || value === "") return;
            const candidates = aliases.get(value) ?? [];
            const source = record.fields[pointer];
            if (source === undefined) throw new DataInputError(location(record).path, location(record).line, `Missing field source ${pointer}`);
            const candidate = candidates[0];
            if (candidates.length === 1 && candidate !== undefined) {
                const target = ids.get(candidate);
                if (target === undefined) throw new Error("Missing target record ID");
                edges.push({ id: `reference:${canonicalJson([id, target, pointer])}`, kind: pointer, source: id, target, directed: true, field: pointer, sources: [source] });
            } else if (candidates.length > 1) diagnostics.push({ code: "ambiguous-reference", value, source });
            else if (/Ids?$/u.test(key)) diagnostics.push({ code: "unresolved-reference", value, source });
        });
    }
    return {
        nodes: nodes.sort((a, b) => compare(a.id, b.id)),
        edges: edges.sort((a, b) => compare(a.id, b.id)),
        diagnostics: diagnostics.sort((a, b) => compare(canonicalJson(a), canonicalJson(b))),
    };
}
