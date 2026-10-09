import { existsSync, readFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { canonicalJson } from '../dist/index.js';
import { matchesGlob, parseLens } from '../dist/lens/index.js';
import { inside, inInputScope, selectedInputs } from './inputs.mjs';
import { workingRepository } from './repository.mjs';
import { digest } from './storage.mjs';
import { observeGraft } from './graft.mjs';

export function observeRepository(options, historical) {
  const { root } = options;
  const repository = historical ?? workingRepository(root, options.cacheDir);
  const graft = observeGraft(repository);
  const names = ['.lattice/lens.yaml', '.lattice/lens.yml', '.lattice/lens.json'];
  const select = paths => {
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
  const lens = lensInput ? parseLens(lensInput) : undefined;
  const coverage = !lens ? 'no-lens' : historical ? historicalText === undefined ? 'current-lens-projection' : 'repository-lens' : inside(root, lensPath) ? 'repository-lens' : 'current-lens-projection';
  const selected = [];
  const contents = new Map();
  for (const selection of selectedInputs(repository.paths, lens)) {
    if (!contents.has(selection.path)) contents.set(selection.path, repository.readText(selection.path));
    const text = contents.get(selection.path);
    if (text !== undefined) selected.push({ ...selection, input: { path: selection.path, text, contentHash: digest(text) } });
  }
  const codeInputs = [];
  for (const path of repository.paths.filter(path => inInputScope(path, lens) && lens?.codeLinks.some(rule => rule.files.some(pattern => matchesGlob(path, pattern))))) {
    if (!contents.has(path)) contents.set(path, repository.readText(path));
    const text = contents.get(path);
    if (text !== undefined) codeInputs.push({ path, text, contentHash: digest(text) });
  }
  if (!historical) {
    const after = workingRepository(root, options.cacheDir);
    if (repository.commit !== after.commit || repository.dirty !== after.dirty || repository.remoteUrl !== after.remoteUrl || canonicalJson(repository.paths) !== canonicalJson(after.paths)) throw new Error('Repository changed while reading inputs; retry the build');
  }
  const fingerprint = digest(canonicalJson({ repository: { name: repository.name, remoteUrl: repository.remoteUrl ?? null, commit: repository.commit ?? null, dirty: repository.dirty }, lens: lensInput ?? null, inputs: selected.map(({ input }) => ({ path: input.path, contentHash: input.contentHash })), ...(lens?.codeLinks.length ? { codeInputs: codeInputs.map(({ path, contentHash }) => ({ path, contentHash })) } : {}), ...(graft ? { graft: graft.input ? { path: graft.input.path, contentHash: graft.input.contentHash } : graft.diagnostic } : {}) }));
  return { repository, lens, lensInput, coverage, selected, codeInputs, fingerprint, graft };
}
