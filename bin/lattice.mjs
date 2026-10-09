#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, createGraph, extractJson, resolveRecords } from '../dist/index.js';
import { parseLens, matchesGlob, applyLens } from '../dist/lens/index.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
function git(root, args, fallback = '') {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 }).trimEnd(); }
  catch { return fallback; }
}
function atomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
  renameSync(temporary, path);
}
function inside(root, path) {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}
function options(args) {
  const options = { root: process.cwd(), lens: undefined, output: undefined };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--root' || arg === '--lens') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else if (!arg.startsWith('-') && options.output === undefined) options.output = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.root = realpathSync(resolve(options.root));
  return options;
}
function build(options) {
  if (options.output !== undefined) throw new Error('build takes --root and --lens, not an output directory');
  const { root } = options;
  if (!git(root, ['rev-parse', '--show-toplevel'])) throw new Error('This first build path requires a Git repository');
  const lensPath = resolve(root, options.lens ?? '.lattice/lens.json');
  const lensText = readFileSync(lensPath, 'utf8');
  const lensInput = { path: inside(root, lensPath) ? relative(root, lensPath).split(sep).join('/') : '.lattice/lens.json', text: lensText, contentHash: digest(lensText) };
  const lens = parseLens(lensInput);
  const commit = git(root, ['rev-parse', 'HEAD']);
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all']) !== '';
  const origin = git(root, ['remote', 'get-url', 'origin']);
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(origin)?.[1];
  const remoteUrl = github ? `https://github.com/${github}` : undefined;
  const paths = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const records = [], inputs = [];
  for (const path of paths) {
    const kinds = lens.kinds.filter(kind => kind.files.some(pattern => matchesGlob(path, pattern)));
    if (kinds.length === 0) continue;
    if (kinds.length > 1) throw new Error(`Ambiguous kind patterns: ${path}`);
    const kind = kinds[0];
    if (!path.endsWith('.json')) throw new Error(`This first build path supports JSON records only: ${path}`);
    const absolute = realpathSync(join(root, path));
    if (!inside(root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
    if (statSync(absolute).size > 10 * 1024 * 1024) throw new Error(`Input exceeds 10 MiB: ${path}`);
    const text = readFileSync(absolute, 'utf8');
    const contentHash = digest(text);
    inputs.push({ path, contentHash });
    const addSourceLink = source => !dirty && remoteUrl && commit ? { ...source, revision: commit, url: `${remoteUrl}/blob/${commit}/${source.path.split('/').map(encodeURIComponent).join('/')}#L${source.line}` } : source;
    for (const record of extractJson({ path, text, contentHash }, kind.records ?? '')) {
      const id = record.node.attributes[kind.idField ?? 'id'];
      const name = record.node.attributes[kind.nameField ?? 'name'];
      records.push({ node: { ...record.node, id: typeof id === 'string' && id ? id : record.node.id, name: typeof name === 'string' && name ? name : record.node.name, kind: kind.id, sources: record.node.sources.map(addSourceLink) }, fields: Object.fromEntries(Object.entries(record.fields).map(([key, value]) => [key, addSourceLink(value)])) });
    }
  }
  if (records.length === 0) throw new Error('Lens patterns selected no JSON records');
  const interpreted = applyLens(records, lens, lensInput);
  const nodes = new Map(interpreted.nodes.map(node => [node.id, node]));
  const references = resolveRecords(records.map(record => ({ ...record, node: nodes.get(record.node.id) ?? record.node })));
  const graph = createGraph({ repository: { name: github?.split("/").at(-1) ?? basename(root), ...(remoteUrl ? { remoteUrl } : {}), ...(commit ? { commit } : {}), dirty, sourceFingerprint: digest(canonicalJson(inputs)) }, nodes: references.nodes, edges: references.edges, facets: interpreted.facets, findings: interpreted.findings, views: [], snapshots: [], lensDigest: lensInput.contentHash, adapterVersions: { json: '0.1', lens: '0.1', references: '0.1' }, inputs }, digest);
  const cache = join(root, '.lattice/cache');
  atomic(join(cache, 'graph.json'), graph);
  atomic(join(cache, 'presentation.json'), interpreted.presentation);
  atomic(join(cache, 'diagnostics.json'), references.diagnostics);
  console.log(`Built ${graph.nodes.length} nodes, ${graph.edges.length} references, ${graph.facets.length} facets, ${graph.findings.length} findings.`);
  console.log(`Unresolved/ambiguous reference diagnostics: ${references.diagnostics.length} (selected input scope).`);
  console.log(`Graph ${graph.hash}\n${join(cache, 'graph.json')}`);
}
function exportSite(options) {
  const cache = join(options.root, '.lattice/cache');
  const graphPath = join(cache, 'graph.json');
  if (!existsSync(graphPath)) throw new Error('Run lattice build before export');
  const output = resolve(options.output ?? join(options.root, '.lattice/site'));
  if (output === options.root || output === packageRoot) throw new Error('Choose a dedicated export directory');
  mkdirSync(output, { recursive: true });
  for (const file of ['index.html', 'app.js', 'styles.css']) copyFileSync(join(packageRoot, 'viewer', file), join(output, file));
  for (const file of ['graph.json', 'presentation.json']) copyFileSync(join(cache, file), join(output, file));
  writeFileSync(join(output, '.nojekyll'), '');
  console.log(`Exported static map to ${output}`);
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    console.log('Lattice\n  lattice build --root <repository> [--lens <lens.json>]\n  lattice export <directory> --root <repository>\n\nFirst published path: JSON + declarative lens + static home/list/detail.');
  } else if (command === 'build') build(options(args));
  else if (command === 'export') exportSite(options(args));
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`lattice: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
