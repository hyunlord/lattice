import type { Graph, Source } from '../core/model.js';
import { overviewDependencyGroups } from '../query/structural-dependency-groups.js';
import { buildStructuralOverview } from '../query/structural-map-model.js';

export type Interpretation = {
    readonly schemaVersion: 1;
    readonly targetId: string;
    readonly summary: string;
    readonly author: string;
    readonly sources: readonly { readonly path: string; readonly contentHash: string; readonly line: number; }[];
};
export type VisibleInterpretation = Omit<Interpretation, 'sources'> & { readonly sources: readonly (Interpretation['sources'][number] & { readonly url?: string; })[]; } & { readonly label: 'AI 요약'; readonly status: 'fresh' | 'stale'; readonly notePath: string; };
export type InterpretationTarget = { readonly id: string; readonly name: string; readonly kind: 'module' | 'cluster'; readonly sources: readonly Source[]; readonly visibleFileIds?: readonly string[]; readonly group?: { readonly relation: 'folder-imports' | 'projected-folder-imports'; readonly stageIds: readonly string[]; readonly memberTargetIds: readonly string[]; readonly memberNames: readonly string[]; }; };
export class InterpretationError extends Error {
    constructor(message: string) { super(message); this.name = 'InterpretationError'; }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function string(value: unknown, field: string, maximum: number): string {
    if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new InterpretationError(`Invalid ${field}`);
    return value;
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
    return { schemaVersion: 1, targetId: string(value['targetId'], 'targetId', 4096), summary: string(value['summary'], 'summary (one or two sentences)', 1000), author: string(value['author'], 'AI author', 200), sources };
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
    if (includeOverview) targets.push(...overviewInterpretationTargets(graph));
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
export function interpretationStatus(note: Interpretation, graph: Graph, targets: readonly InterpretationTarget[] = interpretationTargets(graph, note.targetId.startsWith('overview:'))): 'fresh' | 'stale' {
    const target = targets.find(entry => entry.id === note.targetId);
    const current = new Map(graph.inputs.map(input => [input.path, input.contentHash]));
    if (!target || target.sources.length !== note.sources.length) return 'stale';
    return note.sources.every(source => current.get(source.path) === source.contentHash && target.sources.some(candidate => candidate.path === source.path && candidate.line === source.line)) ? 'fresh' : 'stale';
}
