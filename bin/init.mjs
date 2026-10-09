import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { codeLanguage, parseLens } from '../dist/index.js';
import { workingRepository } from './repository.mjs';
import { digest } from './storage.mjs';

function regular(path, directory = false) {
  const status = lstatSync(path, { throwIfNoEntry: false });
  if (status && (status.isSymbolicLink() || (directory ? !status.isDirectory() : !status.isFile()))) throw new Error(`Init requires a regular ${directory ? 'directory' : 'file'}: ${path}`);
  return status !== undefined;
}
function skeleton(name) {
  const code = 'ts tsx mts cts js jsx mjs cjs py pyi cs go rs java c h cpp hpp rb swift kt sh'.split(' ').filter(extension => codeLanguage(`source.${extension}`));
  const kinds = [
    { id: 'record', label: 'Records', files: ['json', 'yaml', 'yml', 'csv'].map(extension => `**/*.${extension}`) },
    { id: 'document', label: 'Documents', files: ['**/*.md', '**/*.markdown'] },
    { id: 'module', label: 'Modules', files: code.map(extension => `**/*.${extension}`) },
  ];
  return `schemaVersion: 1\nname: ${JSON.stringify(name)}\nkinds:\n${kinds.map(kind => `  - id: ${kind.id}\n    label: ${kind.label}\n    files: ${JSON.stringify(kind.files)}\n`).join('')}facets: []\nfindings: []\n`;
}

export function initialize(options) {
  if (options.output !== undefined || options.lens !== undefined || options.json || options.force || options.port !== undefined) throw new Error('init accepts --root and --no-global');
  const { root } = options;
  workingRepository(root);
  const directory = join(root, '.lattice');
  regular(directory, true);
  regular(join(directory, 'cache'), true);
  const ignorePath = join(directory, '.gitignore');
  const hasIgnore = regular(ignorePath);
  const candidates = ['lens.yaml', 'lens.yml', 'lens.json'].filter(file => regular(join(directory, file)));
  if (candidates.length > 1) throw new Error('Multiple default lenses found; keep one of .lattice/lens.yaml, lens.yml or lens.json');
  const filename = candidates[0] ?? 'lens.yaml';
  const lensPath = join(directory, filename);
  const text = candidates.length ? readFileSync(lensPath, 'utf8') : skeleton(basename(root));
  parseLens({ path: `.lattice/${filename}`, text, contentHash: digest(text) });
  const previous = hasIgnore ? readFileSync(ignorePath, 'utf8') : '';
  const newline = previous.includes('\r\n') ? '\r\n' : '\n';
  const lines = previous.split(/\r?\n/u);
  const missing = ['/cache/', '/site/'].filter(pattern => !lines.includes(pattern));
  const next = previous + (missing.length && previous && !previous.endsWith('\n') ? newline : '') + missing.map(pattern => pattern + newline).join('');
  mkdirSync(directory, { recursive: true });
  if (!candidates.length) writeFileSync(lensPath, text, { flag: 'wx' });
  if (next !== previous) writeFileSync(ignorePath, next);
  mkdirSync(join(directory, 'cache'), { recursive: true });
  console.log(`Initialized Lattice lens: ${lensPath}\nCache/site ignores: ${ignorePath}\nAgent wiring is planned for L3; no global configuration was changed.`);
  return { lensPath, ignorePath };
}
