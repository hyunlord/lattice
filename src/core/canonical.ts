import { GraphInputError } from "./errors.js";

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue; };

export function canonicalJson(value: unknown): string {
    return canonicalEncoder()(value);
}

/** Reuse only within an operation whose input objects remain unchanged. */
export function canonicalEncoder(): (value: unknown) => string {
    const encoded = new WeakMap<object, { readonly depth: number; readonly text: string; }>();
    const propertyNames = new Map<string, string>();
    return value => encode(value, { ancestors: new Set(), depth: 0, encoded, propertyNames, output: true });
}

/** Emit canonical JSON without retaining encoded copies of every subtree. */
export function writeCanonical(value: unknown, write: (chunk: string) => void): void {
    let pending = "";
    const emit = (text: string): void => {
        pending += text;
        while (pending.length >= 65536) {
            let end = 65536;
            const last = pending.charCodeAt(end - 1);
            if (last >= 0xd800 && last <= 0xdbff) end--;
            write(pending.slice(0, end)); pending = pending.slice(end);
        }
    };
    encode(value, { ancestors: new Set(), depth: 0, encoded: new WeakMap(), propertyNames: new Map(), output: true, write: emit });
    if (pending) write(pending);
}

export function validateCanonical(value: unknown): void {
    encode(value, { ancestors: new Set(), depth: 0, encoded: new WeakMap(), propertyNames: new Map(), output: false });
}

type Position = {
    readonly output: boolean;
    readonly write?: (chunk: string) => void;
    readonly parent?: Position;
    readonly key?: string;
    readonly ancestors: Set<object>;
    readonly depth: number;
    readonly encoded: WeakMap<object, { readonly depth: number; readonly text: string; }>;
    readonly propertyNames: Map<string, string>;
};

function errorPath(position: Position): string {
    const keys: string[] = [];
    for (let current = position; current.parent !== undefined; current = current.parent) {
        keys.push((current.key ?? "").replaceAll("~", "~0").replaceAll("/", "~1"));
    }
    return "$" + keys.reverse().map(key => `/${key}`).join("");
}

function encode(value: unknown, position: Position): string {
    if (position.depth > 128) {
        throw new GraphInputError(errorPath(position), "JSON nesting exceeds 128 levels");
    }
    if (value === null) { if (position.write) { position.write("null"); return ""; } return "null"; }
    switch (typeof value) {
        case "string":
        case "boolean":
            if (position.write) { position.write(JSON.stringify(value)); return ""; }
            return position.output ? JSON.stringify(value) : "";
        case "number":
            if (!Number.isFinite(value)) throw new GraphInputError(errorPath(position), "non-finite number");
            if (position.write) { position.write(JSON.stringify(value)); return ""; }
            return position.output ? JSON.stringify(value) : "";
        case "object":
            return encodeObject(value, position);
        default:
            throw new GraphInputError(errorPath(position), "value is not JSON");
    }
}

function encodeObject(value: object, position: Position): string {
    if (position.ancestors.has(value)) throw new GraphInputError(errorPath(position), "cyclic value");
    const cached = position.encoded.get(value);
    if (!position.write && cached?.depth === position.depth) return cached.text;
    const ancestors = position.ancestors;
    ancestors.add(value);
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) {
        throw new GraphInputError(errorPath(position), "expected a plain JSON object");
    }
    const names = Object.getOwnPropertyNames(value);
    if (Object.getOwnPropertySymbols(value).length) throw new GraphInputError(errorPath(position), "symbol property");
    if (array && names.length !== value.length + 1) throw new GraphInputError(errorPath(position), "sparse or decorated array");
    const keys = array ? Array.from({ length: value.length }, (_, index) => String(index)) : names.sort();
    const parts: string[] | undefined = position.output && !position.write ? [] : undefined;
    position.write?.(array ? "[" : "{");
    let separator = "";
    for (const key of keys) {
        const childPosition: Position = { parent: position, key, ancestors, depth: position.depth + 1, encoded: position.encoded, propertyNames: position.propertyNames, output: position.output, ...(position.write ? { write: position.write } : {}) };
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new GraphInputError(errorPath(childPosition), "unsafe property name");
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw new GraphInputError(errorPath(childPosition), "expected an enumerable data property");
        }
        if (position.write) { position.write(separator); if (!array) position.write(JSON.stringify(key) + ":"); separator = ","; }
        const child: unknown = descriptor.value;
        const encoded = encode(child, childPosition);
        if (parts) {
            if (array) parts.push(encoded);
            else {
                let propertyName = position.propertyNames.get(key);
                if (propertyName === undefined) {
                    propertyName = JSON.stringify(key);
                    position.propertyNames.set(key, propertyName);
                }
                parts.push(`${propertyName}:${encoded}`);
            }
        }
    }
    const encoded = parts ? array ? `[${parts.join(",")}]` : `{${parts.join(",")}}` : "";
    ancestors.delete(value);
    position.write?.(array ? "]" : "}");
    if (!position.write) position.encoded.set(value, { depth: position.depth, text: encoded });
    return encoded;
}
