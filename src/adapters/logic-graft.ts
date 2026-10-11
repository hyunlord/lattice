import type { NodeDraft, Edge, Source } from '../core/model.js';
import { canonicalJson } from '../core/canonical.js';
type Structure = { readonly nodes: readonly NodeDraft[]; readonly edges: readonly Edge[]; };
const callable = (node: NodeDraft): boolean => node.kind === 'function' || node.kind === 'method';
const location = (node: NodeDraft, source: Source): string => canonicalJson([node.name, source.path, source.line, source.contentHash]);
const semantic = (edge: Edge): string => canonicalJson([edge.kind, edge.source, edge.target, edge.directed]);
/** Only a one-to-one source identity may replace an AST callable ID with an imported identity. */
export function reconcileLogicGraft(logic: Structure, graft: Structure): { readonly logic: Structure; readonly graft: Structure; } {
    const imported = new Map<string, NodeDraft[]>();
    for (const node of graft.nodes.filter(callable)) for (const source of node.sources) {
        const key = location(node, source), candidates = imported.get(key) ?? [];
        if (!candidates.some(candidate => candidate.id === node.id)) candidates.push(node);
        imported.set(key, candidates);
    }
    const proposals = new Map<string, string>(), claimants = new Map<string, string[]>();
    for (const node of logic.nodes.filter(callable)) {
        const matches = new Map(node.sources.flatMap(source => (imported.get(location(node, source)) ?? []).map(candidate => [candidate.id, candidate])));
        if (matches.size !== 1) continue;
        const target = matches.keys().next().value;
        if (!target) continue;
        proposals.set(node.id, target);
        const claims = claimants.get(target) ?? []; claims.push(node.id); claimants.set(target, claims);
    }
    const aliases = new Map([...proposals].filter(([, target]) => claimants.get(target)?.length === 1));
    const astByImported = new Map(logic.nodes.flatMap(node => { const id = aliases.get(node.id); return id ? [[id, node] as const] : []; }));
    const rebaseNode = (node: NodeDraft): NodeDraft => {
        const parent = node.attributes['lexicalParent'];
        return typeof parent === 'string' && aliases.has(parent) ? { ...node, attributes: { ...node.attributes, lexicalParent: aliases.get(parent) ?? parent } } : node;
    };
    const graftNodes = graft.nodes.map(node => {
        const ast = astByImported.get(node.id);
        if (!ast) return node;
        const sources = [...new Map([...node.sources, ...ast.sources].map(source => [canonicalJson(source), source])).values()];
        return rebaseNode({ ...node, kind: ast.kind, attributes: { ...node.attributes, ...ast.attributes, graftMetadata: node.attributes, graftKind: node.kind }, sources });
    });
    const logicEdges = logic.edges.map(edge => ({ ...edge, source: aliases.get(edge.source) ?? edge.source, target: aliases.get(edge.target) ?? edge.target }));
    const measured = new Set(logicEdges.filter(edge => edge.kind === 'contains' || edge.kind === 'calls' && edge.attributes?.['resolution'] === 'exact').map(semantic));
    const graftEdges = graft.edges.filter(edge => !measured.has(semantic(edge)));
    return { logic: { nodes: logic.nodes.filter(node => !aliases.has(node.id)).map(rebaseNode), edges: logicEdges }, graft: { nodes: graftNodes, edges: graftEdges } };
}
