import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import { DataInputError, makeSource, pointerToken, validateSourceInput } from "./types.js";
import type { ExtractedRecord, SourceInput } from "./types.js";

type Span = { readonly line: number; readonly endLine: number; };

class JsonReader {
    private offset = 0;
    private readonly lineStarts: number[] = [0];
    readonly spans = new Map<string, Span>();

    constructor(private readonly input: SourceInput, private readonly recordsPointer: string) {
        for (let index = 0; index < input.text.length; index++) {
            const character = input.text[index];
            if (character === "\r") {
                if (input.text[index + 1] === "\n") index++;
                this.lineStarts.push(index + 1);
            } else if (character === "\n") {
                this.lineStarts.push(index + 1);
            }
        }
        if (input.text.startsWith("\ufeff")) this.offset++;
    }

    read(): JsonValue {
        const value = this.value("", 0);
        this.whitespace();
        if (this.offset !== this.input.text.length) this.fail("unexpected trailing input");
        return value;
    }

    private line(offset: number): number {
        let low = 0;
        let high = this.lineStarts.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            const start = this.lineStarts[middle];
            if (start !== undefined && start <= offset) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    private fail(reason: string): never {
        throw new DataInputError(this.input.path, this.line(this.offset), reason);
    }

    private whitespace(): void {
        while (/^[\t\n\r ]$/.test(this.input.text[this.offset] ?? "")) this.offset++;
    }

    private value(pointer: string, depth: number): JsonValue {
        this.whitespace();
        if (depth > 128) this.fail("JSON nesting exceeds 128 levels");
        const start = this.offset;
        const character = this.input.text[this.offset];
        let value: JsonValue;
        if (character === "{") value = this.object(pointer, depth);
        else if (character === "[") value = this.array(pointer, depth);
        else if (character === '"') value = this.string();
        else if (character === "t" && this.consume("true")) value = true;
        else if (character === "f" && this.consume("false")) value = false;
        else if (character === "n" && this.consume("null")) value = null;
        else {
            const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(this.input.text.slice(this.offset));
            const token = match?.[0];
            if (token === undefined) this.fail("expected a JSON value");
            value = Number(token);
            if (!Number.isFinite(value)) this.fail("non-finite number");
            this.offset += token.length;
        }
        this.spans.set(pointer, { line: this.line(start), endLine: this.line(this.offset - 1) });
        return value;
    }

    private consume(token: string): boolean {
        if (!this.input.text.startsWith(token, this.offset)) return false;
        this.offset += token.length;
        return true;
    }

    private string(): string {
        const start = this.offset++;
        while (this.offset < this.input.text.length) {
            const character = this.input.text[this.offset++];
            if (character === "\\") {
                this.offset++;
            } else if (character === '"') {
                let value: unknown;
                try {
                    value = JSON.parse(this.input.text.slice(start, this.offset));
                } catch {
                    this.fail("invalid JSON string");
                }
                if (typeof value !== "string") this.fail("expected a JSON string");
                return value;
            }
        }
        this.fail("unterminated JSON string");
    }

    private object(pointer: string, depth: number): JsonObject {
        const result: Record<string, JsonValue> = {};
        this.offset++;
        this.whitespace();
        if (this.consume("}")) return result;
        while (true) {
            this.whitespace();
            if (this.input.text[this.offset] !== '"') this.fail("expected an object key");
            const key = this.string();
            if (["__proto__", "constructor", "prototype"].includes(key)) this.fail("unsafe object key");
            if (Object.hasOwn(result, key)) this.fail("duplicate object key");
            this.whitespace();
            if (!this.consume(":")) this.fail("expected ':' after object key");
            result[key] = this.value(`${pointer}/${pointerToken(key)}`, depth + 1);
            this.whitespace();
            if (this.consume("}")) return result;
            if (!this.consume(",")) this.fail("expected ',' or '}'");
        }
    }

    private array(pointer: string, depth: number): readonly JsonValue[] {
        const result: JsonValue[] = [];
        this.offset++;
        this.whitespace();
        if (this.consume("]")) return result;
        while (true) {
            if (pointer === this.recordsPointer && result.length >= 100000) {
                this.fail("collection exceeds the 100000 record limit");
            }
            result.push(this.value(`${pointer}/${result.length}`, depth + 1));
            this.whitespace();
            if (this.consume("]")) return result;
            if (!this.consume(",")) this.fail("expected ',' or ']'");
        }
    }
}

function isObject(value: JsonValue): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function select(root: JsonValue, pointer: string, input: SourceInput): JsonValue {
    if (pointer === "") return root;
    if (!pointer.startsWith("/") || /~(?:[^01]|$)/u.test(pointer)) {
        throw new DataInputError(input.path, 1, "expected a canonical JSON pointer");
    }
    let selected = root;
    for (const token of pointer.slice(1).split("/")) {
        const key = token.replaceAll("~1", "/").replaceAll("~0", "~");
        let child: JsonValue | undefined;
        if (Array.isArray(selected)) {
            if (/^(?:0|[1-9]\d*)$/u.test(key)) child = selected[Number(key)];
        } else if (isObject(selected) && Object.hasOwn(selected, key)) {
            child = selected[key];
        }
        if (child === undefined) throw new DataInputError(input.path, 1, "record pointer does not exist");
        selected = child;
    }
    return selected;
}

export function extractJson(input: SourceInput, recordsPointer = ""): readonly ExtractedRecord[] {
    validateSourceInput(input);
    const reader = new JsonReader(input, recordsPointer);
    const root = select(reader.read(), recordsPointer, input);
    if (Array.isArray(root) && root.length > 100000) {
        throw new DataInputError(input.path, 1, "collection exceeds the 100000 record limit");
    }
    const candidates: readonly { readonly value: JsonValue; readonly pointer: string; }[] = Array.isArray(root)
        ? root.map((value: JsonValue, index: number) => ({ value, pointer: `${recordsPointer}/${index}` }))
        : [{ value: root, pointer: recordsPointer }];
    return candidates.map(({ value, pointer }) => {
        const span = reader.spans.get(pointer);
        if (span === undefined) throw new DataInputError(input.path, 1, "missing record source span");
        if (!isObject(value)) throw new DataInputError(input.path, span.line, "expected an object record");
        const explicitId = value["id"];
        const id = typeof explicitId === "string" && explicitId.length > 0
            ? explicitId
            : `record:${encodeURIComponent(input.path)}#${encodeURIComponent(pointer)}`;
        const name = typeof value["name"] === "string" ? value["name"] : id;
        const fields: Record<string, Source> = {};
        const visit = (fieldValue: JsonValue, relativePointer: string): void => {
            const absolutePointer = pointer + relativePointer;
            const fieldSpan = reader.spans.get(absolutePointer);
            if (fieldSpan === undefined) throw new DataInputError(input.path, span.line, "missing field source span");
            fields[relativePointer] = makeSource(input, absolutePointer, fieldSpan.line, fieldSpan.endLine);
            if (Array.isArray(fieldValue)) {
                fieldValue.forEach((child: JsonValue, index: number) => visit(child, `${relativePointer}/${index}`));
            } else if (isObject(fieldValue)) {
                for (const [key, child] of Object.entries(fieldValue)) visit(child, `${relativePointer}/${pointerToken(key)}`);
            }
        };
        visit(value, "");
        return {
            node: {
                id,
                kind: "record",
                name,
                attributes: value,
                sources: [makeSource(input, pointer, span.line, span.endLine)],
            },
            fields,
        };
    });
}
