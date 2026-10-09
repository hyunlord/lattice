import { canonicalJson } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { NodeDraft, Source } from "../core/model.js";
import { DataInputError } from "../adapters/types.js";
import type { CodeSupportEvaluation } from "./code-links.js";
import type { ExtractedRecord } from "../adapters/types.js";
export function isObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
export function object(value: JsonValue | undefined): JsonObject {
    if (!isObject(value)) throw new Error("Lens expected an object");
    return value;
}
export function array(value: JsonValue | undefined): readonly JsonValue[] {
    if (!Array.isArray(value)) throw new Error("Lens expected an array");
    return value;
}
export function string(value: JsonValue | undefined): string {
    if (typeof value !== "string") throw new Error("Lens expected a string");
    return value;
}
export type Environment = { readonly codeSupport?: ReadonlyMap<string, CodeSupportEvaluation>; readonly expressionSource?: Source; readonly sourceLink?: (source: Source) => Source; readonly node?: JsonObject; readonly item?: JsonValue; readonly vars: JsonObject; readonly records: readonly ExtractedRecord[]; readonly sources: Map<string, Source>; readonly graph?: JsonObject; };
export function recordView(node: NodeDraft): JsonObject { return { ...node.attributes, id: node.id, kind: node.kind, name: node.name }; }
export function addSources(env: Environment, sources: readonly Source[]): void {
    for (const source of sources) env.sources.set(`${source.path}#${source.pointer}`, source);
}
export function pathSegment(value: JsonValue | undefined): string {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
    return string(value);
}
export function getPath(value: JsonValue | undefined, path: readonly JsonValue[]): JsonValue | undefined {
    if (!path.length) return value;
    const [head, ...tail] = path;
    if (head === "*" && Array.isArray(value)) return value.map(child => getPath(child, tail) ?? null);
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    const key = pathSegment(head);
    if (!Object.hasOwn(value, key)) return undefined;
    return getPath(Array.isArray(value) ? value[Number(key)] : object(value)[key], tail);
}
export function evaluate(expression: JsonValue | undefined, env: Environment): JsonValue | undefined {
    if (expression === undefined || expression === null || typeof expression !== "object") return expression;
    const expr = object(expression);
    const op = string(expr["op"]);
    const run = (value: JsonValue | undefined): JsonValue | undefined => evaluate(value, env);
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
            if (isObject(sourceValue) && typeof sourceValue["id"] === "string") {
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
            const matches = env.records.filter(record => record.node.kind === string(expr["kind"]) && canonicalJson(getPath(recordView(record.node), array(expr["field"])) ?? null) === canonicalJson(run(expr["equals"]) ?? null));
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
        case "eq": case "ne": { const same = canonicalJson(run(expr["left"]) ?? null) === canonicalJson(run(expr["right"]) ?? null); return op === "eq" ? same : !same; }
        case "gt": case "gte": case "lt": case "lte": {
            const left = run(expr["left"]); const right = run(expr["right"]);
            if (typeof left !== "number" || typeof right !== "number") return false;
            return op === "gt" ? left > right : op === "gte" ? left >= right : op === "lt" ? left < right : left <= right;
        }
        case "in": { const values = run(expr["collection"]); const value = run(expr["value"]); return Array.isArray(values) && values.some(child => canonicalJson(child) === canonicalJson(value ?? null)); }
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
            const result: JsonValue[] = [];
            for (const value of values) { if (!Array.isArray(value)) return undefined; result.push(...value); }
            return result;
        }
        case "indexOf": {
            const input = run(expr["input"]), value = run(expr["value"]);
            if (typeof input === "string" && typeof value === "string") return input.indexOf(value);
            return Array.isArray(input) && value !== undefined ? input.findIndex(item => canonicalJson(item) === canonicalJson(value)) : undefined;
        }
        case "let": {
            const vars: Record<string, JsonValue> = { ...env.vars };
            for (const [key, expression] of Object.entries(object(expr["bindings"]))) vars[key] = evaluate(expression, { ...env, vars }) ?? null;
            return evaluate(expr["value"], { ...env, vars });
        }
        case "unique": { const value = run(expr["value"]); return Array.isArray(value) ? [...new Map(value.map(child => [canonicalJson(child), child])).values()] : undefined; }
        case "filter": case "map": case "any": case "all": {
            const input = run(expr["input"]);
            if (!Array.isArray(input)) return undefined;
            const predicate = (item: JsonValue): boolean => evaluate(expr["where"], { ...env, item }) === true;
            if (op === "map") return input.map(item => evaluate(expr["value"], { ...env, item }) ?? null);
            if (op === "filter") return input.filter(predicate);
            return op === "any" ? input.some(predicate) : input.every(predicate);
        }
        case "case": {
            for (const value of array(expr["cases"])) { const entry = object(value); if (run(entry["when"]) === true) return run(entry["value"]); }
            return run(expr["default"]);
        }
        default: throw new Error(`Unsupported lens expression ${op}`);
    }
}
