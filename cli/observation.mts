import { SourceObservationCache } from './source-observation-cache.mjs';
import { object } from './types.mjs';
import { mediaFingerprint } from './assets.mjs';
import { parseMediaConfig } from '../dist/query/media-model.js';
import type { Options, RepositoryReader, SelectedInput } from './types.mjs';
import type { Lens, SourceInput } from '../dist/index.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { InputDigestList, observationFingerprint } from './observation-fingerprint.mjs';
import { createGlobMatcher, parseLens } from '../dist/lens/index.js';
import { inside, inInputScope, selectedInputs } from './inputs.mjs';
import { InputSizeError, workingRepository, workingRepositoryAsync, withWorkingCache } from './repository.mjs';
import { digest } from './storage.mjs';
import { interpretationDirectory } from './interpretation-paths.mjs';
import { regular } from './init-files.mjs';
import { observeGraft } from './graft.mjs';

import type { WorkingMetadata } from './repository.mjs';

type SelectionPlan = { readonly lensInput: SourceInput | undefined; readonly lens: Lens | undefined; readonly paths: readonly string[]; readonly selected: ReturnType<typeof selectedInputs>; readonly codePaths: readonly string[]; };
// Reuse derived selection; working inputs are verified separately by the observation reader.
const plans = new WeakMap<Options, SelectionPlan>();
const selectionWrappers = new WeakMap<SelectionPlan, readonly (SelectedInput | undefined)[]>();
const fingerprintLists = new WeakMap<Options, { readonly inputs: InputDigestList; readonly code: InputDigestList; }>();
const sourceCaches = new WeakMap<Options, SourceObservationCache>();
const verifiedRepositories = new WeakMap<Options, WorkingMetadata>();
const samePaths = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((path, index) => path === right[index]);

function observeInputs(options: Options, repository: RepositoryReader, historical?: RepositoryReader) {
    const { root } = options;
    const graft = observeGraft(repository);
    const names = ['.lattice/lens.yaml', '.lattice/lens.yml', '.lattice/lens.json'];
    if (!historical) repository.observePaths?.([...(options.noLens ? [] : names.map(path => resolve(root, path))), ...['notes', 'lens.draft.yaml', 'lens.draft.sources.json'].map(path => resolve(interpretationDirectory(root), path))]);
    const select = (paths: readonly string[]) => {
        const candidates = names.filter(path => paths.includes(path));
        if (candidates.length > 1) throw new Error('Multiple default lenses found; choose one with --lens');
        return candidates[0];
    };
    const historicalDefault = !options.noLens && historical && options.lens === undefined ? select(repository.paths) : undefined;
    const currentDefault = !options.noLens && options.lens === undefined && !historicalDefault ? select(names.filter(path => existsSync(resolve(root, path)))) : undefined;
    const lensPath = resolve(root, options.lens ?? historicalDefault ?? currentDefault ?? '.lattice/lens.yaml');
    const lensRelative = inside(root, lensPath) ? relative(root, lensPath).split(sep).join('/') : `.lattice/${basename(lensPath)}`;
    const historicalText = !options.noLens && historical && inside(root, lensPath) ? historical.readText(lensRelative) : undefined;
    const currentText = !options.noLens && historicalText === undefined && (options.lens !== undefined || existsSync(lensPath)) ? (repository.readObservedText?.(lensPath) ?? readFileSync(lensPath, 'utf8')) : undefined;
    const lensText = options.noLens ? undefined : historicalText ?? currentText;
    const lensInput = lensText === undefined ? undefined : { path: lensRelative, text: lensText, contentHash: digest(lensText) };
    const previous = plans.get(options);
    const sameLens = previous?.lensInput?.path === lensInput?.path && previous?.lensInput?.text === lensInput?.text;
    const lens = sameLens ? previous?.lens : lensInput ? parseLens(lensInput) : undefined;
    const match = createGlobMatcher();
    const plan = previous && sameLens && samePaths(previous.paths, repository.paths) ? previous : {
        lensInput, lens, paths: repository.paths, selected: selectedInputs(repository.paths, lens),
        codePaths: repository.paths.filter(path => inInputScope(path, lens, match) && lens?.codeLinks.some(rule => rule.files.some(pattern => match(path, pattern)))),
    };
    plans.set(options, plan);
    const coverage = !lens ? 'no-lens' : historical ? historicalText === undefined ? 'current-lens-projection' : 'repository-lens' : inside(root, lensPath) ? 'repository-lens' : 'current-lens-projection';
    repository.prepare?.([...plan.selected.map(selection => selection.path), ...plan.codePaths], { skipOversized: !lens });
    const inputDiagnostics: { readonly code: 'oversized-input'; readonly path: string; readonly line: number; readonly bytes: number; readonly message: string; }[] = [];
    const selected: SelectedInput[] = [];
    const contents = new Map<string, SourceInput | undefined>();
    const readInput = (path: string) => {
        if (!contents.has(path)) {
            try {
                if (repository.readInput) { contents.set(path, repository.readInput(path)); return contents.get(path); }
                const text = repository.readText(path);
                contents.set(path, text === undefined ? undefined : { path, text, contentHash: digest(text) });
            } catch (error) {
                if (lens || !(error instanceof InputSizeError)) throw error;
                inputDiagnostics.push({ code: 'oversized-input', path, line: 1, bytes: error.bytes, message: `${path}: ${error.bytes} bytes exceed the 10 MiB analysis limit; source is not analyzed.` });
                contents.set(path, undefined);
            }
        }
        return contents.get(path);
    };
    const previousWrappers = selectionWrappers.get(plan);
    const wrappers: (SelectedInput | undefined)[] = [];
    for (let index = 0; index < plan.selected.length; index++) {
        const selection = plan.selected[index];
        if (!selection) continue;
        const input = readInput(selection.path);
        const previousWrapper = previousWrappers?.[index];
        const wrapper = input ? previousWrapper?.input === input ? previousWrapper : { ...selection, input } : undefined;
        wrappers[index] = wrapper;
        if (wrapper) selected.push(wrapper);
    }
    selectionWrappers.set(plan, wrappers);
    const codeInputs: SourceInput[] = [];
    for (const path of plan.codePaths) {
        const input = readInput(path);
        if (input) codeInputs.push(input);
    }
    const noteDirectory = resolve(interpretationDirectory(root), 'notes');
    if (!historical) regular(noteDirectory, true);
    const interpretationPaths = historical ? repository.paths.filter(path => path.startsWith('.lattice/notes/') && path.endsWith('.json')) : existsSync(noteDirectory) ? readdirSync(noteDirectory).filter(path => path.endsWith('.json')).map(path => `.lattice/notes/${path}`) : [];
    const interpretations = interpretationPaths.sort().map(path => {
        if (historical) { const input = readInput(path); return input ? { path, contentHash: input.contentHash } : undefined; }
        const absolute = resolve(noteDirectory, basename(path)); regular(absolute);
        return { path, contentHash: digest(repository.readObservedText?.(absolute) ?? readFileSync(absolute, 'utf8')) };
    }).filter(input => input !== undefined);
    const draftInterpretations = ['lens.draft.yaml', 'lens.draft.sources.json'].flatMap(file => {
        const path = `.lattice/${file}`;
        if (historical) { const input = readInput(path); return input ? [{ path, contentHash: input.contentHash }] : []; }
        const absolute = resolve(interpretationDirectory(root), file);
        return regular(absolute) ? [{ path, contentHash: digest(repository.readObservedText?.(absolute) ?? readFileSync(absolute, 'utf8')) }] : [];
    });
    const mediaConfig = parseMediaConfig(object(lens?.config['presentation']) ? lens.config['presentation']['media'] : undefined);
    const mediaCandidates = mediaConfig.field ? repository.paths.filter(path => /\.(png|jpe?g|webp|gif|svg|avif)$/iu.test(path)).map(path => ({ id: path, attributes: { [mediaConfig.field ?? '']: path } })) : [];
    let lists = fingerprintLists.get(options);
    if (!lists) { lists = { inputs: new InputDigestList(), code: new InputDigestList() }; fingerprintLists.set(options, lists); }
    const fingerprint = observationFingerprint({ repository: { name: repository.name, remoteUrl: repository.remoteUrl ?? null, commit: repository.commit ?? null, dirty: repository.dirty }, lens: lensInput ?? null, inputDiagnostics, interpretations, draftInterpretations, media: historical ? null : mediaFingerprint(root, mediaConfig, mediaCandidates), ...(graft ? { graft: graft.input ? { path: graft.input.path, contentHash: graft.input.contentHash } : graft.diagnostic } : {}) }, lists.inputs.encode(selected.map(({ input }) => input)), lens?.codeLinks.length ? lists.code.encode(codeInputs) : undefined);
    return { repository, lens, lensInput, coverage, selected, codeInputs, fingerprint, graft, inputDiagnostics };
}

