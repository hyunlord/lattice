import { GraphInputError } from "./errors.js";

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export type JsonObject = { readonly [key: string]: JsonValue; };

export function canonicalJson(value: unknown): string {
    return canonicalEncoder()(value);
}

/** Reuse only within an operation whose input objects remain unchanged. */
export function canonicalEncoder(): (value: unknown) => string {
    const encoded = new WeakMap<object, Map<number, string>>();
    return value => encode(value, { ancestors: new Set(), depth: 0, encoded, output: true });
}

export function validateCanonical(value: unknown): void {
    encode(value, { ancestors: new Set(), depth: 0, encoded: new WeakMap(), output: false });
}

type Position = {
    readonly output: boolean;
    readonly parent?: Position;
    readonly key?: string;
    readonly ancestors: ReadonlySet<object>;
    readonly depth: number;
    readonly encoded: WeakMap<object, Map<number, string>>;
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
    if (value === null) return "null";
    switch (typeof value) {
        case "string":
        case "boolean":
            return position.output ? JSON.stringify(value) : "";
        case "number":
            if (!Number.isFinite(value)) throw new GraphInputError(errorPath(position), "non-finite number");
            return position.output ? JSON.stringify(value) : "";
        case "object":
            return encodeObject(value, position);
        default:
            throw new GraphInputError(errorPath(position), "value is not JSON");
    }
}

function encodeObject(value: object, position: Position): string {
    if (position.ancestors.has(value)) throw new GraphInputError(errorPath(position), "cyclic value");
    const cached = position.encoded.get(value)?.get(position.depth);
    if (cached !== undefined) return cached;
    const ancestors = new Set(position.ancestors).add(value);
    const array = Array.isArray(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (!array && prototype !== Object.prototype && prototype !== null) {
        throw new GraphInputError(errorPath(position), "expected a plain JSON object");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length) throw new GraphInputError(errorPath(position), "symbol property");
    const names = Object.keys(descriptors);
    if (array && names.length !== value.length + 1) throw new GraphInputError(errorPath(position), "sparse or decorated array");
    const keys = array ? Array.from({ length: value.length }, (_, index) => String(index)) : names.sort();
    const parts: string[] | undefined = position.output ? [] : undefined;
    for (const key of keys) {
        const childPosition: Position = { parent: position, key, ancestors, depth: position.depth + 1, encoded: position.encoded, output: position.output };
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new GraphInputError(errorPath(childPosition), "unsafe property name");
        const descriptor = descriptors[key];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
            throw new GraphInputError(errorPath(childPosition), "expected an enumerable data property");
        }
        const child: unknown = descriptor.value;
        const encoded = encode(child, childPosition);
        if (parts) parts.push(array ? encoded : `${JSON.stringify(key)}:${encoded}`);
    }
    const encoded = parts ? array ? `[${parts.join(",")}]` : `{${parts.join(",")}}` : "";
    const depths = position.encoded.get(value) ?? new Map<number, string>();
    depths.set(position.depth, encoded);
    position.encoded.set(value, depths);
    return encoded;
}
