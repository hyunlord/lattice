#!/usr/bin/env node
import { existsSync, mkdirSync, realpathSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffGraphs } from '../dist/index.js';
import { buildRepository } from './build.mjs';
import { historicalRepository } from './repository.mjs';
import { atomic, readGraph, readSnapshots, saveSnapshot, withCacheLock } from './storage.mjs';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
function options(args) {
  const options = { root: process.cwd(), lens: undefined, output: undefined, json: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--root' || arg === '--lens') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg.slice(2)] = value;
    } else if (arg === '--json') options.json = true;
    else if (!arg.startsWith('-') && options.output === undefined) options.output = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  options.root = realpathSync(resolve(options.root));
  return options;
}
function persist(root, result) {
  const cache = join(root, '.lattice/cache');
  const graph = saveSnapshot(cache, result.graph, result.coverage);
  atomic(join(cache, 'presentation.json'), result.presentation);
  atomic(join(cache, 'diagnostics.json'), result.diagnostics);
  atomic(join(cache, 'inputs.json'), result.extraction.manifest);
  atomic(join(cache, 'build.json'), result.extraction.stats);
  atomic(join(cache, 'graph.json'), graph);
  return graph;
}
function build(options) {
  if (options.json) throw new Error('--json is supported by diff');
  return withCacheLock(options.root, () => {
    const result = buildRepository(options);
    const graph = persist(options.root, result);
    console.log(`Built ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.facets.length} facets, ${graph.findings.length} findings.`);
    console.log(`Extraction: ${result.extraction.stats.parsed} parsed, ${result.extraction.stats.reused} reused, ${result.extraction.stats.discarded} discarded; ${result.extraction.stats.files} files content-verified.`);
    console.log(`Input/reference diagnostics: ${result.diagnostics.length} (selected input scope).`);
    if (graph.lensDigest === null) console.log('Coverage: JSON, CSV, Markdown and code files; JS/TS/Python static imports. YAML is not yet included.');
    console.log(`Graph ${graph.hash}\n${join(options.root, '.lattice/cache/graph.json')}`);
    return graph;
  });
}
function diff(options) {
  const historical = historicalRepository(options.root, options.output);
  return withCacheLock(options.root, () => {
    const buildOptions = { ...options, output: undefined };
    const before = buildRepository(buildOptions, historical);
    const after = buildRepository(buildOptions);
    const metadata = result => ({ ...result.graph.repository, graphHash: result.graph.hash, lensHash: result.graph.lensDigest, coverage: result.coverage });
    const difference = { schemaVersion: 1, before: metadata(before), after: metadata(after), ...diffGraphs(before.graph, after.graph) };
    const cache = join(options.root, '.lattice/cache');
    saveSnapshot(cache, before.graph, before.coverage);
    persist(options.root, after);
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
  });
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
function exportSite(options) {
  const cache = join(options.root, '.lattice/cache');
  const graphPath = join(cache, 'graph.json');
  if (!existsSync(graphPath)) throw new Error('Run lattice build before export');
  if (options.json) throw new Error('--json is supported by diff');
  readGraph(graphPath);
  const snapshots = readSnapshots(cache);
  const output = resolve(options.output ?? join(options.root, '.lattice/site'));
  if (output === options.root || output === packageRoot) throw new Error('Choose a dedicated export directory');
  mkdirSync(output, { recursive: true });
  for (const file of ['index.html', 'app.js', 'styles.css']) copyFileSync(join(packageRoot, 'viewer', file), join(output, file));
  for (const file of ['graph.json', 'presentation.json']) copyFileSync(join(cache, file), join(output, file));
  atomic(join(output, 'snapshots.json'), snapshots);
  for (const snapshot of snapshots) {
    mkdirSync(join(output, 'snapshots'), { recursive: true });
    copyFileSync(join(cache, snapshot.artifactPath), join(output, snapshot.artifactPath));
  }
  writeFileSync(join(output, '.nojekyll'), '');
  console.log(`Exported static map to ${output}`);
}
try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') {
    console.log('Lattice\n  lattice build --root <repository> [--lens <lens.json>]\n  lattice check --root <repository> [--lens <lens.json>]\n  lattice diff <ref> --root <repository> [--lens <lens.json>] [--json]\n  lattice export <directory> --root <repository>\n\nJSON/CSV/Markdown/code build; optional declarative JSON lens; static home/list/detail.');
  } else if (command === 'build') build(options(args));
  else if (command === 'check') check(options(args));
  else if (command === 'diff') diff(options(args));
  else if (command === 'export') { const opts = options(args); withCacheLock(opts.root, () => exportSite(opts)); }
  else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  console.error(`lattice: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
