import type { RepositoryReader } from './types.mjs';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseLens } from '../dist/index.js';
import type { Graph } from '../dist/core/model.js';
import { InterpretationError, interpretationStatus, interpretationTargets, parseInterpretation, type VisibleInterpretation } from '../dist/interpretation/model.js';
import { interpretationDirectory } from './interpretation-paths.mjs';
import { regular, existingText } from './init-files.mjs';
import { atomic, digest } from './storage.mjs';
import { workingRepository } from './repository.mjs';

function noteDirectory(root: string): string {
    const directory = join(interpretationDirectory(root), 'notes'); regular(directory, true); return directory;
}
export function readInterpretations(root: string, graph: Graph, historical?: RepositoryReader): readonly VisibleInterpretation[] {
    const directory = historical ? '' : noteDirectory(root);
    if (!historical && !regular(directory, true)) return [];
    const filenames = historical ? historical.paths.filter(path => /^\.lattice\/notes\/[^/]+\.json$/u.test(path)).map(path => path.slice('.lattice/notes/'.length)) : readdirSync(directory).filter(file => file.endsWith('.json'));
    const targets = interpretationTargets(graph);
    const evidenceUrls = new Map(targets.flatMap(target => target.sources).filter(source => source.url).map(source => [source.path, source.url]));
    return filenames.sort().map(file => {
        const path = join(directory, file);
        if (!historical) regular(path);
        const text = historical ? historical.readText(`.lattice/notes/${file}`) : readFileSync(path, 'utf8');
        if (text === undefined) throw new InterpretationError('Historical interpretation source missing');
        const note = parseInterpretation(JSON.parse(text));
        const sources = note.sources.map(source => { const url = evidenceUrls.get(source.path); return { ...source, ...(url ? { url } : {}) }; });
        return { ...note, sources, label: 'AI 요약', status: interpretationStatus(note, graph, targets), notePath: `.lattice/notes/${file}` };
    });
}
export function interpretationContext(root: string, graph: Graph, offset = 0, limit = 50) {
    const notes = new Map(readInterpretations(root, graph).map(note => [note.targetId, note]));
    const reader = workingRepository(root);
    const targets = interpretationTargets(graph);
    return { summaryLanguage: 'ko', draft: readDraftStatus(root, graph) ?? null, total: targets.length, offset, items: targets.slice(offset, offset + limit).map(target => ({ ...target, interpretation: notes.get(target.id) ?? null, sources: target.sources.map(source => ({ ...source, excerpt: reader.readText(source.path)?.split('\n').slice(Math.max(0, source.line - 1), source.line + 39).join('\n') ?? '' })) })) };
}
export function writeInterpretations(root: string, graph: Graph, inputs: readonly unknown[]): readonly VisibleInterpretation[] {
    if (!inputs.length || inputs.length > 500) throw new InterpretationError('Expected 1 to 500 interpretation records');
    const notes = inputs.map(parseInterpretation);
    if (new Set(notes.map(note => note.targetId)).size !== notes.length) throw new InterpretationError('Duplicate interpretation target');
    const targets = new Map(interpretationTargets(graph).map(target => [target.id, new Set(target.sources.map(source => source.path))]));
    const hashes = new Map(graph.inputs.map(input => [input.path, input.contentHash]));
    const sources = new Map<string, string>();
    for (const note of notes) {
        const paths = targets.get(note.targetId);
        if (!paths || paths.size !== note.sources.length || note.sources.some(source => !paths.has(source.path) || hashes.get(source.path) !== source.contentHash)) throw new InterpretationError('Sources or target changed; request fresh context before writing');
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
