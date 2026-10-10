import type { Graph, Source } from '../core/model.js';

export type Interpretation = {
    readonly schemaVersion: 1;
    readonly targetId: string;
    readonly summary: string;
    readonly author: string;
    readonly sources: readonly { readonly path: string; readonly contentHash: string; readonly line: number; }[];
};
export type VisibleInterpretation = Omit<Interpretation, 'sources'> & { readonly sources: readonly (Interpretation['sources'][number] & { readonly url?: string; })[]; } & { readonly label: 'AI 요약'; readonly status: 'fresh' | 'stale'; readonly notePath: string; };
export type InterpretationTarget = { readonly id: string; readonly name: string; readonly kind: 'module' | 'cluster'; readonly sources: readonly Source[]; };
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
export function interpretationTargets(graph: Graph): readonly InterpretationTarget[] {
    const modules = graph.nodes.filter(node => node.kind === 'module');
    const targets: InterpretationTarget[] = modules.map(node => ({ id: node.id, name: node.name, kind: 'module', sources: node.sources }));
    const folders = new Map<string, Map<string, Source>>();
    for (const node of modules) for (const source of node.sources) {
        const folder = source.path.includes('/') ? source.path.slice(0, source.path.lastIndexOf('/')) : '루트';
        const sources = folders.get(folder) ?? new Map<string, Source>();
        sources.set(source.path, source); folders.set(folder, sources);
    }
    for (const [folder, sources] of folders) targets.push({ id: `folder:${folder}`, name: folder, kind: 'cluster', sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)) });
    return targets.sort((a, b) => a.id.localeCompare(b.id));
}
export function interpretationStatus(note: Interpretation, graph: Graph, targets: readonly InterpretationTarget[] = interpretationTargets(graph)): 'fresh' | 'stale' {
    const target = targets.find(entry => entry.id === note.targetId);
    const current = new Map(graph.inputs.map(input => [input.path, input.contentHash]));
    if (!target || target.sources.length !== note.sources.length) return 'stale';
    return note.sources.every(source => current.get(source.path) === source.contentHash && target.sources.some(candidate => candidate.path === source.path)) ? 'fresh' : 'stale';
}
