import type { Options, RepositoryReader, SelectedInput } from './types.mjs';
import type { Lens, SourceInput } from '../dist/index.js';
import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { canonicalJson } from '../dist/index.js';
import { createGlobMatcher, parseLens } from '../dist/lens/index.js';
import { inside, inInputScope, selectedInputs } from './inputs.mjs';
import { workingRepository, workingRepositoryAsync } from './repository.mjs';
import { digest } from './storage.mjs';
import { observeGraft } from './graft.mjs';

type SelectionPlan = { readonly lensInput: SourceInput | undefined; readonly lens: Lens | undefined; readonly paths: readonly string[]; readonly selected: ReturnType<typeof selectedInputs>; readonly codePaths: readonly string[]; };
// Reuse derived parsing/selection only; source contents are still read and hashed on every observation.
const plans = new WeakMap<Options, SelectionPlan>();
const samePaths = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((path, index) => path === right[index]);

function observeInputs(options: Options, repository: RepositoryReader, historical?: RepositoryReader) {
    const { root } = options;
    const graft = observeGraft(repository);
    const names = ['.lattice/lens.yaml', '.lattice/lens.yml', '.lattice/lens.json'];
    const select = (paths: readonly string[]) => {
        const candidates = names.filter(path => paths.includes(path));
        if (candidates.length > 1) throw new Error('Multiple default lenses found; choose one with --lens');
        return candidates[0];
    };
    const historicalDefault = historical && options.lens === undefined ? select(repository.paths) : undefined;
    const currentDefault = options.lens === undefined && !historicalDefault ? select(names.filter(path => existsSync(resolve(root, path)))) : undefined;
    const lensPath = resolve(root, options.lens ?? historicalDefault ?? currentDefault ?? '.lattice/lens.yaml');
    const lensRelative = inside(root, lensPath) ? relative(root, lensPath).split(sep).join('/') : `.lattice/${basename(lensPath)}`;
    const historicalText = historical && inside(root, lensPath) ? historical.readText(lensRelative) : undefined;
    const currentText = historicalText === undefined && (options.lens !== undefined || existsSync(lensPath)) ? readFileSync(lensPath, 'utf8') : undefined;
    const lensText = historicalText ?? currentText;
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
    repository.prepare?.([...plan.selected.map(selection => selection.path), ...plan.codePaths]);
    const selected: SelectedInput[] = [];
    const contents = new Map<string, SourceInput | undefined>();
    const readInput = (path: string) => {
        if (!contents.has(path)) {
            const text = repository.readText(path);
            contents.set(path, text === undefined ? undefined : { path, text, contentHash: digest(text) });
        }
        return contents.get(path);
    };
    for (const selection of plan.selected) {
        const input = readInput(selection.path);
        if (input) selected.push({ ...selection, input });
    }
    const codeInputs: SourceInput[] = [];
    for (const path of plan.codePaths) {
        const input = readInput(path);
        if (input) codeInputs.push(input);
    }
    const fingerprint = digest(canonicalJson({ repository: { name: repository.name, remoteUrl: repository.remoteUrl ?? null, commit: repository.commit ?? null, dirty: repository.dirty }, lens: lensInput ?? null, inputs: selected.map(({ input }) => ({ path: input.path, contentHash: input.contentHash })), ...(lens?.codeLinks.length ? { codeInputs: codeInputs.map(({ path, contentHash }) => ({ path, contentHash })) } : {}), ...(graft ? { graft: graft.input ? { path: graft.input.path, contentHash: graft.input.contentHash } : graft.diagnostic } : {}) }));
    return { repository, lens, lensInput, coverage, selected, codeInputs, fingerprint, graft };
}

function verifyObservation(before: RepositoryReader, after: RepositoryReader) {
    if (before.commit !== after.commit || before.dirty !== after.dirty || before.remoteUrl !== after.remoteUrl || !samePaths(before.paths, after.paths)) throw new Error('Repository changed while reading inputs; retry the build');
}
export function observeRepository(options: Options, historical?: RepositoryReader) {
    const repository = historical ?? workingRepository(options.root, options.cacheDir);
    const observed = observeInputs(options, repository, historical);
    if (!historical) verifyObservation(repository, workingRepository(options.root, options.cacheDir));
    return observed;
}
export async function observeRepositoryAsync(options: Options) {
    const repository = await workingRepositoryAsync(options.root, options.cacheDir);
    const observed = observeInputs(options, repository);
    verifyObservation(repository, await workingRepositoryAsync(options.root, options.cacheDir));
    return observed;
}
