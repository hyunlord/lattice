import type { CodeLinkRule } from "./code-links.js";
import type { ExtractedRecord } from "../adapters/types.js";
import { DataInputError, pointerToken } from "../adapters/types.js";
import type { Source } from "../core/model.js";
import type { JsonValue } from "../core/canonical.js";
import { isObject } from "./runtime.js";

type DerivedRule = {
    readonly type: "derived";
    readonly source?: Source;
    readonly id: string;
    readonly scope: "graph" | "node";
    readonly value: JsonValue;
    readonly kinds?: readonly string[];
    readonly layer?: string;
    readonly dependencies: ReadonlyMap<string, string>;
};
type CodeLinkStep = { readonly type: "codeLink"; readonly scope: "node"; readonly id: string; readonly rule: CodeLinkRule; readonly dependencies: ReadonlyMap<string, string>; };
type NodeStep = DerivedRule | CodeLinkStep;
export type DerivedPlan = { readonly graph: readonly DerivedRule[]; readonly node: readonly NodeStep[]; };

type ExpressionSite = { readonly value: JsonValue; readonly pointer: string; readonly locals: ReadonlySet<string>; };

export function compileDerived(definition: ExtractedRecord, codeLinks: readonly CodeLinkRule[] = []): DerivedPlan {
    const fail = (pointer: string, reason: string): never => {
        const source = definition.fields[pointer] ?? definition.node.sources[0];
        throw new DataInputError(source?.path ?? "<lens>", source?.line ?? 1, `${pointer}: ${reason}`);
    };
    const declarations = definition.node.attributes["derived"] ?? [];
    if (!Array.isArray(declarations)) return fail("/derived", "Expected derived declarations array");
    const rules = new Map<string, NodeStep>();
    const references = (site: ExpressionSite, dependencies: Map<string, string>): void => {
        const { value, pointer, locals } = site;
        if (Array.isArray(value)) {
            value.forEach((child, index) => references({ value: child, pointer: `${pointer}/${index}`, locals }, dependencies));
            return;
        }
        if (!isObject(value) || value["op"] === "literal") return;
        if (value["op"] === "get" && value["from"] === "vars") {
            const path = value["path"];
            const id = Array.isArray(path) ? path[0] : undefined;
            if (typeof id !== "string" || !id || id === "*") return fail(`${pointer}/path`, "Derived vars reads require a named first path segment");
            if (!locals.has(id)) dependencies.set(`derived:${id}`, `${pointer}/path/0`);
            return;
        }
        if (value["op"] === "codeSupport") {
            const id = value["rule"];
            if (typeof id !== "string" || !id) return fail(`${pointer}/rule`, "Expected codeSupport rule ID");
            dependencies.set(`codeLink:${id}`, `${pointer}/rule`);
            return;
        }
        if (value["op"] === "let") {
            const bindings = value["bindings"];
            if (!isObject(bindings)) return fail(`${pointer}/bindings`, "Expected let bindings object");
            const bound = new Set(locals);
            for (const [id, expression] of Object.entries(bindings)) {
                references({ value: expression, pointer: `${pointer}/bindings/${pointerToken(id)}`, locals: bound }, dependencies);
                bound.add(id);
            }
            if (value["value"] === undefined) return fail(`${pointer}/value`, "Expected let value");
            references({ value: value["value"], pointer: `${pointer}/value`, locals: bound }, dependencies);
            return;
        }
        for (const [key, child] of Object.entries(value)) references({ value: child, pointer: `${pointer}/${pointerToken(key)}`, locals }, dependencies);
    };
    declarations.forEach((declaration, index) => {
        const pointer = `/derived/${index}`;
        if (!isObject(declaration)) return fail(pointer, "Expected derived declaration object");
        const id = declaration["id"], scope = declaration["scope"], value = declaration["value"];
        if (typeof id !== "string" || !id) return fail(`${pointer}/id`, "Expected nonempty derived ID");
        if (rules.has(`derived:${id}`)) return fail(`${pointer}/id`, `Duplicate derived ID ${id}`);
        if (scope !== "graph" && scope !== "node") return fail(`${pointer}/scope`, "Expected derived scope graph or node");
        if (value === undefined) return fail(`${pointer}/value`, "Expected derived value expression");
        const kinds = declaration["kinds"], layer = declaration["layer"];
        if (kinds !== undefined && (!Array.isArray(kinds) || !kinds.every(kind => typeof kind === "string"))) return fail(`${pointer}/kinds`, "Expected derived kinds array of strings");
        if (layer !== undefined && typeof layer !== "string") return fail(`${pointer}/layer`, "Expected derived layer string");
        const dependencies = new Map<string, string>();
        references({ value, pointer: `${pointer}/value`, locals: new Set() }, dependencies);
        const source = definition.fields[`${pointer}/value`] ?? definition.fields[pointer];
        rules.set(`derived:${id}`, { ...(source ? { source } : {}), type: "derived", id, scope, value, dependencies, ...(kinds === undefined ? {} : { kinds }), ...(layer === undefined ? {} : { layer }) });
    });
    for (const rule of codeLinks) {
        const dependencies = new Map<string, string>();
        references({ value: rule.values, pointer: `${rule.pointer}/values`, locals: new Set() }, dependencies);
        references({ value: rule.query, pointer: `${rule.pointer}/query`, locals: new Set() }, dependencies);
        rules.set(`codeLink:${rule.id}`, { type: "codeLink", scope: "node", id: rule.id, rule, dependencies });
    }
    const ordered: NodeStep[] = [];
    const visited = new Set<string>();
    const visiting: string[] = [];
    const visit = (rule: NodeStep): void => {
        const key = `${rule.type}:${rule.id}`;
        if (visited.has(key)) return;
        visiting.push(key);
        for (const [id, pointer] of [...rule.dependencies].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
            const dependency = rules.get(id);
            if (!dependency) return fail(pointer, `Unknown ${id.startsWith("codeLink:") ? "codeSupport rule" : "derived dependency"} ${id.slice(id.indexOf(":") + 1)}`);
            if (rule.scope === "graph" && dependency.scope === "node") return fail(pointer, `Graph derived ${rule.id} cannot depend on ${dependency.type === "codeLink" ? "current-node codeSupport" : "node derived"} ${dependency.id}`);
            const cycle = visiting.indexOf(id);
            if (cycle !== -1) return fail(pointer, `Derived dependency cycle: ${[...visiting.slice(cycle), id].map(key => key.startsWith("derived:") ? key.slice(8) : key).join(" -> ")}`);
            visit(dependency);
        }
        visiting.pop();
        visited.add(key);
        ordered.push(rule);
    };
    for (const id of [...rules.keys()].sort()) {
        const rule = rules.get(id);
        if (rule) visit(rule);
    }
    return { graph: ordered.filter((rule): rule is DerivedRule => rule.scope === "graph" && rule.type === "derived"), node: ordered.filter(rule => rule.scope === "node") };
}
