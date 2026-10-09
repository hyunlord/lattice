import { addSources, collected, collectionSources, itemEnvironment, locatedPath, locatedRecord, pathSegment } from "./provenance.js";
import type { Provenance } from "./provenance.js";
export { addSources, pathSegment } from "./provenance.js";
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
export type Environment = { readonly provenance?: Provenance; readonly itemSources?: readonly Source[]; readonly codeSupport?: ReadonlyMap<string, CodeSupportEvaluation>; readonly expressionSource?: Source; readonly sourceLink?: (source: Source) => Source; readonly node?: JsonObject; readonly item?: RuntimeValue; readonly vars: RuntimeObject; readonly records: readonly ExtractedRecord[]; readonly sources: Map<string, Source>; readonly graph?: JsonObject; };
export function recordView(node: NodeDraft): JsonObject { return { ...node.attributes, id: node.id, kind: node.kind, name: node.name }; }
export function evaluateLocated(expression: JsonValue | undefined, env: Environment): { readonly value: RuntimeValue; readonly sources: readonly Source[]; } {
    const sources = new Map<string, Source>();
    const value = evaluate(expression, { ...env, sources });
    const retained = [...sources.values()].sort((left, right) => {
        const a = `${left.path}#${left.pointer}`, b = `${right.path}#${right.pointer}`;
        return a < b ? -1 : a > b ? 1 : 0;
    });
    addSources(env, retained);
    return { value, sources: retained };
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
        case "source": return evaluateLocated(expr["value"], env).sources.map(source => ({ ...source }));
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
            const root = from === "node" ? env.node : from === "item" ? env.item : from === "vars" ? env.vars : from === "graph" ? env.graph ?? { nodes: env.records.map(record => recordView(record.node)) } : undefined;
            if (!["node", "item", "vars", "graph"].includes(from)) throw new Error(`Unknown expression scope ${from}`);
            if (from === "item" && !path.length) addSources(env, env.itemSources ?? []);
            return locatedPath(root, path, env);
        }
        case "lookup": {
            const expected = run(expr["equals"]);
            const matches = env.records.filter(record => record.node.kind === string(expr["kind"]) && equal(getPath(recordView(record.node), array(expr["field"])), expected));
            if (matches.length > 1) throw new Error("Ambiguous lens lookup");
            const match = matches[0];
            if (match) addSources(env, match.node.sources);
            return match ? env.provenance ? locatedRecord(match, env.provenance) : recordView(match.node) : undefined;
        }
        case "at": { const key = run(expr["key"]); return typeof key === "string" || typeof key === "number" ? locatedPath(run(expr["object"]), [String(key)], env) : undefined; }
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
        case "flatten": {
            const value = run(expr["value"]);
            if (!isRuntimeArray(value)) return undefined;
            return collected(value.flatMap((child, index) => isRuntimeArray(child) ? child.map((value, childIndex) => ({ value, sources: collectionSources(env, child, childIndex) })) : [{ value: child, sources: collectionSources(env, value, index) }]), env);
        }
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
            const entries: { readonly value: RuntimeValue; readonly sources: readonly Source[]; }[] = [];
            for (const value of values) {
                if (!isRuntimeArray(value)) return undefined;
                entries.push(...value.map((child, index) => ({ value: child, sources: collectionSources(env, value, index) })));
            }
            return collected(entries, env);
        }
        case "indexOf": {
            const input = run(expr["input"]), value = run(expr["value"]);
            if (typeof input === "string" && typeof value === "string") return input.indexOf(value);
            return Array.isArray(input) && value !== undefined ? input.findIndex(item => equal(item, value)) : undefined;
        }
        case "let": {
            const vars: Record<string, RuntimeValue> = { ...env.vars };
            const dependencies = new Map(env.provenance?.dependencies.get(env.vars));
            env.provenance?.dependencies.set(vars, dependencies);
            for (const [key, expression] of Object.entries(object(expr["bindings"]))) {
                const result = evaluateLocated(expression, { ...env, vars });
                vars[key] = result.value;
                dependencies.set(key, result.sources);
            }
            return evaluate(expr["value"], { ...env, vars });
        }
        case "unique": {
            const value = run(expr["value"]);
            if (!isRuntimeArray(value)) return undefined;
            const entries = new Map<string, { value: RuntimeValue; readonly sources: Map<string, Source>; }>();
            for (const [index, child] of value.entries()) {
                const key = valueKey(child);
                const entry = entries.get(key) ?? { value: child, sources: new Map<string, Source>() };
                entry.value = child;
                for (const source of collectionSources(env, value, index)) entry.sources.set(`${source.path}#${source.pointer}`, source);
                entries.set(key, entry);
            }
            return collected([...entries.values()].map(entry => ({ value: entry.value, sources: [...entry.sources.values()] })), env);
        }
        case "groupBy": {
            const input = run(expr["input"]);
            if (!isRuntimeArray(input)) return undefined;
            const groups = new Map<string, { readonly value: { readonly key: JsonValue; readonly items: RuntimeValue[]; }; readonly members: Map<string, readonly Source[]>; readonly keys: Source[]; }>();
            for (const [index, item] of input.entries()) {
                const locatedKey = evaluateLocated(expr["key"], itemEnvironment(env, input, index));
                const key = locatedKey.value;
                if (!comparable(key) || !finiteKey(key)) return undefined;
                const encoded = canonicalJson(key);
                const group = groups.get(encoded);
                const target = group ?? { value: { key, items: [] }, members: new Map<string, readonly Source[]>(), keys: [] };
                target.members.set(String(target.value.items.length), collectionSources(env, input, index));
                target.value.items.push(item);
                target.keys.push(...locatedKey.sources);
                if (!group) {
                    env.provenance?.dependencies.set(target.value.items, target.members);
                    env.provenance?.dependencies.set(target.value, new Map([["key", target.keys]]));
                    groups.set(encoded, target);
                }
            }
            return [...groups.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, group]) => group.value);
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
            const predicate = (_item: RuntimeValue, index: number): boolean => evaluate(expr["where"], itemEnvironment(env, input, index)) === true;
            if (op === "map") {
                const dependencies = new Map<string, readonly Source[]>();
                const result = input.map((_item, index) => {
                    const child = evaluateLocated(expr["value"], itemEnvironment(env, input, index));
                    dependencies.set(String(index), child.sources);
                    return child.value;
                });
                env.provenance?.dependencies.set(result, dependencies);
                return result;
            }
            if (op === "filter") return collected(input.flatMap((item, index) => predicate(item, index) ? [{ value: item, sources: collectionSources(env, input, index) }] : []), env);
            return op === "any" ? input.some(predicate) : input.length > 0 && input.every(predicate);
        }
        case "case": {
            for (const value of array(expr["cases"])) { const entry = object(value); if (run(entry["when"]) === true) return run(entry["value"]); }
            return run(expr["default"]);
        }
        default: throw new Error(`Unsupported lens expression ${op}`);
    }
}
