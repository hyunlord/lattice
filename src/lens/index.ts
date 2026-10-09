import { parseCodeLinks, prepareCodeLinks, evaluateCodeLink } from "./code-links.js";
import type { CodeLinkRule, CodeSupportEvaluation } from "./code-links.js";
import { compileDerived } from "./derived.js";
import type { DerivedPlan } from "./derived.js";
import { materializeEdges, materializeViews, matchesQuery, prepareRecords } from "./structure.js";
import type { ReferenceDiagnostic } from "../adapters/resolve.js";
import { evaluateGate } from "./gates.js";
import { addSources, array, evaluate, object, recordView, string } from "./runtime.js";
import type { Environment } from "./runtime.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { NodeDraft, Source, Facet, Finding, Edge, View } from "../core/model.js";
import { extractYamlDocument } from "../adapters/yaml.js";
import { extractJson } from "../adapters/json.js";
import type { ExtractedRecord, SourceInput } from "../adapters/types.js";

export type LensSelection = { readonly namespaceFrom?: string; readonly idField?: string; readonly nameField?: string; readonly files: readonly string[]; readonly records?: string; readonly kindField?: string; readonly layer?: string; readonly references?: boolean; };
export type LensKind = { readonly namespaceFrom?: string; readonly selections?: readonly LensSelection[]; readonly kindField?: string; readonly layer?: string; readonly references?: boolean; readonly id: string; readonly label: string; readonly files: readonly string[]; readonly records?: string; readonly idField?: string; readonly nameField?: string; readonly columns?: readonly string[]; readonly hidden?: boolean; };
export type Lens = { readonly name: string; readonly kinds: readonly LensKind[]; readonly config: JsonObject; readonly derived: DerivedPlan; readonly codeLinks: readonly CodeLinkRule[]; };
function boolean(value: JsonValue): boolean { if (typeof value !== "boolean") throw new Error("Lens expected a boolean"); return value; }
function lensRecord(input: SourceInput): ExtractedRecord | undefined {
    return /\.ya?ml$/iu.test(input.path) ? extractYamlDocument(input) : extractJson(input)[0];
}
export function parseLens(input: SourceInput): Lens {
    const definition = lensRecord(input);
    const config = definition?.node.attributes;
    if (!definition || !config || config["schemaVersion"] !== 1) throw new Error("Expected lens schemaVersion 1");
    const kinds = array(config["kinds"]).map(value => {
        const kind = object(value);
        return {
            id: string(kind["id"]), label: string(kind["label"]), files: array(kind["files"]).map(string),
            ...(kind["kindField"] === undefined ? {} : { kindField: string(kind["kindField"]) }),
            ...(kind["namespaceFrom"] === undefined ? {} : { namespaceFrom: string(kind["namespaceFrom"]) }),
            ...(kind["layer"] === undefined ? {} : { layer: string(kind["layer"]) }),
            ...(kind["references"] === undefined ? {} : { references: boolean(kind["references"]) }),
            ...(kind["selections"] === undefined ? {} : {
                selections: array(kind["selections"]).map(value => {
                    const selection = object(value);
                    return {
                        files: array(selection["files"]).map(string),
                        ...(selection["idField"] === undefined ? {} : { idField: string(selection["idField"]) }),
                        ...(selection["nameField"] === undefined ? {} : { nameField: string(selection["nameField"]) }),
                        ...(selection["records"] === undefined ? {} : { records: string(selection["records"]) }),
                        ...(selection["kindField"] === undefined ? {} : { kindField: string(selection["kindField"]) }),
                        ...(selection["namespaceFrom"] === undefined ? {} : { namespaceFrom: string(selection["namespaceFrom"]) }),
                        ...(selection["layer"] === undefined ? {} : { layer: string(selection["layer"]) }),
                        ...(selection["references"] === undefined ? {} : { references: boolean(selection["references"]) }),
                    };
                })
            }),
            ...(kind["records"] === undefined ? {} : { records: string(kind["records"]) }),
            ...(kind["idField"] === undefined ? {} : { idField: string(kind["idField"]) }),
            ...(kind["nameField"] === undefined ? {} : { nameField: string(kind["nameField"]) }),
            ...(kind["columns"] === undefined ? {} : { columns: array(kind["columns"]).map(string) }),
            ...(kind["hidden"] === undefined ? {} : { hidden: kind["hidden"] === true }),
        };
    });
    if (new Set(kinds.map(kind => kind.id)).size !== kinds.length) throw new Error("Duplicate lens kind");
    const codeLinks = parseCodeLinks(definition);
    return { name: string(config["name"]), kinds, config, codeLinks, derived: compileDerived(definition, codeLinks) };
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
export function applyLens(base: readonly ExtractedRecord[], lens: Lens, input: SourceInput, options: { readonly knownNodes?: readonly NodeDraft[]; readonly structuralEdges?: (nodes: readonly NodeDraft[]) => readonly Edge[]; readonly codeInputs?: readonly SourceInput[]; readonly sourceLink?: (source: Source) => Source; } = {}): { readonly nodes: readonly NodeDraft[]; readonly facets: readonly Facet[]; readonly findings: readonly Finding[]; readonly presentation: JsonObject; readonly edges: readonly Edge[]; readonly views: readonly View[]; readonly diagnostics: readonly ReferenceDiagnostic[]; } {
    const definition = lensRecord(input);
    if (!definition) throw new Error("Missing lens definition");
    const resolved = prepareRecords(base, lens.config, definition, options.knownNodes);
    const records = resolved.records;
    const initialEdges = [...resolved.edges, ...(options.structuralEdges?.(resolved.nodes) ?? [])];
    const graph: Record<string, JsonValue> = { nodes: records.map(record => recordView(record.node)), edges: initialEdges.map(edge => ({ ...edge, sources: edge.sources.map(source => ({ ...source })) })) };
    const derived = lens.derived;
    const codeLinks = prepareCodeLinks(lens.codeLinks, options.codeInputs ?? [], matchesGlob);
    const expressionSource = definition.node.sources[0];
    const supportContext = { ...(expressionSource ? { expressionSource } : {}), ...(options.sourceLink ? { sourceLink: options.sourceLink } : {}) };
    const graphVars: Record<string, JsonValue> = {};
    const graphSources = new Map<string, Source>();
    for (const rule of derived.graph) graphVars[rule.id] = evaluate(rule.value, { ...supportContext, ...(rule.source ? { expressionSource: rule.source } : {}), vars: graphVars, records, sources: graphSources, graph }) ?? null;
    const environments = new Map<string, Environment>();
    const facets: Facet[] = [];
    const applies = (rule: JsonObject, node: NodeDraft): boolean => (rule["layer"] === undefined || rule["layer"] === node.attributes["layer"]) && (rule["kinds"] === undefined || array(rule["kinds"]).includes(node.kind));
    for (const record of records) {
        const vars = { ...graphVars };
        const support = new Map<string, CodeSupportEvaluation>();
        const env: Environment = { ...supportContext, node: recordView(record.node), vars, records, sources: new Map(graphSources), graph, codeSupport: support };
        addSources(env, record.node.sources);
        for (const rule of derived.node) {
            switch (rule.type) {
                case "derived":
                    if ((rule.layer === undefined || rule.layer === record.node.attributes["layer"]) && (rule.kinds === undefined || rule.kinds.includes(record.node.kind))) vars[rule.id] = evaluate(rule.value, { ...env, ...(rule.source ? { expressionSource: rule.source } : {}) }) ?? null;
                    break;
                case "codeLink": {
                    const prepared = codeLinks.get(rule.id);
                    if (!prepared) throw new Error("Missing prepared code-link surface");
                    const result = evaluateCodeLink(rule.rule, env, prepared);
                    support.set(rule.id, result);
                    if (result.applicable) facets.push({ id: `codeSupport:${rule.id}:${record.node.id}`, nodeId: record.node.id, key: `codeSupport:${rule.id}`, ruleId: rule.id, value: result.value, sources: result.sources });
                    break;
                }
            }
        }
        environments.set(record.node.id, env);
    }
    const context = { config: lens.config, definition, records, environments };
    const edges = [...initialEdges, ...materializeEdges(context)];
    graph["edges"] = edges.map(edge => ({ ...edge, sources: edge.sources.map(source => ({ ...source })) }));
    for (const record of records) {
        const env = environments.get(record.node.id);
        if (!env) throw new Error("Missing node environment");
        array(lens.config["facets"] ?? []).forEach((value, index) => {
            const rule = object(value);
            if (!applies(rule, record.node)) return;
            const source = definition.fields[`/facets/${index}`];
            const result = evaluate(rule["value"] ?? { op: "case", cases: rule["cases"] ?? [], default: rule["default"] ?? null }, { ...env, ...(source ? { expressionSource: source } : {}) }) ?? null;
            facets.push({ id: `${string(rule["id"])}:${record.node.id}`, nodeId: record.node.id, key: string(rule["key"]), value: result, ruleId: string(rule["id"]), sources: [...env.sources.values(), ...(source ? [source] : [])] });
        });
    }
    const findings: Finding[] = array(lens.config["findings"] ?? []).map((value, index) => {
        const rule = object(value); const query = object(rule["query"] ?? {});
        const targets = records.filter(record => matchesQuery(query, environments.get(record.node.id) ?? { vars: graphVars, records, sources: graphSources, graph }));
        const sources = new Map<string, Source>();
        const env: Environment = { ...supportContext, ...(definition.fields[`/findings/${index}`] ? { expressionSource: definition.fields[`/findings/${index}`] } : {}), vars: { ...graphVars, targets: targets.map(record => recordView(record.node)), targetValues: targets.map(record => ({ node: recordView(record.node), derived: environments.get(record.node.id)?.vars ?? {} })) }, records, sources, graph };
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
    return { nodes: records.map(record => record.node), edges, views: materializeViews(context, edges), diagnostics: resolved.diagnostics, facets, findings, presentation: object(lens.config["presentation"] ?? {}) };
}
