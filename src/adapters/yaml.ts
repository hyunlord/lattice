import { isAlias, isMap, isNode, isScalar, isSeq, LineCounter, parseAllDocuments } from "yaml";
import type { Document } from "yaml";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import { DataInputError, makeSource, pointerToken, validateSourceInput } from "./types.js";
import type { ExtractedRecord, SourceInput } from "./types.js";

type Span = { readonly line: number; readonly endLine: number; };
type ReadValue = { readonly value: JsonValue; readonly pointer: string; };

function isObject(value: JsonValue): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

class YamlReader {
    readonly spans = new Map<string, Span>();
    private readonly active = new Set<unknown>();
    private expanded = 0;
    private aliases = 0;

    constructor(private readonly input: SourceInput, private readonly lines: LineCounter, private readonly document: Document) { }

    private span(node: unknown): Span {
        const range = isNode(node) ? node.range : undefined;
        const start = range?.[0] ?? this.document.range?.[0] ?? 0;
        let end = range?.[1] ?? start + 1;
        while (end > start && /[\r\n]/u.test(this.input.text[end - 1] ?? "")) end--;
        return { line: this.lines.linePos(start).line, endLine: this.lines.linePos(Math.max(start, end - 1)).line };
    }

    private fail(node: unknown, reason: string): never {
        throw new DataInputError(this.input.path, this.span(node).line, reason);
    }

    read(node: unknown, pointer: string, depth = 0, aliasSpan?: Span): JsonValue {
        if (depth > 128) this.fail(node, "YAML nesting exceeds 128 levels");
        if (++this.expanded > 1000000) this.fail(node, "YAML expansion exceeds 1000000 values");
        const span = aliasSpan ?? this.span(node);
        this.spans.set(pointer, span);
        if (isAlias(node)) {
            if (++this.aliases > 100) this.fail(node, "YAML expansion exceeds 100 aliases");
            const target = node.resolve(this.document);
            if (target === undefined) this.fail(node, "unresolved YAML alias");
            return this.read(target, pointer, depth + 1, span);
        }
        if (this.active.has(node)) this.fail(node, "cyclic YAML alias");
        this.active.add(node);
        try {
            if (node === null) return null;
            if (isScalar(node)) {
                const value: unknown = node.value;
                if (value === null || typeof value === "string" || typeof value === "boolean") return value;
                if (typeof value === "number" && Number.isFinite(value)) return value;
                this.fail(node, "expected a JSON-compatible YAML scalar");
            }
            if (isSeq(node)) {
                if (node.items.length > 100000) this.fail(node, "collection exceeds the 100000 record limit");
                return node.items.map((child, index) => this.read(child, `${pointer}/${index}`, depth + 1, aliasSpan));
            }
            if (isMap(node)) {
                const result: Record<string, JsonValue> = {};
                for (const pair of node.items) {
                    if (!isScalar(pair.key) || typeof pair.key.value !== "string") this.fail(pair.key, "expected a string YAML mapping key");
                    const key = pair.key.value;
                    if (["__proto__", "constructor", "prototype"].includes(key)) this.fail(pair.key, "unsafe object key");
                    if (Object.hasOwn(result, key)) this.fail(pair.key, "duplicate object key");
                    result[key] = this.read(pair.value, `${pointer}/${pointerToken(key)}`, depth + 1, aliasSpan);
                }
                return result;
            }
            this.fail(node, "expected a JSON-compatible YAML value");
        } finally {
            this.active.delete(node);
        }
    }

    record({ value, pointer }: ReadValue): ExtractedRecord {
        const span = this.spans.get(pointer);
        if (span === undefined) throw new DataInputError(this.input.path, 1, "missing YAML record source span");
        if (!isObject(value)) throw new DataInputError(this.input.path, span.line, "expected an object record");
        const explicitId = value["id"];
        const id = typeof explicitId === "string" && explicitId.length > 0 ? explicitId : `record:${encodeURIComponent(this.input.path)}#${encodeURIComponent(pointer)}`;
        const fields: Record<string, Source> = {};
        const visit = (child: JsonValue, relative: string): void => {
            const source = this.spans.get(pointer + relative);
            if (source === undefined) throw new DataInputError(this.input.path, span.line, "missing YAML field source span");
            fields[relative] = makeSource(this.input, pointer + relative, source.line, source.endLine);
            if (Array.isArray(child)) child.forEach((item: JsonValue, index: number) => visit(item, `${relative}/${index}`));
            else if (isObject(child)) for (const [key, item] of Object.entries(child)) visit(item, `${relative}/${pointerToken(key)}`);
        };
        visit(value, "");
        return { node: { id, kind: "record", name: typeof value["name"] === "string" ? value["name"] : id, attributes: value, sources: [fields[""] ?? makeSource(this.input, pointer, span.line, span.endLine)] }, fields };
    }
}

function select(root: JsonValue, pointer: string, input: SourceInput): JsonValue {
    if (pointer === "") return root;
    if (!pointer.startsWith("/") || /~(?:[^01]|$)/u.test(pointer)) throw new DataInputError(input.path, 1, "expected a canonical JSON pointer");
    let selected = root;
    for (const token of pointer.slice(1).split("/")) {
        const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
        const child: JsonValue | undefined = Array.isArray(selected)
            ? /^(?:0|[1-9]\d*)$/u.test(key) ? selected[Number(key)] : undefined
            : isObject(selected) && Object.hasOwn(selected, key) ? selected[key] : undefined;
        if (child === undefined) throw new DataInputError(input.path, 1, "record pointer does not exist");
        selected = child;
    }
    return selected;
}

function extract(input: SourceInput, recordsPointer: string, single: boolean): readonly ExtractedRecord[] {
    validateSourceInput(input);
    const lines = new LineCounter();
    const documents = parseAllDocuments(input.text, { lineCounter: lines, version: "1.2", schema: "core", strict: true, uniqueKeys: true, stringKeys: true, resolveKnownTags: false });
    if (documents.length === 0) throw new DataInputError(input.path, 1, "expected a YAML document");
    if (single && documents.length !== 1) throw new DataInputError(input.path, 1, "expected a single YAML document");
    const records: ExtractedRecord[] = [];
    for (const [index, document] of documents.entries()) {
        const problem = document.errors[0] ?? document.warnings[0];
        if (problem !== undefined) throw new DataInputError(input.path, lines.linePos(problem.pos[0]).line, problem.message);
        if (document.directives?.yaml.version !== "1.2") throw new DataInputError(input.path, 1, "expected YAML 1.2");
        const reader = new YamlReader(input, lines, document);
        const base = documents.length > 1 ? `/documents/${index}` : "";
        const root = select(reader.read(document.contents, base), recordsPointer, input);
        const pointer = base + recordsPointer;
        const candidates = !single && Array.isArray(root) ? root.map((value: JsonValue, item: number) => ({ value, pointer: `${pointer}/${item}` })) : [{ value: root, pointer }];
        if (records.length + candidates.length > 100000) throw new DataInputError(input.path, 1, "collection exceeds the 100000 record limit");
        for (const candidate of candidates) records.push(reader.record(candidate));
    }
    return records;
}

export function extractYaml(input: SourceInput, recordsPointer = ""): readonly ExtractedRecord[] {
    return extract(input, recordsPointer, false);
}

export function extractYamlDocument(input: SourceInput): ExtractedRecord {
    const record = extract(input, "", true)[0];
    if (record === undefined) throw new DataInputError(input.path, 1, "expected a YAML mapping document");
    return record;
}
