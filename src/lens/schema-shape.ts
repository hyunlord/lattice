import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { ExtractedRecord } from "../adapters/types.js";
import { DataInputError, pointerToken } from "../adapters/types.js";
import { isObject } from "./runtime.js";

export type Check = (value: JsonValue | undefined, pointer: string) => void;
export class LensSchema {
    constructor(private readonly definition: ExtractedRecord) { }
    fail(pointer: string, reason: string): never {
        let ancestor = pointer;
        while (!this.definition.fields[ancestor] && ancestor.includes("/")) ancestor = ancestor.slice(0, ancestor.lastIndexOf("/"));
        const source = this.definition.fields[ancestor] ?? this.definition.node.sources[0];
        throw new DataInputError(source?.path ?? "<lens>", source?.line ?? 1, `${pointer || "/"}: ${reason}`);
    }
    readonly text: Check = (value, pointer) => { if (typeof value !== "string") this.fail(pointer, "Expected string"); };
    readonly id: Check = (value, pointer) => { if (typeof value !== "string" || !value.length) this.fail(pointer, "Expected nonempty string"); };
    readonly boolean: Check = (value, pointer) => { if (typeof value !== "boolean") this.fail(pointer, "Expected boolean"); };
    readonly number: Check = (value, pointer) => { if (typeof value !== "number" || !Number.isFinite(value)) this.fail(pointer, "Expected finite number"); };
    readonly payload: Check = (value, pointer) => { if (value === undefined) this.fail(pointer, "Expected value"); };
    readonly mapping: Check = (value, pointer) => { this.record(value, pointer); };
    readonly path: Check = (value, pointer) => this.list((part, at) => {
        if (typeof part !== "string" && !(typeof part === "number" && Number.isSafeInteger(part) && part >= 0)) this.fail(at, "Expected string or nonnegative integer path segment");
    })(value, pointer);
    record(value: JsonValue | undefined, pointer: string): JsonObject {
        if (!isObject(value)) return this.fail(pointer, "Expected object");
        return value;
    }
    choice(values: readonly JsonValue[]): Check { return (value, pointer) => { if (!values.includes(value ?? null)) this.fail(pointer, `Expected ${values.join(", ")}`); }; }
    list(check: Check): Check {
        return (value, pointer) => {
            if (!Array.isArray(value)) return this.fail(pointer, "Expected array");
            value.forEach((child, index) => check(child, `${pointer}/${index}`));
        };
    }
    entries(check: Check): Check {
        return (value, pointer) => { for (const [key, child] of Object.entries(this.record(value, pointer))) check(child, `${pointer}/${pointerToken(key)}`); };
    }
    shape(fields: Readonly<Record<string, Check>>, required: readonly string[] = []): Check {
        return (value, pointer) => {
            const record = this.record(value, pointer);
            for (const key of Object.keys(record)) if (!Object.hasOwn(fields, key)) this.fail(`${pointer}/${pointerToken(key)}`, "Unknown property");
            for (const key of required) if (!Object.hasOwn(record, key)) this.fail(`${pointer}/${pointerToken(key)}`, "Required property");
            for (const [key, child] of Object.entries(record)) fields[key]?.(child, `${pointer}/${pointerToken(key)}`);
        };
    }
    keyed(check: Check): Check {
        return (value, pointer) => {
            const ids = new Set<string>();
            this.list((child, at) => {
                check(child, at);
                const id = this.record(child, at)["id"];
                this.id(id, `${at}/id`);
                if (typeof id !== "string") return;
                if (ids.has(id)) this.fail(`${at}/id`, `Duplicate ID ${id}`);
                ids.add(id);
            })(value, pointer);
        };
    }
}
