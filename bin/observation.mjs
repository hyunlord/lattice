import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { canonicalJson } from '../dist/index.js';
import { parseLens } from '../dist/lens/index.js';
import { inside, selectedInputs } from './inputs.mjs';
import { workingRepository } from './repository.mjs';
import { digest } from './storage.mjs';

export function observeRepository(options, historical) {
  const { root } = options;
  const repository = historical ?? workingRepository(root);
  const lensPath = resolve(root, options.lens ?? '.lattice/lens.json');
  const lensRelative = inside(root, lensPath) ? relative(root, lensPath).split(sep).join('/') : '.lattice/lens.json';
  const historicalText = historical && inside(root, lensPath) ? historical.readText(lensRelative) : undefined;
  const currentText = historicalText === undefined && (options.lens !== undefined || existsSync(lensPath)) ? readFileSync(lensPath, 'utf8') : undefined;
  const lensText = historicalText ?? currentText;
  const lensInput = lensText === undefined ? undefined : { path: lensRelative, text: lensText, contentHash: digest(lensText) };
  const lens = lensInput ? parseLens(lensInput) : undefined;
  const coverage = !lens ? 'no-lens' : historical ? historicalText === undefined ? 'current-lens-projection' : 'repository-lens' : inside(root, lensPath) ? 'repository-lens' : 'current-lens-projection';
  const selected = [];
  for (const selection of selectedInputs(repository.paths, lens)) {
    const text = repository.readText(selection.path);
    if (text !== undefined) selected.push({ ...selection, input: { path: selection.path, text, contentHash: digest(text) } });
  }
  if (!historical) {
    const after = workingRepository(root);
    if (repository.commit !== after.commit || repository.dirty !== after.dirty || repository.remoteUrl !== after.remoteUrl || canonicalJson(repository.paths) !== canonicalJson(after.paths)) throw new Error('Repository changed while reading inputs; retry the build');
  }
  const fingerprint = digest(canonicalJson({ repository: { name: repository.name, remoteUrl: repository.remoteUrl ?? null, commit: repository.commit ?? null, dirty: repository.dirty }, lens: lensInput ?? null, inputs: selected.map(({ input }) => ({ path: input.path, contentHash: input.contentHash })) }));
  return { repository, lens, lensInput, coverage, selected, fingerprint };
}
