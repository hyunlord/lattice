import { canonicalJson } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { NodeDraft, Source } from "../core/model.js";
import { DataInputError } from "../adapters/types.js";
import type { CodeSupportEvaluation } from "./code-links.js";
import type { ExtractedRecord } from "../adapters/types.js";
export type RuntimeValue = undefined | null | boolean | number | string | readonly RuntimeValue[] | RuntimeObject;
export type RuntimeObject = { readonly [key: string]: RuntimeValue; };
function isRuntimeArray(value: RuntimeValue): value is readonly RuntimeValue[] { return Array.isArray(value); }
export function materializeValue(value: RuntimeValue): JsonValue {
    if (value === undefined) return null;
    if (isRuntimeArray(value)) return value.map(materializeValue);
    if (isRuntimeObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, materializeValue(child)]));
    return value;
}
function isRuntimeObject(value: RuntimeValue): value is RuntimeObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
export function comparable(value: RuntimeValue): value is JsonValue {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.every(comparable);
    return !isRuntimeObject(value) || Object.values(value).every(comparable);
}
function equal(left: RuntimeValue, right: RuntimeValue): boolean {
    return comparable(left) && comparable(right) && canonicalJson(left) === canonicalJson(right);
}
function finiteKey(value: JsonValue): boolean {
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(finiteKey);
    return !isObject(value) || Object.values(value).every(finiteKey);
}
function valueKey(value: RuntimeValue): string {
    if (value === undefined) return "missing";
    if (Array.isArray(value)) return `array:${JSON.stringify(value.map(valueKey))}`;
    if (isRuntimeObject(value)) return `object:${JSON.stringify(Object.keys(value).sort().map(key => [key, valueKey(value[key])]))}`;
    return `scalar:${JSON.stringify(value)}`;
}
export function isObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
export function object(value: JsonValue | undefined): JsonObject {
    if (!isObject(value)) throw new Error("Lens expected an object");
    return value;
}
export function array(value: JsonValue | undefined): readonly JsonValue[] {
    if (!Array.isArray(value)) throw new Error("Lens expected an array");
    return value;
}
export function string(value: RuntimeValue): string {
    if (typeof value !== "string") throw new Error("Lens expected a string");
    return value;
}
export type Environment = { readonly codeSupport?: ReadonlyMap<string, CodeSupportEvaluation>; readonly expressionSource?: Source; readonly sourceLink?: (source: Source) => Source; readonly node?: JsonObject; readonly item?: RuntimeValue; readonly vars: RuntimeObject; readonly records: readonly ExtractedRecord[]; readonly sources: Map<string, Source>; readonly graph?: JsonObject; };
export function recordView(node: NodeDraft): JsonObject { return { ...node.attributes, id: node.id, kind: node.kind, name: node.name }; }
export function addSources(env: Environment, sources: readonly Source[]): void {
    for (const source of sources) env.sources.set(`${source.path}#${source.pointer}`, source);
}
export function pathSegment(value: JsonValue | undefined): string {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
    return string(value);
}
export function getPath(value: RuntimeValue, path: readonly JsonValue[]): RuntimeValue {
    if (!path.length) return value;
    const [head, ...tail] = path;
    if (head === "*" && Array.isArray(value)) return value.map(child => getPath(child, tail));
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    const key = pathSegment(head);
    if (!Object.hasOwn(value, key)) return undefined;
    return getPath(Array.isArray(value) ? value[Number(key)] : isRuntimeObject(value) ? value[key] : undefined, tail);
}
export function evaluate(expression: JsonValue | undefined, env: Environment): RuntimeValue {
    if (expression === undefined || expression === null || typeof expression !== "object") return expression;
    const expr = object(expression);
    const op = string(expr["op"]);
    const run = (value: JsonValue | undefined): RuntimeValue => evaluate(value, env);
    const list = (): readonly JsonValue[] => array(expr["values"]);
    switch (op) {
        case "literal": return expr["value"];
        case "codeSupport": {
            const rule = expr["rule"];
            const result = typeof rule === "string" ? env.codeSupport?.get(rule) : undefined;
            if (!env.node || !result) {
                const source = env.expressionSource;
                throw new DataInputError(source?.path ?? "<lens>", source?.line ?? 1, `${source?.pointer ?? ""}: ${!env.node ? "codeSupport requires a current node" : `Unknown or unavailable codeSupport rule ${String(rule)}`}`);
            }
            addSources(env, result.sources);
            return result.value;
        }
        case "get": {
            const from = string(expr["from"]);
            const path = array(expr["path"]);
            const sourceValue = from === "node" ? env.node : from === "item" ? env.item : from === "vars" && typeof path[0] === "string" ? env.vars[path[0]] : undefined;
            if (isRuntimeObject(sourceValue) && typeof sourceValue["id"] === "string") {
                const record = env.records.find(record => record.node.id === sourceValue["id"]);
                const sourcePath = from === "vars" ? path.slice(1) : path;
                const pointer = sourcePath.length ? "/" + sourcePath.map(part => pathSegment(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : "";
                const source = record?.fields[pointer];
                if (source) addSources(env, [source]);
            }
            const root = from === "node" ? env.node : from === "item" ? env.item : from === "vars" ? env.vars : from === "graph" ? env.graph ?? { nodes: env.records.map(record => recordView(record.node)) } : undefined;
            if (!["node", "item", "vars", "graph"].includes(from)) throw new Error(`Unknown expression scope ${from}`);
            return getPath(root, path);
        }
        case "lookup": {
            const expected = run(expr["equals"]);
            const matches = env.records.filter(record => record.node.kind === string(expr["kind"]) && equal(getPath(recordView(record.node), array(expr["field"])), expected));
            if (matches.length > 1) throw new Error("Ambiguous lens lookup");
            const match = matches[0];
            if (match) addSources(env, match.node.sources);
            return match ? recordView(match.node) : undefined;
        }
        case "at": { const key = run(expr["key"]); return typeof key === "string" || typeof key === "number" ? getPath(run(expr["object"]), [String(key)]) : undefined; }
        case "coalesce": { for (const value of list()) { const result = run(value); if (result !== null && result !== undefined) return result; } return undefined; }
        case "and": return list().every(value => run(value) === true);
        case "or": return list().some(value => run(value) === true);
        case "not": return run(expr["value"]) !== true;
        case "exists": return run(expr["value"]) !== undefined && run(expr["value"]) !== null;
        case "eq": case "ne": { const left = run(expr["left"]), right = run(expr["right"]); if (!comparable(left) || !comparable(right)) return false; const same = equal(left, right); return op === "eq" ? same : !same; }
        case "gt": case "gte": case "lt": case "lte": {
            const left = run(expr["left"]); const right = run(expr["right"]);
            if (typeof left !== "number" || typeof right !== "number") return false;
            return op === "gt" ? left > right : op === "gte" ? left >= right : op === "lt" ? left < right : left <= right;
        }
        case "in": { const values = run(expr["collection"]); const value = run(expr["value"]); return Array.isArray(values) && values.some(child => equal(child, value)); }
        case "count": { const value = run(expr["value"]); return typeof value === "string" ? Array.from(value).length : Array.isArray(value) ? value.length : undefined; }
        case "flatten": { const value = run(expr["value"]); return Array.isArray(value) ? value.flat(1) : undefined; }
        case "sum": {
            const value = run(expr["value"]);
            if (!Array.isArray(value)) return undefined;
            let total = 0;
            for (const item of value) { if (typeof item !== "number" || !Number.isFinite(item)) return undefined; total += item; }
            return Number.isFinite(total) ? total : undefined;
        }
        case "concat": {
            const values = list().map(run);
            if (values.every(value => typeof value === "string")) return values.join("");
            const result: RuntimeValue[] = [];
            for (const value of values) { if (!Array.isArray(value)) return undefined; result.push(...value); }
            return result;
        }
        case "indexOf": {
            const input = run(expr["input"]), value = run(expr["value"]);
            if (typeof input === "string" && typeof value === "string") return input.indexOf(value);
            return Array.isArray(input) && value !== undefined ? input.findIndex(item => equal(item, value)) : undefined;
        }
        case "let": {
            const vars: Record<string, RuntimeValue> = { ...env.vars };
            for (const [key, expression] of Object.entries(object(expr["bindings"]))) vars[key] = evaluate(expression, { ...env, vars });
            return evaluate(expr["value"], { ...env, vars });
        }
        case "unique": { const value = run(expr["value"]); return Array.isArray(value) ? [...new Map(value.map(child => [valueKey(child), child])).values()] : undefined; }
        case "groupBy": {
            const input = run(expr["input"]);
            if (!isRuntimeArray(input)) return undefined;
            const groups = new Map<string, { readonly key: JsonValue; readonly items: RuntimeValue[]; }>();
            for (const item of input) {
                const key = evaluate(expr["key"], { ...env, item });
                if (!comparable(key) || !finiteKey(key)) return undefined;
                const encoded = canonicalJson(key);
                const group = groups.get(encoded);
                if (group) group.items.push(item);
                else groups.set(encoded, { key, items: [item] });
            }
            return [...groups.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, group]) => group);
        }
        case "join": {
            const separator = string(expr["separator"]);
            const input = run(expr["input"]);
            if (!isRuntimeArray(input)) return undefined;
            const values: string[] = [];
            for (const item of input) {
                if (item === undefined || typeof item === "object" && item !== null || typeof item === "number" && !Number.isFinite(item)) return undefined;
                values.push(String(item));
            }
            return values.join(separator);
        }
        case "filter": case "map": case "any": case "all": {
            const input = run(expr["input"]);
            if (!Array.isArray(input)) return op === "any" || op === "all" ? false : undefined;
            const predicate = (item: RuntimeValue): boolean => evaluate(expr["where"], { ...env, item }) === true;
            if (op === "map") return input.map(item => evaluate(expr["value"], { ...env, item }));
            if (op === "filter") return input.filter(predicate);
            return op === "any" ? input.some(predicate) : input.length > 0 && input.every(predicate);
        }
        case "case": {
            for (const value of array(expr["cases"])) { const entry = object(value); if (run(entry["when"]) === true) return run(entry["value"]); }
            return run(expr["default"]);
        }
        default: throw new Error(`Unsupported lens expression ${op}`);
    }
}
