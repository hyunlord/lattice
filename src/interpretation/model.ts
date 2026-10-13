import { firstImpressionGroups } from '../query/first-impression-components.js';
import type { Graph, Source } from '../core/model.js';
import { overviewDependencyGroups } from '../query/structural-dependency-groups.js';
import { buildStructuralOverview } from '../query/structural-map-model.js';

export type InterpretationCitation = {
    readonly path: string; readonly contentHash: string; readonly startLine: number; readonly endLine: number;
    readonly excerpt: string; readonly nodeId?: string; readonly edgeId?: string; readonly url?: string;
};
export type InterpretationClaim = { readonly purpose?: 'component-name' | 'component-role'; readonly text: string; readonly citations: readonly InterpretationCitation[]; };
export type ClaimInterpretation = { readonly targetId: string; readonly sources: Interpretation['sources']; readonly validatedClaims: readonly InterpretationClaim[]; };
export type Interpretation = {
    readonly schemaVersion: 1;
    readonly targetId: string;
    readonly summary: string;
    readonly author: string;
    readonly claims?: readonly InterpretationClaim[];
    readonly sources: readonly { readonly path: string; readonly contentHash: string; readonly line: number; }[];
};
export type VisibleInterpretation = Omit<Interpretation, 'sources'> & { readonly sources: readonly (Interpretation['sources'][number] & { readonly url?: string; })[]; } & { readonly label: 'AI 요약'; readonly status: 'fresh' | 'stale'; readonly notePath: string; readonly validatedClaims?: readonly InterpretationClaim[]; };
export type InterpretationTarget = { readonly id: string; readonly name: string; readonly kind: 'module' | 'cluster'; readonly sources: readonly Source[]; readonly visibleFileIds?: readonly string[]; readonly group?: { readonly relation: 'folder-imports' | 'projected-folder-imports'; readonly stageIds: readonly string[]; readonly memberTargetIds: readonly string[]; readonly memberNames: readonly string[]; }; };
export class InterpretationError extends Error {
    constructor(message: string) { super(message); this.name = 'InterpretationError'; }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value: unknown, field: string, maximum: number): string {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new InterpretationError(`Invalid ${field}`);
    return value;
}
function parseCitation(value: unknown): InterpretationCitation {
    if (!object(value)) throw new InterpretationError('Invalid claim citation');
    const path = string(value['path'], 'citation path', 4096), contentHash = string(value['contentHash'], 'citation hash', 64);
    if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/u.test(contentHash)) throw new InterpretationError('Invalid citation path or hash');
    const startLine = value['startLine'], endLine = value['endLine'];
    if (typeof startLine !== 'number' || !Number.isSafeInteger(startLine) || startLine < 1 || typeof endLine !== 'number' || !Number.isSafeInteger(endLine) || endLine < startLine) throw new InterpretationError('Invalid citation range');
    return { path, contentHash, startLine, endLine, excerpt: string(value['excerpt'], 'citation excerpt', 16000), ...(value['nodeId'] === undefined ? {} : { nodeId: string(value['nodeId'], 'citation node', 4096) }), ...(value['edgeId'] === undefined ? {} : { edgeId: string(value['edgeId'], 'citation edge', 4096) }) };
}
function parseClaims(value: unknown): readonly InterpretationClaim[] {
    if (!Array.isArray(value) || value.length > 8) throw new InterpretationError('Invalid claim citations');
    return value.map((claim: unknown) => {
        if (!object(claim) || !Array.isArray(claim['citations']) || !claim['citations'].length || claim['citations'].length > 16) throw new InterpretationError('Each claim requires citations');
        const purpose = claim['purpose'];
        if (purpose !== undefined && purpose !== 'component-name' && purpose !== 'component-role') throw new InterpretationError('Invalid claim purpose');
        return { text: string(claim['text'], 'claim text', 1000), citations: claim['citations'].map(parseCitation), ...(purpose ? { purpose } : {}) };
    });
}
export function parseClaimInterpretations(value: unknown): readonly ClaimInterpretation[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry: unknown) => {
        if (!object(entry) || entry['status'] !== 'fresh' || entry['label'] !== 'AI 요약' || !Array.isArray(entry['validatedClaims'])) return [];
        try {
            const note = parseInterpretation(entry), claims = parseClaims(entry['validatedClaims']);
            const urls = new Map<string, string>();
            for (const claim of entry['validatedClaims']) {
                if (!object(claim) || !Array.isArray(claim['citations'])) continue;
                for (const citation of claim['citations']) if (object(citation) && typeof citation['url'] === 'string' && /^https?:\/\//u.test(citation['url'])) {
                    const parsed = parseCitation(citation);
                    urls.set(JSON.stringify(parsed), citation['url']);
                }
            }
            return [{ targetId: note.targetId, sources: note.sources, validatedClaims: claims.map(claim => ({ ...claim, citations: claim.citations.map(citation => { const url = urls.get(JSON.stringify(citation)); return { ...citation, ...(url ? { url } : {}) }; }) })) }];
        } catch (error) { if (!(error instanceof InterpretationError)) throw error; return []; }
    });
}
export function interpretationEvidence(source: Pick<Source, 'path' | 'contentHash' | 'line'>, text: string, maximum = 16000) {
    const lines = text.split('\n').slice(source.line - 1, source.line + 39), selected: string[] = [];
    for (const line of lines) { if ([...selected, line].join('\n').length > maximum) break; selected.push(line); }
    return { path: source.path, contentHash: source.contentHash, line: source.line, startLine: source.line, endLine: source.line + Math.max(0, selected.length - 1), excerpt: selected.join('\n') };
}
export function parseInterpretation(value: unknown): Interpretation {
    if (!object(value) || value['schemaVersion'] !== 1 || !Array.isArray(value['sources']) || !value['sources'].length || value['sources'].length > 10000) throw new InterpretationError('Invalid interpretation record');
    const sources = value['sources'].map((source: unknown) => {
        if (!object(source)) throw new InterpretationError('Invalid interpretation source');
        const path = string(source['path'], 'source path', 4096), contentHash = string(source['contentHash'], 'source hash', 64);
        if (path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..') || !/^[a-f0-9]{64}$/u.test(contentHash)) throw new InterpretationError('Invalid source path or hash');
        const line = source['line'] ?? 1;
        if (typeof line !== 'number' || !Number.isSafeInteger(line) || line < 1) throw new InterpretationError('Invalid evidence line');
        return { path, contentHash, line };
    });
    if (new Set(sources.map(source => source.path)).size !== sources.length) throw new InterpretationError('Duplicate interpretation source');
    return { schemaVersion: 1, targetId: string(value['targetId'], 'targetId', 4096), summary: string(value['summary'], 'summary (one or two sentences)', 1000), author: string(value['author'], 'AI author', 200), sources, ...(value['claims'] === undefined ? {} : { claims: parseClaims(value['claims']) }) };
}
/** Verifies source locations and exact excerpts, never semantic entailment of AI prose. */
export function validatedInterpretationClaims(note: Interpretation, graph: Graph, readText: (path: string) => string | undefined, hash: (text: string) => string, targets?: readonly InterpretationTarget[]): readonly InterpretationClaim[] {
    if (!note.claims?.length || interpretationStatus(note, graph, targets) !== 'fresh') return [];
    const texts = new Map<string, string>();
    for (const source of note.sources) {
        const text = readText(source.path);
        if (text === undefined || hash(text) !== source.contentHash) return [];
        texts.set(source.path, text);
    }
    const matches = (citation: InterpretationCitation, sources: readonly Source[]): boolean => sources.some(source => source.path === citation.path && source.contentHash === citation.contentHash && source.line <= citation.startLine && (source.endLine === undefined || source.endLine >= citation.endLine));
    return note.claims.filter(claim => claim.citations.every(citation => {
        const source = note.sources.find(entry => entry.path === citation.path && entry.contentHash === citation.contentHash);
        const text = texts.get(citation.path);
        if (!source || text === undefined) return false;
        const lines = text.split('\n');
        const supplied = interpretationEvidence(source, text);
        if (note.targetId.startsWith('component:')) {
            // Component targets bind whole member files; each requested excerpt stays bounded.
            if (citation.endLine - citation.startLine >= 40) return false;
        } else if (!supplied.excerpt || citation.startLine < supplied.startLine || citation.endLine > supplied.endLine) return false;
        if (citation.endLine > lines.length || lines.slice(citation.startLine - 1, citation.endLine).join('\n') !== citation.excerpt) return false;
        if (citation.nodeId && !matches(citation, graph.nodes.find(node => node.id === citation.nodeId)?.sources ?? [])) return false;
        if (citation.edgeId && !matches(citation, graph.edges.find(edge => edge.id === citation.edgeId)?.sources ?? [])) return false;
        return true;
    }));
}
export function interpretationTargets(graph: Graph, includeOverview = false): readonly InterpretationTarget[] {
    const modules = graph.nodes.filter(node => node.kind === 'module');
    const targets: InterpretationTarget[] = modules.map(node => ({ id: node.id, name: node.name, kind: 'module', sources: node.sources }));
    const folders = new Map<string, Map<string, Source>>();
    for (const node of modules) for (const source of node.sources) {
        const folder = source.path.includes('/') ? source.path.slice(0, source.path.lastIndexOf('/')) : '루트';
        const sources = folders.get(folder) ?? new Map<string, Source>();
        sources.set(source.path, source); folders.set(folder, sources);
    }
    for (const [folder, sources] of folders) targets.push({ id: `folder:${folder}`, name: folder, kind: 'cluster', sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)) });
    if (includeOverview) {
        targets.push(...overviewInterpretationTargets(graph));
        for (const group of firstImpressionGroups(graph.nodes, graph.edges).groups) {
            const sources = new Map(group.members.flatMap(node => node.sources.map(source => [source.path, source] as const)));
            targets.push({ id: group.id, name: group.package?.name ?? group.id, kind: 'cluster', sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)) });
        }
    }
    return targets.sort((a, b) => a.id.localeCompare(b.id));
}
/** Separate identities keep whole-tree notes distinct from production-only first-screen notes. */
export function overviewInterpretationTargets(graph: Graph, requestedScope?: 'production' | 'all'): readonly InterpretationTarget[] {
    const map = buildStructuralOverview(graph.nodes, graph.edges);
    const nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const stages = new Map(map.stages.map(stage => [stage.id, stage]));
    return (requestedScope ? [requestedScope] : ['production', 'all'] as const).flatMap(scope => {
        const roots = scope === 'all' ? map.structuralScope.allRootStageIds : map.rootStageIds;
        const folders = roots.flatMap(id => {
            const stage = stages.get(id);
            if (!stage) return [];
            const sources = new Map<string, Source>();
            for (const nodeId of stage.descendantNodeIds ?? stage.nodeIds) {
                const node = nodes.get(nodeId);
                if (node?.kind !== 'module' && node?.kind !== 'file') continue;
                for (const source of node.sources) sources.set(source.path, source);
            }
            return sources.size ? [{ id: `overview:${scope}:${id}`, name: stage.title, kind: 'cluster' as const, ...(stage.filePreviews?.length ? { visibleFileIds: stage.filePreviews.map(file => file.id) } : {}), sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)) }] : [];
        });
        const groups = overviewDependencyGroups(map, scope).flatMap(group => {
            const sources = new Map<string, Source>();
            for (const id of group.nodeIds) for (const source of nodes.get(id)?.sources ?? []) sources.set(source.path, source);
            return sources.size ? [{ id: group.id, name: '함께 연결된 폴더 묶음', kind: 'cluster' as const, sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)), group: { relation: group.folded ? 'projected-folder-imports' as const : 'folder-imports' as const, stageIds: group.stageIds, memberTargetIds: group.stageIds.map(id => `overview:${scope}:${id}`), memberNames: group.stageIds.map(id => stages.get(id)?.title ?? id) } }] : [];
        });
        // Group explanations and their member roles precede later pages without replacing either.
        return Array.from({ length: Math.ceil(roots.length / 9) }, (_, page) => {
            const pageIds = new Set(roots.slice(page * 9, page * 9 + 9));
            return [...groups.filter(group => group.group.stageIds.every(id => pageIds.has(id))), ...folders.filter(folder => pageIds.has(folder.id.slice(`overview:${scope}:`.length)))];
        }).flat();
    });
}
export function interpretationStatus(note: Interpretation, graph: Graph, targets: readonly InterpretationTarget[] = interpretationTargets(graph, note.targetId.startsWith('overview:') || note.targetId.startsWith('component:'))): 'fresh' | 'stale' {
    const target = targets.find(entry => entry.id === note.targetId);
    const current = new Map(graph.inputs.map(input => [input.path, input.contentHash]));
    if (!target || target.sources.length !== note.sources.length) return 'stale';
    return note.sources.every(source => current.get(source.path) === source.contentHash && target.sources.some(candidate => candidate.path === source.path && candidate.line === source.line)) ? 'fresh' : 'stale';
}
