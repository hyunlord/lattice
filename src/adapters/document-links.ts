import { canonicalJson } from "../core/canonical.js";
import type { Edge, NodeDraft, Source } from "../core/model.js";
import type { DocumentLink, MarkdownDocument } from "./markdown.js";
import { DataInputError } from "./types.js";

export type DocumentDiagnostic = {
    readonly code: "broken-link" | "invalid-link";
    readonly target: string;
    readonly source: Source;
};
export type LinkedDocuments = {
    readonly nodes: readonly NodeDraft[];
    readonly edges: readonly Edge[];
    readonly diagnostics: readonly DocumentDiagnostic[];
    readonly externalLinks: readonly DocumentLink[];
};
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

type Destination = { readonly path: string; readonly anchor: string; };
function destination(sourcePath: string, target: string): Destination | undefined {
    const hash = target.indexOf("#");
    const rawPath = (hash < 0 ? target : target.slice(0, hash)).split("?")[0] ?? "";
    let path: string;
    let anchor: string;
    try {
        path = decodeURIComponent(rawPath);
        anchor = decodeURIComponent(hash < 0 ? "" : target.slice(hash + 1));
    } catch (error) {
        if (error instanceof URIError) return undefined;
        throw error;
    }
    if (/[\\\u0000-\u001f]/u.test(path + anchor)) return undefined;
    if (path === "") return { path: sourcePath, anchor };
    const parts = path.startsWith("/") ? [] : sourcePath.split("/").slice(0, -1);
    for (const part of path.split("/")) {
        if (part === "" || part === ".") continue;
        if (part === "..") {
            if (parts.length === 0) return undefined;
            parts.pop();
        } else parts.push(part);
    }
    return { path: parts.join("/"), anchor };
}

export function resolveDocumentLinks(documents: readonly MarkdownDocument[], extraNodes: readonly NodeDraft[] = []): LinkedDocuments {
    const nodes = [...documents.flatMap(document => document.nodes), ...extraNodes];
    const byId = new Map<string, NodeDraft>();
    const byLocation = new Map<string, NodeDraft>();
    for (const node of nodes) {
        if (byId.has(node.id)) throw new DataInputError(node.sources[0]?.path ?? "<documents>", 1, `Duplicate node ID ${node.id}`);
        byId.set(node.id, node);
        for (const source of node.sources) {
            const anchor = node.kind === "heading" ? node.attributes["anchor"] : source.pointer === "" ? "" : undefined;
            if (typeof anchor !== "string") continue;
            const key = canonicalJson([source.path, anchor]);
            if (byLocation.has(key)) throw new DataInputError(source.path, source.line, "Ambiguous document location");
            byLocation.set(key, node);
        }
    }
    const edges: Edge[] = documents.flatMap(document => document.edges);
    const diagnostics: DocumentDiagnostic[] = [];
    const externalLinks: DocumentLink[] = [];
    for (const document of documents) {
        for (const link of document.links) {
            if (!byId.has(link.sourceId)) throw new DataInputError(link.source.path, link.source.line, "Unknown link source node");
            if (/^(?:https?:|mailto:|tel:|\/\/)/iu.test(link.target)) {
                externalLinks.push(link);
                continue;
            }
            const target = /^[a-z][a-z0-9+.-]*:/iu.test(link.target) ? undefined : destination(link.source.path, link.target);
            if (target === undefined) {
                diagnostics.push({ code: "invalid-link", target: link.target, source: link.source });
                continue;
            }
            const node = byLocation.get(canonicalJson([target.path, target.anchor]));
            if (node === undefined) diagnostics.push({ code: "broken-link", target: link.target, source: link.source });
            else edges.push({
                id: `link:${canonicalJson([link.sourceId, node.id, link.source.path, link.source.pointer])}`,
                kind: "link", source: link.sourceId, target: node.id, directed: true,
                field: link.source.pointer, sources: [link.source],
            });
        }
    }
    return {
        nodes: nodes.sort((a, b) => compare(a.id, b.id)), edges: edges.sort((a, b) => compare(a.id, b.id)),
        diagnostics: diagnostics.sort((a, b) => compare(canonicalJson(a), canonicalJson(b))),
        externalLinks: externalLinks.sort((a, b) => compare(canonicalJson(a), canonicalJson(b))),
    };
}
