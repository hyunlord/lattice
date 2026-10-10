import type { ExtractedRecord } from "../adapters/types.js";
import type { Check } from "./schema-shape.js";
import { LensSchema } from "./schema-shape.js";
import { isObject } from "./runtime.js";
import { expressionCheck } from "./schema-expression.js";

export function validateLens(definition: ExtractedRecord): void {
    const s = new LensSchema(definition);
    const declarations = definition.node.attributes["codeLinks"];
    const codeIds = new Set(Array.isArray(declarations) ? declarations.filter(isObject).map(rule => rule["id"]) : []);
    const expression = expressionCheck(s, (value, pointer) => {
        s.id(value, pointer);
        if (!codeIds.has(value ?? null)) s.fail(pointer, `Unknown codeSupport rule ${String(value)}`);
    });
    const texts = s.list(s.text);
    const patterns: Check = (value, pointer) => {
        if (!Array.isArray(value)) return s.fail(pointer, "Expected an array of string patterns");
        value.forEach((pattern, index) => {
            if (typeof pattern !== "string") s.fail(`${pointer}/${index}`, "Expected an array of string patterns");
        });
    };
    const query = s.shape({ kinds: texts, layer: s.text, where: expression });
    const selection = { files: texts, records: s.text, idField: s.text, nameField: s.text, kindField: s.text, namespaceFrom: s.text, layer: s.text, references: s.boolean };
    const cases = s.list(s.shape({ when: expression, value: expression }, ["when", "value"]));
    const facets = s.keyed(s.shape({ id: s.id, key: s.text, kinds: texts, layer: s.text, value: expression, cases, default: expression }, ["id", "key"]));
    const selector: Check = (value, pointer) => {
        const kind = s.record(value, pointer)["kind"];
        if (kind === "switch-case") s.shape({ kind: s.text, within: s.id, expression: s.id }, ["within", "expression"])(value, pointer);
        else if (kind === "call-argument") s.shape({ kind: s.text, within: s.id, callee: s.id, argumentIndex: s.number }, ["within", "callee", "argumentIndex"])(value, pointer);
        else s.fail(`${pointer}/kind`, "Unknown code selector kind");
    };
    const gate = s.shape({ metric: s.id, comparator: s.choice(["eq", "ne", "gt", "gte", "lt", "lte"]), threshold: s.number }, ["metric", "comparator", "threshold"]);
    const edges: Check = (value, pointer) => {
        s.shape({ id: s.id, source: query, target: expression, targetKind: s.id, targetField: s.path, targetQuery: query, label: s.text, direction: s.choice(["forward", "reverse", "undirected"]), display: s.text, matrix: s.shape({ ids: expression, cells: expression, empty: s.payload }, ["ids", "cells"]) }, ["id"])(value, pointer);
        const rule = s.record(value, pointer);
        if (rule["matrix"] !== undefined && rule["target"] !== undefined) s.fail(`${pointer}/target`, "Choose target or matrix, not both");
        if (rule["matrix"] === undefined && rule["target"] === undefined) s.fail(`${pointer}/target`, "Expected target or matrix");
    };
    const view: Check = (value, pointer) => {
        const rule = s.record(value, pointer);
        const common = { id: s.id, type: s.choice(["matrix", "distribution", "cycle", "table", "gallery", "status", "graph"]), label: s.text, description: s.text, query };
        switch (rule["type"]) {
            case "graph": case "cycle": s.shape({ ...common, edgeKinds: texts }, ["id", "label"])(value, pointer); break;
            case "gallery": case "status": case "table": s.shape({ ...common, ...(rule["type"] === "table" ? {} : { edgeKinds: texts }), columns: s.keyed(s.shape({ id: s.id, label: s.text, value: expression, role: s.choice(["summary", "badge", "status"]) }, ["id", "label", "value"])) }, ["id", "label", "columns"])(value, pointer); break;
            case "distribution": s.shape({ ...common, groupBy: expression }, ["id", "label", "groupBy"])(value, pointer); break;
            case "matrix":
                if (rule["edgeKinds"] === undefined) s.shape({ ...common, cellDisplay: s.choice(["count", "label"]), row: expression, column: expression }, ["id", "label", "row", "column"])(value, pointer);
                else s.shape({ ...common, cellDisplay: s.choice(["count", "label"]), edgeKinds: texts }, ["id", "label"])(value, pointer);
                break;
            default: s.fail(`${pointer}/type`, "Invalid view type");
        }
    };
    const loopGroup = s.shape({ title: s.text, description: s.text, kinds: texts }, ["title", "kinds"]);
    const loop = s.shape({
        defaultStage: s.text, subtitle: s.text,
        title: s.text, lead: s.text, center: s.shape({ title: s.text, description: s.text }, ["title", "description"]), statusFacet: s.text, statusLabels: s.shape({ present: s.text, absent: s.text, unknown: s.text }), catalogKinds: texts, summaryFields: texts,
        kindStyles: s.entries(s.shape({ shape: s.choice(["diamond", "square", "circle", "pill", "star", "triangle", "flag", "target", "hexagon", "house"]), color: s.choice(["blue", "green", "amber", "red", "purple", "gray", "teal"]) })),
        stages: s.list(s.shape({ id: s.id, title: s.text, summary: s.text, unit: s.text, kinds: texts, systemIds: texts, groupBy: s.text }, ["id", "title", "kinds"])),
        flows: s.list(s.shape({ source: s.id, target: s.id, label: s.text, tone: s.choice(["normal", "warning"]), auxiliary: s.boolean }, ["source", "target", "label"])),
        strips: s.list(loopGroup), places: loopGroup,
        relationGroups: s.list(s.shape({ label: s.text, side: s.choice(["left", "right"]), kinds: texts, steps: s.list(s.shape({ edgeKinds: texts, direction: s.choice(["in", "out"]) }, ["edgeKinds", "direction"])) }, ["label", "side", "steps"]))
    });
    const mediaReference: Check = (value, pointer) => { if (typeof value === "string") s.text(value, pointer); else s.shape({ path: s.text, alt: s.text, frame: s.shape({ x: s.number, y: s.number, width: s.number, height: s.number }, ["x", "y", "width", "height"]) }, ["path"])(value, pointer); };
    const presentationKind = s.shape({ id: s.id, label: s.text, columns: texts, hidden: s.boolean }, ["id"]);
    const layer: Check = (value, pointer) => {
        if (Array.isArray(value)) s.keyed(s.shape({ id: s.id, label: s.text }, ["id"]))(value, pointer);
        else s.entries(s.shape({ label: s.text }))(value, pointer);
    };
    s.shape({
        schemaVersion: s.choice([1]), name: s.text, include: patterns, exclude: patterns,
        kinds: s.keyed(s.shape({ id: s.id, label: s.text, ...selection, selections: s.list(s.shape(selection, ["files"])), columns: texts, hidden: s.boolean }, ["id", "label", "files"])),
        synthetics: s.keyed(s.shape({ id: s.id, kind: s.id, name: s.text, attributes: s.mapping }, ["id", "kind", "name"])),
        derived: s.list(s.shape({ id: s.id, scope: s.choice(["graph", "node"]), kinds: texts, layer: s.text, value: expression }, ["id", "scope", "value"])),
        codeLinks: s.list(s.shape({ id: s.id, query, values: expression, language: s.id, files: texts, selectors: s.list(selector) }, ["id", "values", "language", "files", "selectors"])),
        facets, edges: s.keyed(edges), views: s.keyed(view),
        findings: s.keyed(s.shape({ id: s.id, query, severity: s.choice(["info", "warning", "error"]), basis: s.choice(["computed", "authored-interpretation", "source-support"]), metrics: s.entries(expression), template: s.text, gate, intent: expression, implementation: expression }, ["id", "metrics", "template"])),
        presentation: s.shape({ loop, media: s.shape({ field: s.text, nodes: s.entries(mediaReference) }), pictureMap: s.shape({ hubKinds: texts, membershipEdgeKinds: texts, influenceEdgeKinds: texts, primaryFacet: s.text, statusFacet: s.text, summaryFields: texts, hubOrder: texts, statusLabels: s.shape({ present: s.text, absent: s.text, unknown: s.text }) }, ["hubKinds", "membershipEdgeKinds", "influenceEdgeKinds"]), home: s.shape({ viewIds: texts, findings: s.boolean, inventory: s.boolean, distributions: s.boolean }, ["viewIds"]), detail: s.shape({ summaryFields: s.list(s.shape({ label: s.text, path: texts }, ["label", "path"])), relationships: s.list(s.shape({ label: s.text, edgeKinds: texts, direction: s.choice(["incoming", "outgoing", "both"]) }, ["label", "edgeKinds", "direction"])), rawAttributes: s.choice(["collapsed", "expanded"]) }), name: s.text, description: s.text, defaultLayer: s.text, layers: layer, kinds: s.keyed(presentationKind), facets: s.entries(s.shape({ label: s.text, values: s.entries(s.text) })) }),
    }, ["schemaVersion", "name", "kinds"])(definition.node.attributes, "");
}
