import type { ExtractedRecord } from "../adapters/types.js";
import { DataInputError, pointerToken } from "../adapters/types.js";
import type { JsonValue } from "../core/canonical.js";
import { isObject } from "./runtime.js";

type DerivedRule = {
    readonly id: string;
    readonly scope: "graph" | "node";
    readonly value: JsonValue;
    readonly kinds?: readonly string[];
    readonly layer?: string;
    readonly dependencies: ReadonlyMap<string, string>;
};
export type DerivedPlan = { readonly graph: readonly DerivedRule[]; readonly node: readonly DerivedRule[]; };

type ExpressionSite = { readonly value: JsonValue; readonly pointer: string; readonly locals: ReadonlySet<string>; };

export function compileDerived(definition: ExtractedRecord): DerivedPlan {
    const fail = (pointer: string, reason: string): never => {
        const source = definition.fields[pointer] ?? definition.node.sources[0];
        throw new DataInputError(source?.path ?? "<lens>", source?.line ?? 1, `${pointer}: ${reason}`);
    };
    const declarations = definition.node.attributes["derived"] ?? [];
    if (!Array.isArray(declarations)) return fail("/derived", "Expected derived declarations array");
    const rules = new Map<string, DerivedRule>();
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
            if (!locals.has(id)) dependencies.set(id, `${pointer}/path/0`);
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
        if (rules.has(id)) return fail(`${pointer}/id`, `Duplicate derived ID ${id}`);
        if (scope !== "graph" && scope !== "node") return fail(`${pointer}/scope`, "Expected derived scope graph or node");
        if (value === undefined) return fail(`${pointer}/value`, "Expected derived value expression");
        const kinds = declaration["kinds"], layer = declaration["layer"];
        if (kinds !== undefined && (!Array.isArray(kinds) || !kinds.every(kind => typeof kind === "string"))) return fail(`${pointer}/kinds`, "Expected derived kinds array of strings");
        if (layer !== undefined && typeof layer !== "string") return fail(`${pointer}/layer`, "Expected derived layer string");
        const dependencies = new Map<string, string>();
        references({ value, pointer: `${pointer}/value`, locals: new Set() }, dependencies);
        rules.set(id, { id, scope, value, dependencies, ...(kinds === undefined ? {} : { kinds }), ...(layer === undefined ? {} : { layer }) });
    });
    const ordered: DerivedRule[] = [];
    const visited = new Set<string>();
    const visiting: string[] = [];
    const visit = (rule: DerivedRule): void => {
        if (visited.has(rule.id)) return;
        visiting.push(rule.id);
        for (const [id, pointer] of [...rule.dependencies].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
            const dependency = rules.get(id);
            if (!dependency) return fail(pointer, `Unknown derived dependency ${id}`);
            if (rule.scope === "graph" && dependency.scope === "node") return fail(pointer, `Graph derived ${rule.id} cannot depend on node derived ${id}`);
            const cycle = visiting.indexOf(id);
            if (cycle !== -1) return fail(pointer, `Derived dependency cycle: ${[...visiting.slice(cycle), id].join(" -> ")}`);
            visit(dependency);
        }
        visiting.pop();
        visited.add(rule.id);
        ordered.push(rule);
    };
    for (const id of [...rules.keys()].sort()) {
        const rule = rules.get(id);
        if (rule) visit(rule);
    }
    return { graph: ordered.filter(rule => rule.scope === "graph"), node: ordered.filter(rule => rule.scope === "node") };
}