function sameRepository(before: WorkingMetadata, after: WorkingMetadata): boolean {
    return before.commit === after.commit && before.dirty === after.dirty && before.remoteUrl === after.remoteUrl && samePaths(before.paths, after.paths);
}
function verifyObservation(before: WorkingMetadata, after: WorkingMetadata) {
    if (!sameRepository(before, after)) throw new Error('Repository changed while reading inputs; retry the build');
}
export function observeRepository(options: Options, historical?: RepositoryReader) {
    const repository = historical ?? workingRepository(options.root, options.cacheDir);
    const observed = observeInputs(options, repository, historical);
    if (!historical) verifyObservation(repository, workingRepository(options.root, options.cacheDir));
    return observed;
}
export async function observeRepositoryAsync(options: Options) {
    let base = sourceCaches.get(options);
    if (!base) { base = new SourceObservationCache(options.root); sourceCaches.set(options, base); }
    let cache = base.fork();
    const previous = verifiedRepositories.get(options);
    const pending = workingRepositoryAsync(options.root, options.cacheDir);
    let speculative: { readonly value: ReturnType<typeof observeInputs>; } | { readonly error: unknown; } | undefined;
    if (previous) {
        try { cache.prune(previous.paths); speculative = { value: observeInputs(options, withWorkingCache(previous, cache)) }; }
        catch (error) { speculative = { error }; }
    }
    const repository = await pending;
    let observed: ReturnType<typeof observeInputs>;
    if (previous && sameRepository(previous, repository) && speculative) {
        if ('error' in speculative) throw speculative.error;
        observed = speculative.value;
    } else {
        cache = base.fork(); cache.prune(repository.paths);
        observed = observeInputs(options, withWorkingCache(repository, cache));
    }
    verifyObservation(repository, await workingRepositoryAsync(options.root, options.cacheDir));
    cache.verify();
    const { name, remoteUrl, commit, dirty, paths } = repository;
    verifiedRepositories.set(options, { name, ...(remoteUrl === undefined ? {} : { remoteUrl }), ...(commit === undefined ? {} : { commit }), dirty, paths });
    return observed;
}
