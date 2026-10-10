import { canonicalJson } from "./canonical.js";
import type { JsonObject } from "./canonical.js";
import type { Digest, Edge, Finding, NodeDraft, Source } from "./model.js";

export type AutomaticDiagnostic = {
    readonly code: string;
    readonly source?: Source;
    readonly value?: string;
    readonly target?: string;
    readonly specifier?: string;
    readonly message?: string;
};
type Layer = string | null;
type OwnedDiagnostic = { readonly diagnostic: AutomaticDiagnostic; readonly owners: readonly NodeDraft[]; };
const brokenCodes = new Set(["unresolved-reference", "ambiguous-reference", "broken-link", "invalid-link", "unresolved-local-module", "ambiguous-module"]);
const structuralKinds = new Set(["file", "document", "module"]);
const scope = "Within one layer; unique incident edge IDs; self-loops count once; cross-layer edges excluded.";
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const layerOf = (node: NodeDraft): Layer => typeof node.attributes["layer"] === "string" ? node.attributes["layer"] : null;

function uniqueSources(sources: readonly Source[]): Source[] {
    return [...new Map(sources.map(source => [canonicalJson(source), source])).entries()]
        .sort(([left], [right]) => compare(left, right)).map(([, source]) => source);
}

type SourceOwners = { pointers: Map<string, NodeDraft[]>; spans: { node: NodeDraft; source: Source; }[]; structural: NodeDraft[]; };
function indexOwners(nodes: readonly NodeDraft[]): Map<string, SourceOwners> {
    const paths = new Map<string, SourceOwners>();
    for (const node of nodes) for (const source of node.sources) {
        let owners = paths.get(source.path);
        if (!owners) { owners = { pointers: new Map(), spans: [], structural: [] }; paths.set(source.path, owners); }
        const pointer = source.pointer;
        if (pointer !== "") {
            const group = owners.pointers.get(pointer) ?? [];
            group.push(node);
            owners.pointers.set(pointer, group);
        } else if (structuralKinds.has(node.kind)) owners.structural.push(node);
        else owners.spans.push({ node, source });
    }
    return paths;
}
function ownersOf(source: Source, paths: ReadonlyMap<string, SourceOwners>): readonly NodeDraft[] {
    const owners = paths.get(source.path);
    if (!owners) return [];
    for (let pointer = source.pointer; pointer !== ""; pointer = pointer.slice(0, Math.max(0, pointer.lastIndexOf("/")))) {
        const matches = owners.pointers.get(pointer);
        if (matches) return matches;
    }
    const spans = owners.spans.filter(item => item.source.line <= source.line && (item.source.endLine ?? item.source.line) >= (source.endLine ?? source.line));
    if (spans.length) {
        const length = Math.min(...spans.map(item => (item.source.endLine ?? item.source.line) - item.source.line));
        return spans.filter(item => (item.source.endLine ?? item.source.line) - item.source.line === length).map(item => item.node);
    }
    return owners.structural;
}

function finding(rule: string, layer: Layer, targets: readonly string[], metrics: JsonObject, message: string, sources: readonly Source[], digest: Digest): Finding {
    return {
        id: `automatic:${rule}:${digest(canonicalJson(layer))}`,
        ruleId: `auto:${rule}`,
        severity: rule === "broken-references" ? "warning" : "info",
        targetIds: targets,
        metrics: { ...metrics, layer },
        message,
        basis: "computed",
        sources: uniqueSources(sources),
    };
}

/** Materialize domain-neutral findings. Unowned or sourceless diagnostics remain in the caller's diagnostic stream, not an invented layer. */
export function automaticFindings(nodes: readonly NodeDraft[], edges: readonly Edge[], diagnostics: readonly AutomaticDiagnostic[], digest: Digest): Finding[] {
    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const layers = new Map<Layer, NodeDraft[]>();
    const incident = new Map<string, Set<string>>();
    for (const node of nodes) {
        const layer = layerOf(node);
        const group = layers.get(layer) ?? [];
        group.push(node);
        layers.set(layer, group);
        incident.set(node.id, new Set());
    }
    for (const edge of edges) {
        const from = nodeMap.get(edge.source);
        const to = nodeMap.get(edge.target);
        if (!from || !to || layerOf(from) !== layerOf(to)) continue;
        incident.get(from.id)?.add(edge.id);
        incident.get(to.id)?.add(edge.id);
    }
    const owned: OwnedDiagnostic[] = [];
    const sourceOwners = indexOwners(nodes);
    const uniqueDiagnostics = new Map(diagnostics.filter(item => brokenCodes.has(item.code)).map(item => [canonicalJson(item), item]));
    for (const [, diagnostic] of [...uniqueDiagnostics].sort(([left], [right]) => compare(left, right))) {
        if (diagnostic.source) owned.push({ diagnostic, owners: ownersOf(diagnostic.source, sourceOwners) });
    }
    const results: Finding[] = [];
    for (const [layer, group] of [...layers].sort(([left], [right]) => compare(canonicalJson(left), canonicalJson(right)))) {
        const sorted = group.toSorted((left, right) => compare(left.id, right.id));
        const isolated = sorted.filter(node => !incident.get(node.id)?.size);
        if (isolated.length) results.push(finding("isolated-nodes", layer, isolated.map(node => node.id), { count: isolated.length, scope }, `${isolated.length} isolated nodes within this layer.`, isolated.flatMap(node => node.sources), digest));
        const ranked = sorted.map(node => ({ nodeId: node.id, degree: incident.get(node.id)?.size ?? 0 }))
            .filter(item => item.degree > 0).sort((left, right) => right.degree - left.degree || compare(left.nodeId, right.nodeId));
        if (ranked.length) {
            const degrees = ranked.slice(0, 10);
            const targets = degrees.map(item => item.nodeId);
            const targetSet = new Set(targets);
            const edgeIds = [...new Set(targets.flatMap(id => [...(incident.get(id) ?? [])]))].sort(compare);
            const selectedEdges = new Set(edgeIds);
            const sources = [...sorted.filter(node => targetSet.has(node.id)).flatMap(node => node.sources), ...edges.filter(edge => selectedEdges.has(edge.id)).flatMap(edge => edge.sources)];
            results.push(finding("highest-degree-hubs", layer, targets, { count: degrees.length, numberOfHubs: ranked.length, degrees, edgeIds, scope }, `Top ${degrees.length} of ${ranked.length} connected nodes by incident edge count within this layer.`, sources, digest));
        }
        const broken = owned.filter(item => item.owners.some(node => layerOf(node) === layer));
        if (broken.length) {
            const targets = [...new Set(broken.flatMap(item => item.owners.filter(node => layerOf(node) === layer).map(node => node.id)))].sort(compare);
            const references = broken.map(({ diagnostic }) => ({ code: diagnostic.code, reference: diagnostic.value ?? diagnostic.target ?? diagnostic.specifier ?? diagnostic.message ?? "", ...(diagnostic.source ? { path: diagnostic.source.path, pointer: diagnostic.source.pointer, line: diagnostic.source.line } : {}) }));
            const sources = broken.flatMap(item => item.diagnostic.source ? [item.diagnostic.source] : []);
            results.push(finding("broken-references", layer, targets, { count: broken.length, ownerCount: targets.length, references }, `${broken.length} unresolved, ambiguous or invalid references within the selected graph in this layer. Targets may be outside extraction coverage; this does not prove a repository file is missing.`, sources, digest));
        }
    }
    return results;
}
