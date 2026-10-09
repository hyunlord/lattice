import { inspectCodeSurface } from "../adapters/code-support.js";
import type { CodeSelector } from "../adapters/code-support.js";
import { DataInputError } from "../adapters/types.js";
import type { ExtractedRecord, SourceInput } from "../adapters/types.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import { addSources, evaluate, isObject } from "./runtime.js";
import type { Environment } from "./runtime.js";
import { matchesQuery } from "./structure.js";

export type CodeLinkRule = {
    readonly id: string; readonly pointer: string; readonly query: JsonObject; readonly values: JsonValue;
    readonly language: string; readonly files: readonly string[]; readonly selectors: readonly CodeSelector[]; readonly sources: readonly Source[];
};
export type CodeSupportEvaluation = { readonly applicable: boolean; readonly value: JsonObject; readonly sources: readonly Source[]; };
type Diagnostic = { readonly selector: number; readonly reason: string; readonly sources: readonly Source[]; };
export type PreparedCodeLink = { readonly surface: ReturnType<typeof inspectCodeSurface>; readonly diagnostics: readonly Diagnostic[]; };

export function parseCodeLinks(definition: ExtractedRecord): readonly CodeLinkRule[] {
    const fail = (pointer: string, reason: string): never => {
        const source = definition.fields[pointer] ?? definition.node.sources[0];
        throw new DataInputError(source?.path ?? "<lens>", source?.line ?? 1, `${pointer}: ${reason}`);
    };
    const declarations = definition.node.attributes["codeLinks"] ?? [];
    if (!Array.isArray(declarations)) return fail("/codeLinks", "Expected codeLinks array");
    const ids = new Set<string>();
    return declarations.map((value, index) => {
        const pointer = `/codeLinks/${index}`;
        if (!isObject(value)) return fail(pointer, "Expected code-link object");
        const text = (value: JsonValue | undefined, field: string): string => typeof value === "string" && value.length > 0 ? value : fail(field, "Expected nonempty string");
        const id = text(value["id"], `${pointer}/id`);
        if (ids.has(id)) return fail(`${pointer}/id`, `Duplicate code-link ID ${id}`);
        ids.add(id);
        const query = value["query"] ?? {};
        if (!isObject(query)) return fail(`${pointer}/query`, "Expected query object");
        if (query["kinds"] !== undefined && (!Array.isArray(query["kinds"]) || !query["kinds"].every(kind => typeof kind === "string"))) return fail(`${pointer}/query/kinds`, "Expected kinds array of strings");
        if (query["layer"] !== undefined && typeof query["layer"] !== "string") return fail(`${pointer}/query/layer`, "Expected layer string");
        const values = value["values"];
        if (values === undefined) return fail(`${pointer}/values`, "Expected operation values expression");
        const files = value["files"];
        if (!Array.isArray(files) || !files.length) return fail(`${pointer}/files`, "Expected nonempty files array");
        const patterns = files.map((file, index) => {
            const pattern = text(file, `${pointer}/files/${index}`);
            if (pattern.startsWith("/") || /[\\:\u0000-\u001f]/u.test(pattern) || pattern.split("/").some(part => !part || part === "." || part === "..")) return fail(`${pointer}/files/${index}`, "Expected repository-relative file pattern");
            return pattern;
        });
        const selectors = value["selectors"];
        if (!Array.isArray(selectors) || !selectors.length) return fail(`${pointer}/selectors`, "Expected nonempty selectors array");
        const parsed = selectors.map((selector, index): CodeSelector => {
            const at = `${pointer}/selectors/${index}`;
            if (!isObject(selector)) return fail(at, "Expected selector object");
            const within = text(selector["within"], `${at}/within`);
            switch (selector["kind"]) {
                case "switch-case": return { kind: "switch-case", within, expression: text(selector["expression"], `${at}/expression`) };
                case "call-argument": {
                    const argumentIndex = selector["argumentIndex"];
                    if (typeof argumentIndex !== "number" || !Number.isSafeInteger(argumentIndex) || argumentIndex < 0) return fail(`${at}/argumentIndex`, "Expected nonnegative argument index");
                    return { kind: "call-argument", within, callee: text(selector["callee"], `${at}/callee`), argumentIndex };
                }
                default: return fail(`${at}/kind`, "Unknown code selector kind");
            }
        });
        const source = definition.fields[pointer] ?? definition.node.sources[0];
        return { id, pointer, query, values, language: text(value["language"], `${pointer}/language`), files: patterns, selectors: parsed, sources: source ? [source] : [] };
    });
}

export function prepareCodeLinks(rules: readonly CodeLinkRule[], inputs: readonly SourceInput[], matches: (path: string, pattern: string) => boolean): ReadonlyMap<string, PreparedCodeLink> {
    return new Map(rules.map(rule => {
        const selected = inputs.filter(input => rule.files.some(pattern => matches(input.path, pattern)));
        const diagnostics: Diagnostic[] = rule.files.filter(pattern => !selected.some(input => matches(input.path, pattern))).map(pattern => ({ selector: -1, reason: `Required source pattern has no input: ${pattern}`, sources: rule.sources }));
        const surface = rule.language === "csharp" ? inspectCodeSurface(selected, rule.selectors) : { selectors: rule.selectors.map((_, selector) => ({ selector, status: "unknown" as const, sources: [], diagnostics: [`Unsupported code language ${rule.language}`] })), matches: [] };
        for (const selector of surface.selectors) for (const reason of selector.diagnostics) diagnostics.push({ selector: selector.selector, reason, sources: selector.sources });
        return [rule.id, { surface, diagnostics }];
    }));
}

export function evaluateCodeLink(rule: CodeLinkRule, env: Environment, prepared: PreparedCodeLink): CodeSupportEvaluation {
    const diagnostics = [...prepared.diagnostics];
    addSources(env, rule.sources);
    const applicable = matchesQuery(rule.query, env);
    const raw = applicable ? evaluate(rule.values, env) : undefined;
    const values = typeof raw === "string" && raw.length > 0 ? [raw] : Array.isArray(raw) && raw.every(value => typeof value === "string" && value.length > 0) ? raw : [];
    if (!applicable) diagnostics.push({ selector: -1, reason: "Rule not applicable to current node", sources: rule.sources });
    else if (!values.length || values.some(value => !value)) diagnostics.push({ selector: -1, reason: "Missing, empty, or invalid operation values", sources: rule.sources });
    const complete = !diagnostics.length && prepared.surface.selectors.every(selector => selector.status === "complete");
    const linked = (source: Source): Source => env.sourceLink?.(source) ?? source;
    const results = [...new Set(values)].sort().map(value => {
        const evidence = prepared.surface.matches.filter(match => match.value === value).map(match => linked(match.source));
        return { value, status: evidence.length ? "supported" : complete ? "unsupported" : "unknown", evidence: evidence.map(source => ({ ...source })) };
    });
    const status = results.some(result => result.status === "unsupported") ? "unsupported" : !results.length || results.some(result => result.status === "unknown") ? "unknown" : "supported";
    const sources = [...env.sources.values(), ...prepared.surface.selectors.flatMap(selector => selector.sources).map(linked), ...prepared.surface.matches.map(match => linked(match.source))];
    const value: JsonObject = { status, coverage: complete ? "complete" : "partial", values: results, diagnostics: diagnostics.map(diagnostic => ({ ...diagnostic, sources: diagnostic.sources.map(source => ({ ...linked(source) })) })) };
    return { applicable, value, sources };
}
