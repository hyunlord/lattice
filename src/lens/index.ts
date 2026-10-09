import { evaluateGate } from "./gates.js";
import { canonicalJson } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { NodeDraft, Source, Facet, Finding } from "../core/model.js";
import { extractYamlDocument } from "../adapters/yaml.js";
import { extractJson } from "../adapters/json.js";
import type { ExtractedRecord, SourceInput } from "../adapters/types.js";

export type LensKind = { readonly id: string; readonly label: string; readonly files: readonly string[]; readonly records?: string; readonly idField?: string; readonly nameField?: string; readonly columns?: readonly string[]; readonly hidden?: boolean; };
export type Lens = { readonly name: string; readonly kinds: readonly LensKind[]; readonly config: JsonObject; };
function isObject(value: JsonValue | undefined): value is JsonObject { return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value); }
function object(value: JsonValue | undefined): JsonObject {
    if (!isObject(value)) throw new Error("Lens expected an object");
    return value;
}
function array(value: JsonValue | undefined): readonly JsonValue[] {
    if (!Array.isArray(value)) throw new Error("Lens expected an array");
    return value;
}
function string(value: JsonValue | undefined): string {
    if (typeof value !== "string") throw new Error("Lens expected a string");
    return value;
}
function lensRecord(input: SourceInput): ExtractedRecord | undefined {
    return /\.ya?ml$/iu.test(input.path) ? extractYamlDocument(input) : extractJson(input)[0];
}
export function parseLens(input: SourceInput): Lens {
    const config = lensRecord(input)?.node.attributes;
    if (!config || config["schemaVersion"] !== 1) throw new Error("Expected lens schemaVersion 1");
    const kinds = array(config["kinds"]).map(value => {
        const kind = object(value);
        return {
            id: string(kind["id"]), label: string(kind["label"]), files: array(kind["files"]).map(string),
            ...(kind["records"] === undefined ? {} : { records: string(kind["records"]) }),
            ...(kind["idField"] === undefined ? {} : { idField: string(kind["idField"]) }),
            ...(kind["nameField"] === undefined ? {} : { nameField: string(kind["nameField"]) }),
            ...(kind["columns"] === undefined ? {} : { columns: array(kind["columns"]).map(string) }),
            ...(kind["hidden"] === undefined ? {} : { hidden: kind["hidden"] === true }),
        };
    });
    if (new Set(kinds.map(kind => kind.id)).size !== kinds.length) throw new Error("Duplicate lens kind");
    return { name: string(config["name"]), kinds, config };
}
export function matchesGlob(path: string, pattern: string): boolean {
    let expression = "^";
    for (let i = 0; i < pattern.length; i++) {
        const char = pattern[i] ?? "";
        if (char === "*" && pattern[i + 1] === "*") {
            i++;
            if (pattern[i + 1] === "/") { i++; expression += "(?:.*/)?"; } else expression += ".*";
        } else if (char === "*") expression += "[^/]*";
        else if (char === "?") expression += "[^/]";
        else expression += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp(`${expression}$`, "u").test(path);
}
type Environment = { readonly node?: JsonObject; readonly item?: JsonValue; readonly vars: JsonObject; readonly records: readonly ExtractedRecord[]; readonly sources: Map<string, Source>; };
function recordView(node: NodeDraft): JsonObject { return { ...node.attributes, id: node.id, kind: node.kind, name: node.name }; }
function addSources(env: Environment, sources: readonly Source[]): void {
    for (const source of sources) env.sources.set(`${source.path}#${source.pointer}`, source);
}
function getPath(value: JsonValue | undefined, path: readonly JsonValue[]): JsonValue | undefined {
    if (!path.length) return value;
    const [head, ...tail] = path;
    if (head === "*" && Array.isArray(value)) return value.map(child => getPath(child, tail) ?? null);
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    const key = string(head);
    if (!Object.hasOwn(value, key)) return undefined;
    return getPath(Array.isArray(value) ? value[Number(key)] : object(value)[key], tail);
}
function evaluate(expression: JsonValue | undefined, env: Environment): JsonValue | undefined {
    if (expression === undefined || expression === null || typeof expression !== "object") return expression;
    const expr = object(expression);
    const op = string(expr["op"]);
    const run = (value: JsonValue | undefined): JsonValue | undefined => evaluate(value, env);
    const list = (): readonly JsonValue[] => array(expr["values"]);
    switch (op) {
        case "literal": return expr["value"];
        case "get": {
            const from = string(expr["from"]);
            const path = array(expr["path"]);
            const sourceValue = from === "node" ? env.node : from === "item" ? env.item : from === "vars" && typeof path[0] === "string" ? env.vars[path[0]] : undefined;
            if (isObject(sourceValue) && typeof sourceValue["id"] === "string") {
                const record = env.records.find(record => record.node.id === sourceValue["id"]);
                const sourcePath = from === "vars" ? path.slice(1) : path;
                const pointer = sourcePath.length ? "/" + sourcePath.map(part => string(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : "";
                const source = record?.fields[pointer];
                if (source) addSources(env, [source]);
            }
            const root = from === "node" ? env.node : from === "item" ? env.item : from === "vars" ? env.vars : from === "graph" ? { nodes: env.records.map(record => recordView(record.node)) } : undefined;
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
        case "count": { const value = run(expr["value"]); return Array.isArray(value) ? value.length : undefined; }
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
export function applyLens(records: readonly ExtractedRecord[], lens: Lens, input: SourceInput): { readonly nodes: readonly NodeDraft[]; readonly facets: readonly Facet[]; readonly findings: readonly Finding[]; readonly presentation: JsonObject; } {
    const definition = lensRecord(input);
    const derived = array(lens.config["derived"] ?? []);
    const graphVars: Record<string, JsonValue> = {};
    const graphSources = new Map<string, Source>();
    for (const value of derived) {
        const rule = object(value);
        if (rule["scope"] === "graph") graphVars[string(rule["id"])] = evaluate(rule["value"], { vars: graphVars, records, sources: graphSources }) ?? null;
    }
    const environments = new Map<string, Environment>();
    const facets: Facet[] = [];
    const applies = (rule: JsonObject, node: NodeDraft): boolean => rule["kinds"] === undefined || array(rule["kinds"]).includes(node.kind);
    for (const record of records) {
        const vars = { ...graphVars };
        const env: Environment = { node: recordView(record.node), vars, records, sources: new Map(graphSources) };
        addSources(env, record.node.sources);
        for (const value of derived) { const rule = object(value); if (rule["scope"] === "node" && applies(rule, record.node)) vars[string(rule["id"])] = evaluate(rule["value"], env) ?? null; }
        environments.set(record.node.id, env);
        array(lens.config["facets"] ?? []).forEach((value, index) => {
            const rule = object(value);
            if (!applies(rule, record.node)) return;
            const result = evaluate(rule["value"] ?? { op: "case", cases: rule["cases"] ?? [], default: rule["default"] ?? null }, env) ?? null;
            const source = definition?.fields[`/facets/${index}`];
            facets.push({ id: `${string(rule["id"])}:${record.node.id}`, nodeId: record.node.id, key: string(rule["key"]), value: result, ruleId: string(rule["id"]), sources: [...env.sources.values(), ...(source ? [source] : [])] });
        });
    }
    const findings: Finding[] = array(lens.config["findings"] ?? []).map((value, index) => {
        const rule = object(value); const query = object(rule["query"] ?? {});
        const targets = records.filter(record => applies(query, record.node) && (query["where"] === undefined || evaluate(query["where"], environments.get(record.node.id) ?? { vars: graphVars, records, sources: graphSources }) === true));
        const sources = new Map<string, Source>();
        const env: Environment = { vars: { ...graphVars, targets: targets.map(record => recordView(record.node)) }, records, sources };
        for (const target of targets) addSources(env, [...(environments.get(target.node.id)?.sources.values() ?? target.node.sources)]);
        const lensSource = definition?.fields[`/findings/${index}`];
        if (lensSource) addSources(env, [lensSource]);
        const metrics: Record<string, JsonValue> = {};
        for (const [key, expression] of Object.entries(object(rule["metrics"]))) metrics[key] = evaluate(expression, env) ?? null;
        const severity = rule["severity"] ?? "info";
        if (severity !== "info" && severity !== "warning" && severity !== "error") throw new Error("Invalid finding severity");
        const basis = rule["basis"] ?? "computed";
        if (basis !== "computed" && basis !== "authored-interpretation" && basis !== "source-support") throw new Error("Invalid finding basis");
        const gate = evaluateGate(rule["gate"], metrics);
        return { ...(gate ? { gate } : {}), id: string(rule["id"]), ruleId: string(rule["id"]), severity, basis, targetIds: targets.map(record => record.node.id), metrics, message: string(rule["template"]).replace(/\{([^{}]+)\}/g, (_, key: string) => String(metrics[key] ?? "?")), sources: [...sources.values()], ...(typeof rule["intent"] === "string" ? { intent: rule["intent"] } : {}), ...(typeof rule["implementation"] === "string" ? { implementation: rule["implementation"] } : {}) };
    });
    return { nodes: records.map(record => record.node), facets, findings, presentation: object(lens.config["presentation"] ?? {}) };
}
