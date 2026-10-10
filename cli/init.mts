import type { Options } from './types.mjs';
import { closeSync, constants, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { codeLanguage, parseLens } from '../dist/index.js';
import { workingRepository } from './repository.mjs';
import { digest } from './storage.mjs';
import { regular } from './init-files.mjs';
import { agentFiles } from './init-agents.mjs';

function skeleton(name: string) {
    const code = 'ts tsx mts cts js jsx mjs cjs py pyi cs go rs java c h cpp hpp rb swift kt kts gd sh'.split(' ').filter(extension => codeLanguage(`source.${extension}`));
    const kinds = [
        { id: 'document', label: 'Documents', files: ['**/*.md', '**/*.markdown'] },
        { id: 'module', label: 'Modules', files: [...code.map(extension => `**/*.${extension}`), '**/go.mod'] },
    ];
    return `schemaVersion: 1\nname: ${JSON.stringify(name)}\nkinds:\n${kinds.map(kind => `  - id: ${kind.id}\n    label: ${kind.label}\n    files: ${JSON.stringify(kind.files)}\n`).join('')}  # Opt in to domain data with explicit repository paths:\n  # - id: record\n  #   label: Records\n  #   files: [\"data/**/*.json\", \"data/**/*.yaml\", \"data/**/*.yml\", \"data/**/*.csv\"]\nfacets: []\nfindings: []\n`;
}

export function initialize(options: Options) {
    if (options.output !== undefined || options.lens !== undefined || options.force || options.port !== undefined) throw new Error('init accepts --root, --no-global and --json');
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
    const agents = agentFiles(root, !options.noGlobal);
    for (const file of agents) file.validate?.();
    mkdirSync(directory, { recursive: true });
    if (!candidates.length) writeFileSync(lensPath, text, { flag: 'wx' });
    if (next !== previous) writeFileSync(ignorePath, next);
    mkdirSync(join(directory, 'cache'), { recursive: true });
    for (const file of agents) if (file.next !== file.previous) {
        mkdirSync(dirname(file.path), { recursive: true });
        file.validate?.();
        if ((regular(file.path) ? readFileSync(file.path, 'utf8') : '') !== file.previous) throw new Error(`Init file changed after planning: ${file.path}`);
        const descriptor = openSync(file.path, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW | (regular(file.path) ? constants.O_TRUNC : constants.O_EXCL));
        try { writeFileSync(descriptor, file.next); } finally { closeSync(descriptor); }
    }
    const globalConfigurationChanged = !options.noGlobal && agents.at(-1)?.next !== agents.at(-1)?.previous;
    if (!options.json) console.log(`Initialized Lattice lens: ${lensPath}\nAgent configurations installed; restart clients to discover Lattice. Global configuration changed: ${globalConfigurationChanged}`);
    return { lensPath, ignorePath, cachePath: join(directory, 'cache'), agentPaths: agents.map(file => file.path), globalConfigurationChanged };
}
