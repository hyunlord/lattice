import type { Edge, NodeDraft } from "../core/model.js";
import type { CodeModule } from "./code.js";

/** Convert cached lexical declarations into generic definition and containment evidence. */
export function codeStructure(modules: readonly CodeModule[]): { readonly nodes: readonly NodeDraft[]; readonly edges: readonly Edge[]; } {
    const nodes: NodeDraft[] = [], edges: Edge[] = [];
    for (const module of modules) {
        const source = module.node.sources[0], definitions = module.node.attributes["definitions"];
        if (!source || !Array.isArray(definitions)) continue;
        for (const [index, value] of definitions.entries()) {
            if (!value || typeof value !== "object" || Array.isArray(value)) continue;
            const name = value["name"], kind = value["kind"], line = value["line"], endLine = value["endLine"];
            if (typeof name !== "string" || typeof kind !== "string" || typeof line !== "number" || typeof endLine !== "number") continue;
            const id = `definition:${source.path}:${kind}:${name}:${line}:${index}`;
            const provenance = { ...source, pointer: `/definitions/${index}`, line, endLine, ...(source.url ? { url: source.url.replace(/#L\d+(?:-L\d+)?$/u, `#L${line}`) } : {}) };
            nodes.push({ id, name, kind, attributes: { language: module.language, module: module.node.id, evidence: "static-declaration", ...(module.node.attributes["package"] ? { package: module.node.attributes["package"] } : {}) }, sources: [provenance] });
            edges.push({ id: `contains:${module.node.id}:${id}`, kind: "contains", source: module.node.id, target: id, directed: true, field: provenance.pointer, attributes: { evidence: "static-declaration" }, sources: [provenance] });
        }
    }
    return { nodes, edges };
}
