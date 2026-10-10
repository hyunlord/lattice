import { object } from './types.mjs';
import type { RepositoryReader } from './types.mjs';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalJson } from '../dist/core/canonical.js';
import { parseLens } from '../dist/index.js';
import type { Graph } from '../dist/core/model.js';
import { InterpretationError, interpretationStatus, interpretationTargets, overviewInterpretationTargets, parseInterpretation, type InterpretationTarget, type VisibleInterpretation } from '../dist/interpretation/model.js';
import { interpretationDirectory } from './interpretation-paths.mjs';
import { regular, existingText } from './init-files.mjs';
import { atomic, digest } from './storage.mjs';
import { historicalRepository, workingRepository } from './repository.mjs';

function noteDirectory(root: string): string {
    const directory = join(interpretationDirectory(root), 'notes'); regular(directory, true); return directory;
}
export function readInterpretations(root: string, graph: Graph, historical?: RepositoryReader): readonly VisibleInterpretation[] {
    const directory = historical ? '' : noteDirectory(root);
    if (!historical && !regular(directory, true)) return [];
    const filenames = historical ? historical.paths.filter(path => /^\.lattice\/notes\/[^/]+\.json$/u.test(path)).map(path => path.slice('.lattice/notes/'.length)) : readdirSync(directory).filter(file => file.endsWith('.json'));
    const records = filenames.sort().map(file => {
        const path = join(directory, file);
        if (!historical) regular(path);
        const text = historical ? historical.readText(`.lattice/notes/${file}`) : readFileSync(path, 'utf8');
        if (text === undefined) throw new InterpretationError('Historical interpretation source missing');
        return { file, note: parseInterpretation(JSON.parse(text)) };
    });
    const targets = interpretationTargets(graph, records.some(({ note }) => note.targetId.startsWith('overview:')));
    const evidenceKey = (source: { readonly path: string; readonly contentHash: string; readonly line: number; }): string => canonicalJson([source.path, source.contentHash, source.line]);
    const evidence = new Map(targets.flatMap(target => target.sources).map(source => [evidenceKey(source), source]));
    const evidenceUrls = new Map([...evidence].flatMap(([key, source]) => source.url ? [[key, source.url]] : []));
    const missing = records.flatMap(({ note }) => note.sources).filter(source => evidence.has(evidenceKey(source)) && !evidenceUrls.has(evidenceKey(source)));
    if (missing.length && graph.repository.remoteUrl && graph.repository.commit) {
        const snapshot = historical ?? historicalRepository(root, graph.repository.commit);
        const paths = [...new Set(missing.map(source => source.path))];
        snapshot.prepare?.(paths);
        const hashes = new Map(paths.map(path => { const text = snapshot.readText(path); return [path, text === undefined ? undefined : digest(text)]; }));
        for (const source of missing) if (hashes.get(source.path) === source.contentHash) {
            const path = source.path.split('/').map(encodeURIComponent).join('/');
            evidenceUrls.set(evidenceKey(source), `${graph.repository.remoteUrl}/blob/${graph.repository.commit}/${path}#L${source.line}`);
        }
    }
    return records.map(({ file, note }) => {
        const sources = note.sources.map(source => { const url = evidenceUrls.get(evidenceKey(source)); return { ...source, ...(url ? { url } : {}) }; });
        return { ...note, sources, label: 'AI 요약', status: interpretationStatus(note, graph, targets), notePath: `.lattice/notes/${file}` };
    });
}
export type ContextOptions = { readonly scope?: 'all' | 'folders' | 'overview'; readonly overviewScope?: 'production' | 'all'; readonly compact?: boolean; };
const sourceSetToken = (target: InterpretationTarget): string => digest(canonicalJson({ targetId: target.id, sources: target.sources.map(({ path, contentHash, line }) => ({ path, contentHash, line })).sort((a, b) => a.path.localeCompare(b.path)) }));
export function compactInterpretation(note: VisibleInterpretation) {
    const { sources, ...metadata } = note;
    return { ...metadata, sourceCount: sources.length };
}
export function interpretationContext(root: string, graph: Graph, offset = 0, limit = 50, options: ContextOptions = {}) {
    const notes = new Map(readInterpretations(root, graph).map(note => [note.targetId, note]));
    const reader = workingRepository(root);
    const targets = options.scope === 'overview' ? overviewInterpretationTargets(graph, options.overviewScope ?? 'production') : interpretationTargets(graph).filter(target => options.scope !== 'folders' || target.kind === 'cluster');
    const present = (target: InterpretationTarget) => {
        const note = notes.get(target.id);
        if (!options.compact) return { ...target, interpretation: note ?? null, sources: target.sources.map(source => ({ ...source, excerpt: reader.readText(source.path)?.split('\n').slice(Math.max(0, source.line - 1), source.line + 39).join('\n') ?? '' })) };
        const evidence = target.sources.slice(0, 3).map(source => ({ path: source.path, line: source.line, excerpt: (reader.readText(source.path)?.split('\n').slice(Math.max(0, source.line - 1), source.line + 39).join('\n') ?? '').slice(0, 600) }));
        return { id: target.id, name: target.name, kind: target.kind, sourceCount: target.sources.length, sourceSetToken: sourceSetToken(target), samplePaths: target.sources.slice(0, 20).map(source => source.path), omittedPathCount: Math.max(0, target.sources.length - 20), evidence, interpretation: note ? compactInterpretation(note) : null };
    };
    const modules = new Map(interpretationTargets(graph).filter(target => target.kind === 'module').map(target => [target.id, target]));
    const items = targets.slice(offset, offset + limit).map(target => ({
        ...present(target),
        ...(options.scope === 'overview' && target.visibleFileIds?.length ? { visibleFiles: target.visibleFileIds.flatMap(id => { const module = modules.get(id); return module ? [present(module)] : []; }) } : {}),
    }));
    const draft = readDraftStatus(root, graph);
    return { summaryLanguage: 'ko', draft: draft ? options.compact ? { path: draft.path, label: draft.label, status: draft.status } : draft : null, total: targets.length, offset, items };
}
export function writeInterpretations(root: string, graph: Graph, inputs: readonly unknown[]): readonly VisibleInterpretation[] {
    if (!inputs.length || inputs.length > 500) throw new InterpretationError('Expected 1 to 500 interpretation records');
    const currentTargets = interpretationTargets(graph, inputs.some(input => object(input) && typeof input['targetId'] === 'string' && input['targetId'].startsWith('overview:')));
    const byId = new Map(currentTargets.map(target => [target.id, target]));
    const notes = inputs.map(input => {
        if (!object(input) || !Object.hasOwn(input, 'sourceSetToken')) return parseInterpretation(input);
        if (Object.hasOwn(input, 'sources')) throw new InterpretationError('Supply exactly one of sources or sourceSetToken');
        const target = typeof input['targetId'] === 'string' ? byId.get(input['targetId']) : undefined;
        if (!target || typeof input['sourceSetToken'] !== 'string' || input['sourceSetToken'] !== sourceSetToken(target)) throw new InterpretationError('Source-set token or target changed; request fresh context');
        return parseInterpretation({ ...input, sources: target.sources });
    });
    if (new Set(notes.map(note => note.targetId)).size !== notes.length) throw new InterpretationError('Duplicate interpretation target');
    const targets = new Map(currentTargets.map(target => [target.id, new Map(target.sources.map(source => [source.path, source.line]))]));
    const hashes = new Map(graph.inputs.map(input => [input.path, input.contentHash]));
    const sources = new Map<string, string>();
    for (const note of notes) {
        const paths = targets.get(note.targetId);
        if (!paths || paths.size !== note.sources.length || note.sources.some(source => paths.get(source.path) !== source.line || hashes.get(source.path) !== source.contentHash)) throw new InterpretationError('Sources or target changed; request fresh context before writing');
        for (const source of note.sources) sources.set(source.path, source.contentHash);
    }
    const reader = workingRepository(root);
    for (const [path, contentHash] of sources) {
        const text = reader.readText(path);
        if (text === undefined || digest(text) !== contentHash) throw new InterpretationError('Source changed after graph build; request fresh context');
    }
    const directory = noteDirectory(root);
    const records = notes.map(note => ({ note, filename: `${digest(note.targetId)}.json` }));
    for (const { filename } of records) regular(join(directory, filename));
    // Validate the whole batch first; each file is then atomic, not a multi-file transaction.
    return records.map(({ note, filename }) => {
        atomic(join(directory, filename), note);
        return { ...note, label: 'AI 요약', status: 'fresh', notePath: `.lattice/notes/${filename}` };
    });
}
export function writeInterpretation(root: string, graph: Graph, input: unknown): VisibleInterpretation {
    const [note] = writeInterpretations(root, graph, [input]);
    if (!note) throw new InterpretationError('Interpretation was not written');
    return note;
}
export function writeDraftLens(root: string, graph: Graph, text: string, expectedHash: string | undefined) {
    const directory = interpretationDirectory(root), path = join(directory, 'lens.draft.yaml');
    const previous = existingText(path, directory);
    if (previous && digest(previous) !== expectedHash) throw new InterpretationError('Draft already exists; pass its current expectedHash to replace it');
    parseLens({ path: '.lattice/lens.draft.yaml', text, contentHash: digest(text) });
    mkdirSync(directory, { recursive: true });
    writeFileSync(path, text);
    atomic(join(interpretationDirectory(root), 'lens.draft.sources.json'), { schemaVersion: 1, label: 'AI 요약', draftHash: digest(text), sources: graph.inputs.filter(input => !input.path.startsWith('.lattice/')) });
    return { path: '.lattice/lens.draft.yaml', contentHash: digest(text), active: false };
}
export function readDraftStatus(root: string, graph: Graph, historical?: RepositoryReader): { readonly path: string; readonly label: 'AI 요약'; readonly status: 'fresh' | 'stale'; readonly sources: readonly { path: string; contentHash: string; }[]; } | undefined {
    const path = '.lattice/lens.draft.yaml';
    const text = historical ? historical.readText(path) : existingText(join(interpretationDirectory(root), 'lens.draft.yaml'), interpretationDirectory(root));
    if (!text) return undefined;
    const provenance = historical ? historical.readText('.lattice/lens.draft.sources.json') : existingText(join(interpretationDirectory(root), 'lens.draft.sources.json'), interpretationDirectory(root));
    if (!provenance) return { path, label: 'AI 요약', status: 'stale', sources: [] };
    const value: unknown = JSON.parse(provenance);
    if (value === null || typeof value !== 'object' || !('sources' in value) || !('draftHash' in value)) throw new InterpretationError('Invalid draft provenance');
    if (Array.isArray(value.sources) && !value.sources.length) return { path, label: 'AI 요약', status: value.draftHash === digest(text) && !graph.inputs.some(input => !input.path.startsWith('.lattice/')) ? 'fresh' : 'stale', sources: [] };
    const parsed = parseInterpretation({ schemaVersion: 1, targetId: 'draft', summary: 'Draft lens interpretation', author: 'agent', sources: value.sources });
    const inputs = graph.inputs.filter(input => !input.path.startsWith('.lattice/'));
    const status = value.draftHash === digest(text) && parsed.sources.length === inputs.length && parsed.sources.every(source => inputs.some(input => input.path === source.path && input.contentHash === source.contentHash)) ? 'fresh' : 'stale';
    return { path, label: 'AI 요약', status, sources: parsed.sources };
}
