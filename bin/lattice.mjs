#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { diffGraphs } from '../dist/index.js';
import { exportSite } from './export.mjs';
import { initialize } from './init.mjs';
import { serve } from './serve.mjs';
import { buildRepository } from './build.mjs';
import { historicalRepository } from './repository.mjs';
import { atomic, cacheDirectory, persistBuild, saveSnapshot, withCacheLock } from './storage.mjs';

function canonicalDirectory(path) {
  try { return realpathSync(path); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return join(canonicalDirectory(dirname(path)), basename(path));
  }
}
function options(args) {
  const options = { root: process.cwd(), lens: undefined, output: undefined, json: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--root' || arg === '--lens' || arg === '--port' || arg === '--cache-dir') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg === '--cache-dir' ? 'cacheDir' : arg.slice(2)] = value;
    } else if (arg === '--json') options.json = true;
    else if (arg === '--no-global') options.noGlobal = true;
    else if (arg === '--force') options.force = true;
    else if (!arg.startsWith('-') && options.output === undefined) options.output = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.root = realpathSync(resolve(options.root));
  if (options.cacheDir !== undefined) {
    options.cacheDir = canonicalDirectory(resolve(options.cacheDir));
    if (options.cacheDir === options.root) throw new Error('--cache-dir must not be the repository root');
  }
  return options;
}
function build(options) {
  if (options.json) throw new Error('--json is supported by diff');
  return withCacheLock(options.root, () => {
    const result = buildRepository(options);
    const graph = persistBuild(options.root, result, options.cacheDir);
    console.log(`Built ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.facets.length} facets, ${graph.findings.length} findings.`);
    console.log(`Extraction: ${result.extraction.stats.parsed} parsed, ${result.extraction.stats.reused} reused, ${result.extraction.stats.discarded} discarded; ${result.extraction.stats.files} files content-verified.`);
    console.log(`Input/reference diagnostics: ${result.diagnostics.length} (selected input scope).`);
    if (graph.lensDigest === null) console.log('Coverage: JSON, YAML, CSV, Markdown and code files; JS/TS/Python static imports. Unity tagged YAML is not included.');
    console.log(`Graph ${graph.hash}\n${join(cacheDirectory(options.root, options.cacheDir), 'graph.json')}`);
    return graph;
  }, options.cacheDir);
}
function diff(options) {
  const historical = historicalRepository(options.root, options.output);
  return withCacheLock(options.root, () => {
    const buildOptions = { ...options, output: undefined };
    const before = buildRepository(buildOptions, historical);
    const after = buildRepository(buildOptions);
    const metadata = result => ({ ...result.graph.repository, graphHash: result.graph.hash, lensHash: result.graph.lensDigest, coverage: result.coverage });
    const difference = { schemaVersion: 1, before: metadata(before), after: metadata(after), ...diffGraphs(before.graph, after.graph) };
    const cache = cacheDirectory(options.root, options.cacheDir);
    saveSnapshot(cache, before.graph, before.coverage);
    persistBuild(options.root, after, options.cacheDir);
    atomic(join(cache, 'diff.json'), difference);
    if (options.json) console.log(JSON.stringify(difference, null, 2));
    else {
      console.log(`Compared ${historical.commit} (${before.coverage}) → ${after.graph.repository.dirty ? 'working tree' : after.graph.repository.commit ?? 'uncommitted'} (${after.coverage})`);
      for (const key of ['nodes', 'edges', 'facets', 'findings', 'views']) {
        const change = difference[key];
        console.log(`${key}: +${change.added.length} -${change.removed.length} ~${change.changed.length}`);
        for (const item of change.added) console.log(`  + ${item.id}`);
        for (const item of change.removed) console.log(`  - ${item.id}`);
        for (const item of change.changed) console.log(`  ~ ${item.id}`);
      }
      console.log(`Before/after records: ${join(cache, 'diff.json')}`);
    }
  }, options.cacheDir);
}
function check(options) {
  const graph = build(options);
  const gated = graph.findings.filter(finding => finding.gate);
  if (!gated.length) { console.log('No gates configured; findings are informational.'); return; }
  for (const finding of gated) {
    const gate = finding.gate;
    console.log(`${gate.status.toUpperCase()} ${finding.ruleId}: ${gate.metric}=${JSON.stringify(finding.metrics[gate.metric] ?? null)} ${gate.comparator} ${gate.threshold}`);
  }
  const failed = gated.filter(finding => finding.gate.status !== 'pass');
  console.log(`Gates: ${gated.length - failed.length}/${gated.length} passed; ${failed.length} failed or unknown.`);
  if (failed.length) process.exitCode = 1;
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'init' && args.includes('--cache-dir')) throw new Error('--cache-dir is not supported by init; init writes repository configuration');
  if (command !== 'init' && args.includes('--no-global')) throw new Error('--no-global is supported by init');
  if (command !== 'serve' && args.includes('--port')) throw new Error('--port is supported by serve');
  if (command !== 'export' && args.includes('--force')) throw new Error('--force is supported by export');
  if (!command || command === '--help' || command === 'help') {
    console.log('Lattice\n  lattice init --root <repository> [--no-global]\n  lattice build --root <repository> [--lens <lens.yaml|lens.json>] [--cache-dir <directory>]\n  lattice check --root <repository> [--lens <lens.yaml|lens.json>] [--cache-dir <directory>]\n  lattice diff <ref> --root <repository> [--lens <lens.yaml|lens.json>] [--json] [--cache-dir <directory>]\n  lattice export <directory> --root <repository> [--force] [--cache-dir <directory>]\n  lattice serve --root <repository> [--lens <lens.yaml|lens.json>] [--port <number>] [--cache-dir <directory>]\n\nJSON/YAML/CSV/Markdown/code build; optional declarative YAML/JSON lens; static home/list/detail.');
  } else if (command === 'init') initialize(options(args));
  else if (command === 'build') build(options(args));
  else if (command === 'check') check(options(args));
  else if (command === 'diff') diff(options(args));
  else if (command === 'serve') await serve(options(args));
  else if (command === 'export') { const opts = options(args); withCacheLock(opts.root, () => exportSite(opts), opts.cacheDir); }
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`lattice: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
