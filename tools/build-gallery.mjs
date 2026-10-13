import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, copyFileSync, readdirSync, lstatSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('..', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/gu, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const canonical = path => existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), path.slice(dirname(path).length + 1));
const inside = (parent, child) => { const part = relative(parent, child); return !part || (!part.startsWith('..') && !isAbsolute(part)); };
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_LFS_SKIP_SMUDGE: '1' };
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error?.message ?? result.stderr}`);
  return result.stdout.trim();
}
function git(args) { return run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', ...args], { env: gitEnv }); }
export function sourceEnvironment(repository, inherited = process.env) {
  const count = inherited.GIT_CONFIG_COUNT ?? '0';
  if (!/^(0|[1-9][0-9]*)$/u.test(count) || !Number.isSafeInteger(Number(count))) throw new Error('Invalid inherited GIT_CONFIG_COUNT');
  return { ...inherited, GIT_CONFIG_COUNT: String(Number(count) + 1), [`GIT_CONFIG_KEY_${count}`]: 'remote.origin.url', [`GIT_CONFIG_VALUE_${count}`]: `https://github.com/${repository}` };
}
export function validateManifest(value) {
  if (value?.version !== 1 || !Array.isArray(value.repositories) || !value.repositories.length) throw new Error('Expected version 1 and nonempty repositories');
  const ids = new Set();
  for (const entry of value.repositories) {
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(entry.id) || ids.has(entry.id)) throw new Error('Invalid or duplicate gallery id');
    ids.add(entry.id);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(entry.repository) || !/^[a-f0-9]{40}$/u.test(entry.commit)) throw new Error(`Invalid repository or exact commit for ${entry.id}`);
    if (entry.notes !== undefined && (typeof entry.notes !== 'string' || !/^notes\/[a-z0-9][a-z0-9-]*$/u.test(entry.notes))) throw new Error('Notes must name a direct gallery notes directory');
    if (entry.testOnly !== undefined && typeof entry.testOnly !== 'boolean') throw new Error('testOnly must be boolean');
    if (typeof entry.name !== 'string' || typeof entry.description !== 'string' || typeof entry.stack !== 'string') throw new Error(`Missing display metadata for ${entry.id}`);
  }
  for (const link of value.lensExamples ?? []) {
    const url = new URL(link.url);
    if (url.protocol !== 'https:' || url.username || url.password || typeof link.name !== 'string') throw new Error('Lens examples require credential-free HTTPS links');
  }
  return value;
}
export function galleryHtml(manifest) {
  const cards = manifest.repositories.filter(entry => !entry.testOnly).map(entry => `<li><article><h2><a href="./${escape(entry.id)}/#/home?lang=en">${escape(entry.name)}</a></h2><p>${escape(entry.description)}</p><p class="stack">${escape(entry.stack)}</p><details><summary>Source snapshot</summary><a href="https://github.com/${escape(entry.repository)}/tree/${entry.commit}">${escape(entry.repository)}<br><code>${entry.commit}</code></a></details></article></li>`).join('\n');
  const lenses = (manifest.lensExamples ?? []).map(link => `<li><a href="${escape(link.url)}">${escape(link.name)}</a></li>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lattice · Repository maps</title><link rel="icon" href="data:,"><meta name="description" content="Explore source-grounded maps of public repositories with Lattice. No lens or model required."><link rel="stylesheet" href="./gallery.css"></head>
<body><a class="skip" href="#maps">Skip to repository maps</a><header><p class="brand">Lattice</p><h1>Repository maps</h1><p>Explore how real projects fit together: components, dependencies, entrypoints, and source evidence.</p><p class="muted">Static analysis of pinned public sources. No lens or model required. Static paths describe possible calls, not observed execution. Optional external AI summaries are labeled and cite pinned source lines.</p></header>
<main id="maps" tabindex="-1"><ul class="gallery" aria-label="Public repository maps">${cards}</ul>${lenses ? `<section aria-labelledby="lenses"><h2 id="lenses">Lens examples</h2><p>Optional domain-specific views, configured separately from these repository maps.</p><ul class="lenses">${lenses}</ul></section>` : ''}</main>
<footer><p>Each map links to its source evidence and preserves detailed package and folder views.</p><a href="https://github.com/hyunlord/lattice">Lattice source and documentation</a></footer></body></html>\n`;
}
export function notesDirectory(entry, base = join(project, 'examples/gallery')) {
  if (!entry.notes) return undefined;
  const directory = resolve(base, entry.notes);
  if (!inside(realpathSync(base), realpathSync(directory)) || lstatSync(directory).isSymbolicLink()) throw new Error('Gallery notes must remain inside the manifest directory');
  const provenance = JSON.parse(readFileSync(join(directory, 'provenance.json'), 'utf8'));
  if (provenance.repository !== entry.repository || provenance.commit !== entry.commit) throw new Error('Notes do not match the pinned repository and commit');
  const records = join(directory, 'notes');
  if (lstatSync(records).isSymbolicLink()) throw new Error('Symlink notes are not allowed');
  for (const file of readdirSync(records)) if (!/^[a-zA-Z0-9_-]+\.json$/u.test(file) || !lstatSync(join(records, file)).isFile() || lstatSync(join(records, file)).isSymbolicLink()) throw new Error('Notes require regular JSON files');
  return directory;
}
export function verifyNotes(directory, presentation) {
  if (!directory) return;
  const records = new Map((presentation.interpretations ?? []).map(note => [note.targetId, note]));
  for (const file of readdirSync(join(directory, 'notes'))) {
    const authored = JSON.parse(readFileSync(join(directory, 'notes', file), 'utf8'));
    const visible = records.get(authored.targetId);
    if (!visible || visible.status !== 'fresh' || !authored.claims?.length || visible.validatedClaims?.length !== authored.claims.length) throw new Error(`Gallery note is stale or has invalid citations: ${file}`);
  }
}
export function buildGallery({ manifest, output, sources, cache, manifestDirectory = join(project, 'examples/gallery') }) {
  manifest = validateManifest(manifest);
  output = canonical(resolve(output)); sources = canonical(resolve(sources)); cache = canonical(resolve(cache));
  for (const [a, b] of [[output, sources], [output, cache], [sources, cache]]) if (inside(a, b) || inside(b, a)) throw new Error('Output, source checkouts and cache must be separate directories');
  if (existsSync(output)) {
    const marker = join(output, '.lattice-gallery.json');
    if (!existsSync(marker) || JSON.parse(readFileSync(marker, 'utf8')).generator !== 'lattice-gallery') throw new Error('Refusing an existing output without .lattice-gallery.json ownership marker');
  }
  mkdirSync(output, { recursive: true }); mkdirSync(sources, { recursive: true }); mkdirSync(cache, { recursive: true });
  writeFileSync(join(output, '.lattice-gallery.json'), JSON.stringify({ generator: 'lattice-gallery', version: 1 }) + '\n');
  for (const entry of manifest.repositories) {
    const checkout = join(sources, entry.id);
    if (!existsSync(checkout)) {
      console.log(`Fetching ${entry.repository} at ${entry.commit}`);
      git(['init', '--quiet', checkout]);
      git(['-C', checkout, 'fetch', '--depth=1', '--no-tags', `https://github.com/${entry.repository}.git`, entry.commit]);
      git(['-C', checkout, 'checkout', '--quiet', '--detach', entry.commit]);
    }
    if (realpathSync(checkout) !== checkout) throw new Error(`Symlink checkout is not allowed: ${entry.id}`);
    if (git(['-C', checkout, 'rev-parse', '--show-toplevel']) !== checkout || git(['-C', checkout, 'rev-parse', 'HEAD']) !== entry.commit) throw new Error(`Checkout does not match pinned commit: ${entry.id}`);
    if (git(['-C', checkout, 'status', '--porcelain', '--untracked-files=all'])) throw new Error(`Checkout is dirty: ${entry.id}`);
    console.log(`Building ${entry.id}`);
    const common = ['--root', checkout, '--cache-dir', join(cache, entry.id), '--no-lens'];
    const notes = notesDirectory(entry, manifestDirectory);
    const env = { ...sourceEnvironment(entry.repository), LATTICE_INTERPRETATION_DIR: notes ?? join(cache, entry.id, 'empty-interpretations') };
    run(process.execPath, [join(project, 'bin/lattice.mjs'), 'build', ...common], { env });
    verifyNotes(notes, JSON.parse(readFileSync(join(cache, entry.id, 'presentation.json'), 'utf8')));
    run(process.execPath, [join(project, 'bin/lattice.mjs'), 'export', join(output, entry.id), ...common], { env });
  }
  copyFileSync(join(project, 'examples/gallery/gallery.css'), join(output, 'gallery.css'));
  writeFileSync(join(output, 'index.html'), galleryHtml(manifest));
  writeFileSync(join(output, '.nojekyll'), '');
  writeFileSync(join(output, 'repositories.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Gallery ready: ${output}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index += 2) {
      const key = process.argv[index], value = process.argv[index + 1];
      if (!['--manifest', '--output', '--sources', '--cache'].includes(key) || !value || value.startsWith('--') || options[key]) throw new Error('Usage: node tools/build-gallery.mjs --manifest <json> --output <site> --sources <checkouts> --cache <cache>');
      options[key] = value;
    }
    for (const key of ['--manifest', '--output', '--sources', '--cache']) if (!options[key]) throw new Error(`Missing ${key}`);
    buildGallery({ manifest: JSON.parse(readFileSync(options['--manifest'], 'utf8')), output: options['--output'], sources: options['--sources'], cache: options['--cache'], manifestDirectory: dirname(resolve(options['--manifest'])) });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
