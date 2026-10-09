import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Edge, NodeDraft, Source } from "../core/model.js";
import { extractJson } from "./json.js";
import { DataInputError, makeSource, pointerToken, validateSourceInput } from "./types.js";
import type { SourceInput } from "./types.js";

export const graftAdapterVersion = "wiring-v1";
export type GraftDiagnostic = { readonly code: string; readonly message: string; readonly source?: Source; };
export type GraftImport = { readonly nodes: readonly NodeDraft[]; readonly edges: readonly Edge[]; readonly diagnostics: readonly GraftDiagnostic[]; readonly coveredPaths: readonly string[]; };
type WiringNode = { readonly id: string; readonly name: string; readonly kind: string; readonly path: string; readonly line: number; readonly endLine: number; readonly signature: string | null; readonly exported: boolean; readonly origin: string; readonly hash: string; readonly source: Source; };
type WiringEdge = { readonly source: string; readonly target: string; readonly relation: string; readonly confidence: string; readonly provenance: Source; };
const kinds = ["file", "class", "function", "method", "interface", "type", "enum", "struct", "trait", "module", "constant", "variable"];
const relations = ["contains", "calls", "imports", "references", "implements", "extends"];
const confidences = ["lsp_resolved", "lsp_dispatch", "extracted", "inferred"];
function object(value: JsonValue | undefined): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value: JsonValue | undefined): value is string { return typeof value === "string" && value.length > 0 && !/[\u0000-\u001f]/u.test(value); }

