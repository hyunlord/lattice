#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync, renameSync, copyFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, createGraph, resolveRecords, resolveDocumentLinks, resolveModuleLinks } from '../dist/index.js';
import { parseLens, applyLens } from '../dist/lens/index.js';

import { collectInputs, inside } from './inputs.mjs';

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
  const lensText = options.lens !== undefined || existsSync(lensPath) ? readFileSync(lensPath, 'utf8') : undefined;
  const lensInput = lensText === undefined ? undefined : { path: inside(root, lensPath) ? relative(root, lensPath).split(sep).join('/') : '.lattice/lens.json', text: lensText, contentHash: digest(lensText) };
  const lens = lensInput ? parseLens(lensInput) : undefined;
  const commit = git(root, ['rev-parse', 'HEAD']);
  const dirty = git(root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude).lattice/cache', ':(exclude).lattice/site']) !== '';
  const origin = git(root, ['remote', 'get-url', 'origin']);
  const github = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(origin)?.[1];
  const remoteUrl = github ? `https://github.com/${github}` : undefined;
  const paths = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean))].sort();
  const sourceLink = source => !dirty && remoteUrl && commit ? { ...source, revision: commit, url: `${remoteUrl}/blob/${commit}/${source.path.split('/').map(encodeURIComponent).join('/')}#L${source.line}` } : source;
  const { records, documents, modules, files, inputs, diagnostics } = collectInputs({ root, paths, lens, digest, sourceLink });
  if (records.length === 0 && documents.length === 0 && modules.length === 0 && files.length === 0) throw new Error('No supported data, document or code inputs');
  const interpreted = lens && lensInput ? applyLens(records, lens, lensInput) : { nodes: records.map(record => record.node), facets: [], findings: [], presentation: { description: "JSON·CSV·문서·코드 파일에서 추출한 지도입니다. 코드 연결은 JS/TS·Python의 정적 import이며 실행 증거가 아닙니다. YAML·Git 이력은 아직 포함하지 않습니다." } };
  const nodes = new Map(interpreted.nodes.map(node => [node.id, node]));
  const references = resolveRecords(lens ? records.map(record => ({ ...record, node: nodes.get(record.node.id) ?? record.node })) : records);
  const linked = resolveDocumentLinks(documents, [...references.nodes, ...modules.map(module => module.node), ...files]);
  const moduleLinks = resolveModuleLinks(modules);
  const graph = createGraph({ repository: { name: github?.split("/").at(-1) ?? basename(root), ...(remoteUrl ? { remoteUrl } : {}), ...(commit ? { commit } : {}), dirty, sourceFingerprint: digest(canonicalJson(inputs)) }, nodes: linked.nodes, edges: [...references.edges, ...linked.edges, ...moduleLinks.edges], facets: interpreted.facets, findings: interpreted.findings, views: [], snapshots: [], lensDigest: lensInput?.contentHash ?? null, adapterVersions: { json: '0.1', ...(inputs.some(input => /\.csv$/iu.test(input.path)) ? { csv: '0.1' } : {}), ...(documents.length ? { markdown: '0.1' } : {}), ...(modules.length ? { code: '0.1' } : {}), ...(lens ? { lens: '0.1' } : {}), references: '0.1' }, inputs }, digest);
  const cache = join(root, '.lattice/cache');
  atomic(join(cache, 'graph.json'), graph);
  atomic(join(cache, 'presentation.json'), interpreted.presentation);
  const allDiagnostics = [...diagnostics, ...references.diagnostics, ...linked.diagnostics, ...moduleLinks.diagnostics];
  atomic(join(cache, 'diagnostics.json'), allDiagnostics);
  console.log(`Built ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.facets.length} facets, ${graph.findings.length} findings.`);
  console.log(`Input/reference diagnostics: ${allDiagnostics.length} (selected input scope).`);
  if (!lens) console.log('Coverage: JSON, CSV, Markdown and code files; JS/TS/Python static imports. YAML and git history are not yet included.');
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
    console.log('Lattice\n  lattice build --root <repository> [--lens <lens.json>]\n  lattice export <directory> --root <repository>\n\nJSON/CSV/Markdown/code build; optional declarative JSON lens; static home/list/detail.');
  } else if (command === 'build') build(options(args));
  else if (command === 'export') exportSite(options(args));
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`lattice: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