export function importGraft(input: SourceInput, codeInputs: readonly SourceInput[]): GraftImport {
    const diagnostics: GraftDiagnostic[] = [];
    try {
        const record = extractJson(input)[0];
        if (!record || record.node.sources[0]?.pointer !== "") throw new DataInputError(input.path, 1, "Expected a wiring object");
        const root = record.node.attributes;
        const at = (pointer: string): Source => record.fields[pointer] ?? makeSource(input, pointer, 1);
        function fail(pointer: string, message: string): never { throw new DataInputError(input.path, at(pointer).line, message); }
        const meta = root["meta"];
        const rawNodes = root["nodes"];
        const rawEdges = root["edges"];
        if (!object(meta) || meta["version"] !== 1) fail("/meta", "Unsupported Graft wiring version (expected meta.version 1)");
        if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) fail("", "Expected wiring nodes and edges arrays");
        if (meta["nodeCount"] !== rawNodes.length || meta["edgeCount"] !== rawEdges.length) fail("/meta", "Wiring counts do not match arrays");
        const languages = meta["languages"];
        if (!Array.isArray(languages) || !languages.every(text)) fail("/meta/languages", "Expected language names");
        const scopes = meta["scopes"];
        if (scopes !== undefined && (!Array.isArray(scopes) || !scopes.every(scope => object(scope) && typeof scope["prefix"] === "string" && typeof scope["label"] === "string" && Array.isArray(scope["markers"]) && scope["markers"].every(text)))) fail("/meta/scopes", "Invalid wiring scopes");
        const nodes: WiringNode[] = [];
        const ids = new Set<string>();
        const files = new Map<string, WiringNode>();
        for (const [index, raw] of rawNodes.entries()) {
            const pointer = `/nodes/${index}`;
            if (!object(raw)) fail(pointer, "Expected a wiring node");
            const id = raw["id"], name = raw["name"], kind = raw["kind"], path = raw["path"], span = raw["span"];
            const signature = raw["signature"], exported = raw["exported"], origin = raw["origin"], hash = raw["body_hash"];
            if (!text(id) || !text(name) || !text(kind) || !kinds.includes(kind) || !text(path) || typeof span !== "string" || !(signature === null || typeof signature === "string") || typeof exported !== "boolean" || !text(origin) || !["ast", "generic"].includes(origin) || typeof hash !== "string") fail(pointer, "Invalid wiring node fields");
            validateSourceInput({ path, text: "", contentHash: hash });
            const match = /^L([1-9]\d*)-L([1-9]\d*)$/u.exec(span);
            const line = Number(match?.[1]), endLine = Number(match?.[2]);
            if (!Number.isSafeInteger(line) || !Number.isSafeInteger(endLine) || endLine < line) fail(pointer, "Invalid wiring source span");
            if (ids.has(id)) fail(pointer, "Duplicate wiring node ID");
            ids.add(id);
            const node = { id, name, kind, path, line, endLine, signature, exported, origin, hash, source: at(pointer) };
            nodes.push(node);
            if (kind === "file") {
                if (id !== path || line !== 1) fail(pointer, "Invalid full-file node identity or span");
                if (files.has(path)) fail(pointer, "Duplicate wiring file path");
                files.set(path, node);
            }
        }
        const edges: WiringEdge[] = [];
        for (const [index, raw] of rawEdges.entries()) {
            const pointer = `/edges/${index}`;
            if (!object(raw)) fail(pointer, "Expected a wiring edge");
            const source = raw["source"], target = raw["target"], relation = raw["relation"], confidence = raw["confidence"];
            if (!text(source) || !text(target) || !text(relation) || !relations.includes(relation) || !text(confidence) || !confidences.includes(confidence)) fail(pointer, "Invalid wiring edge fields");
            if (!ids.has(source) || (!ids.has(target) && ["calls", "contains"].includes(relation))) fail(pointer, "Missing required wiring edge endpoint");
            edges.push({ source, target, relation, confidence, provenance: at(pointer) });
        }
        const current = new Map(codeInputs.map(code => [code.path, code]));
        const coveredPaths: string[] = [];
        for (const code of codeInputs) {
            const file = files.get(code.path);
            if (file?.hash === code.contentHash) coveredPaths.push(code.path);
            else diagnostics.push({ code: "graft-stale", message: `No current full-file hash for ${code.path}; using standalone extraction`, ...(file ? { source: file.source } : {}) });
        }
        const covered = new Set(coveredPaths);
        const lineCounts = new Map(codeInputs.map(code => [code.path, code.text.split(/\r\n|\r|\n/u).length]));
        const imported: NodeDraft[] = [];
        const endpoints = new Map<string, { readonly id: string; readonly source: Source; }>();
        for (const node of nodes) {
            const code = current.get(node.path);
            if (!code || !covered.has(node.path)) continue;
            if (node.endLine > (lineCounts.get(node.path) ?? 0)) fail(node.source.pointer, "Wiring span exceeds current source length");
            const source = makeSource(code, node.kind === "file" ? "" : `/graft/${pointerToken(node.id)}`, node.line, node.endLine);
            const id = node.kind === "file" ? `module:${node.path}` : `graft:${node.id}`;
            endpoints.set(node.id, { id, source });
            if (node.kind !== "file") imported.push({ id, name: node.name, kind: node.kind, attributes: { signature: node.signature, exported: node.exported, origin: node.origin, extraction: "graft", evidence: "static" }, sources: [source, node.source] });
        }
        const importedEdges = new Map<string, Edge>();
        for (const edge of edges) {
            const source = endpoints.get(edge.source), target = endpoints.get(edge.target);
            if (!ids.has(edge.target)) {
                if (source) diagnostics.push({ code: "graft-unresolved", message: `Unresolved ${edge.relation} target ${edge.target}`, source: edge.provenance });
                continue;
            }
            if (!source || !target) continue;
            const id = `graft-edge:${JSON.stringify([source.id, target.id, edge.relation, edge.confidence])}`;
            importedEdges.set(id, { id, source: source.id, target: target.id, kind: edge.relation, directed: true, field: "", sources: [source.source, edge.provenance], attributes: { confidence: edge.confidence, extraction: "graft", evidence: "definition" } });
        }
        return { nodes: imported, edges: [...importedEdges.values()], diagnostics, coveredPaths: [...new Set(coveredPaths)].sort() };
    } catch (error) {
        if (!(error instanceof DataInputError)) throw error;
        return { nodes: [], edges: [], coveredPaths: [], diagnostics: [{ code: "graft-invalid", message: error.message, source: makeSource(input, "", error.path === input.path ? error.line : 1) }] };
    }
}
