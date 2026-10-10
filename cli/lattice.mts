#!/usr/bin/env node
import { errorCode } from './types.mjs';
import type { Options } from './types.mjs';
import type { Graph } from '../dist/index.js';
import { realpathSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { basename, dirname, join, resolve } from 'node:path';
import { exportSite } from './export.mjs';
import { initialize } from './init.mjs';
import { serve } from './serve.mjs';
import { buildRepository } from './build.mjs';
import { compareRepository } from './history.mjs';
import { runInterpretationCommand } from './interpretation-runner.mjs';
import { mcp } from './mcp.mjs';
import { cacheDirectory, persistBuild, withCacheLock } from './storage.mjs';

function canonicalDirectory(path: string): string {
    try { return realpathSync(path); }
    catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
        return join(canonicalDirectory(dirname(path)), basename(path));
    }
}
function options(args: readonly string[]) {
    const options: Options = { root: process.cwd(), json: false };
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === undefined) continue;
        if (arg === '--root' || arg === '--lens' || arg === '--port' || arg === '--cache-dir' || arg === '--viewer-url') {
            const value = args[++index];
            if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
            if (arg === '--cache-dir') options.cacheDir = value;
            else if (arg === '--root') options.root = value;
            else if (arg === '--lens') options.lens = value;
            else if (arg === '--viewer-url') options.viewerUrl = value;
            else options.port = value;
        } else if (arg === '--json') options.json = true;
        else if (arg === '--no-lens') options.noLens = true;
        else if (arg === '--no-global') options.noGlobal = true;
        else if (arg === '--force') options.force = true;
        else if (!arg.startsWith('-') && options.output === undefined) options.output = arg;
        else throw new Error(`Unknown argument: ${arg}`);
    }
    if (options.noLens && options.lens) throw new Error('Choose --lens or --no-lens');
    options.root = realpathSync(resolve(options.root));
    if (options.cacheDir !== undefined) {
        options.cacheDir = canonicalDirectory(resolve(options.cacheDir));
        if (options.cacheDir === options.root) throw new Error('--cache-dir must not be the repository root');
    }
    return options;
}
function graphSummary(graph: Graph) {
    return { hash: graph.hash, repository: graph.repository, counts: Object.fromEntries((['nodes', 'edges', 'facets', 'findings', 'views'] as const).map(key => [key, graph[key].length])) };
}
function gates(graph: Graph) {
    return graph.findings.flatMap(finding => finding.gate ? [{ ...finding, gate: finding.gate }] : []).map(finding => ({ findingId: finding.id, ruleId: finding.ruleId, ...finding.gate, value: finding.metrics[finding.gate.metric] ?? null }));
}
const startedAt = performance.now();
function output(command: string, result: object | string, ok = true) {
    console.log(JSON.stringify({ schemaVersion: 1, command, ok, result: { ...(typeof result === 'string' ? { outputPath: result } : result), durationMs: performance.now() - startedAt } }));
}
function build(options: Options, command = 'build') {
    return withCacheLock(options.root, () => {
        const result = buildRepository(options);
        const graph = persistBuild(options.root, result, options.cacheDir);
        if (options.json) {
            const statuses = gates(graph);
            output(command, { graph: graphSummary(graph), extraction: result.extraction.stats, diagnostics: result.diagnostics, coverage: result.coverage, cachePath: cacheDirectory(options.root, options.cacheDir), gates: statuses }, command !== 'check' || statuses.every(gate => gate.status === 'pass'));
        } else {
            console.log(`Built ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${graph.facets.length} facets, ${graph.findings.length} findings.`);
            console.log(`Extraction: ${result.extraction.stats.parsed} parsed, ${result.extraction.stats.reused} reused, ${result.extraction.stats.discarded} discarded; ${result.extraction.stats.files} files content-verified.`);
            console.log(`Input/reference diagnostics: ${result.diagnostics.length} (selected input scope).`);
            if (graph.lensDigest === null) console.log('Coverage: JSON, YAML, CSV, Markdown and code files; JS/TS/Python/C#/Rust/Go/Java/Kotlin/Swift/GDScript static imports and named definitions. Unity tagged YAML is not included.');
            console.log(`Graph ${graph.hash}\n${join(cacheDirectory(options.root, options.cacheDir), 'graph.json')}`);
        }
        return graph;
    }, options.cacheDir);
}
function diff(options: Options) {
    const { difference } = compareRepository(options, options.output);
    if (options.json) console.log(JSON.stringify(difference, null, 2));
    else {
        console.log(`Compared ${difference.before.commit} (${difference.before.coverage}) → ${difference.after.dirty ? 'working tree' : difference.after.commit ?? 'uncommitted'} (${difference.after.coverage})`);
        for (const key of (['nodes', 'edges', 'facets', 'findings', 'views'] as const)) {
            const change = difference[key];
            console.log(`${key}: +${change.added.length} -${change.removed.length} ~${change.changed.length}`);
            for (const item of change.added) console.log(`  + ${item.id}`);
            for (const item of change.removed) console.log(`  - ${item.id}`);
            for (const item of change.changed) console.log(`  ~ ${item.id}`);
        }
        console.log(`Before/after records: ${join(cacheDirectory(options.root, options.cacheDir), 'diff.json')}`);
    }
}
function check(options: Options) {
    const graph = build(options, 'check');
    const gated = graph.findings.flatMap(finding => finding.gate ? [{ ...finding, gate: finding.gate }] : []);
    if (options.json) { if (gated.some(finding => finding.gate.status !== 'pass')) process.exitCode = 1; return; }
    if (!gated.length) { console.log('No gates configured; findings are informational.'); return; }
    for (const finding of gated) {
        const gate = finding.gate;
        console.log(`${gate.status.toUpperCase()} ${finding.ruleId}: ${gate.metric}=${JSON.stringify(finding.metrics[gate.metric] ?? null)} ${gate.comparator} ${gate.threshold}`);
    }
    const failed = gated.filter(finding => finding.gate.status !== 'pass');
    console.log(`Gates: ${gated.length - failed.length}/${gated.length} passed; ${failed.length} failed or unknown.`);
    if (failed.length) process.exitCode = 1;
}
const argv = process.argv.slice(2);
const leadingJson = argv[0] === '--json';
if (leadingJson) argv.shift();
const [command, ...args] = argv;
if (leadingJson) args.push('--json');
const jsonRequested = args.includes('--json');
try {
    if (command === 'init' && args.includes('--cache-dir')) throw new Error('--cache-dir is not supported by init; init writes repository configuration');
    if (command !== 'init' && args.includes('--no-global')) throw new Error('--no-global is supported by init');
    if (command !== 'mcp' && args.includes('--viewer-url')) throw new Error('--viewer-url is supported by mcp');
    if (command !== 'serve' && args.includes('--port')) throw new Error('--port is supported by serve');
    if (command !== 'export' && args.includes('--force')) throw new Error('--force is supported by export');
    if (!command || command === '--help' || command === 'help') {
        const help = 'Lattice\n  lattice init --root <repository> [--no-global] [--json]\n  lattice build --root <repository> [--lens <lens.yaml|lens.json> | --no-lens] [--cache-dir <directory>] [--json]\n  lattice check --root <repository> [--lens <lens.yaml|lens.json> | --no-lens] [--cache-dir <directory>] [--json]\n  lattice diff <ref> --root <repository> [--lens <lens.yaml|lens.json> | --no-lens] [--cache-dir <directory>] [--json]\n  lattice export <directory> --root <repository> [--force] [--cache-dir <directory>] [--json]\n  lattice serve --root <repository> [--lens <lens.yaml|lens.json> | --no-lens] [--port <number>] [--cache-dir <directory>] [--json]\n  lattice summarize --root <repository> [--json] -- <external-command> [args...]\n  lattice mcp --root <repository> [--lens <lens>] [--cache-dir <directory>] [--viewer-url <URL>]\n\nJSON/YAML/CSV/Markdown/code build; optional declarative YAML/JSON lens; static home/list/detail.';
        if (jsonRequested) output('help', { text: help });
        else console.log(help);
    } else if (command === 'init') { const opts = options(args); const result = initialize(opts); if (opts.json) output(command, result); }
    else if (command === 'summarize') {
        const divider = args.indexOf('--');
        if (divider < 0) throw new Error('summarize requires -- <external-command> [args...] and LATTICE_SUMMARY_KEY_ENV');
        const opts = options(args.slice(0, divider));
        if (opts.output !== undefined) throw new Error('summarize takes no positional argument before --');
        const keyEnv = process.env['LATTICE_SUMMARY_KEY_ENV'];
        if (!keyEnv) throw new Error('Set LATTICE_SUMMARY_KEY_ENV to the API-key environment variable name');
        const graph = withCacheLock(opts.root, () => { const result = buildRepository(opts); return persistBuild(opts.root, result, opts.cacheDir); }, opts.cacheDir);
        const result = await runInterpretationCommand(opts.root, graph, args.slice(divider + 1), keyEnv);
        if (opts.json) output(command, result); else console.log(JSON.stringify(result));
    }
    else if (command === 'build') build(options(args));
    else if (command === 'check') check(options(args));
    else if (command === 'diff') diff(options(args));
    else if (command === 'mcp') await mcp(options(args));
    else if (command === 'serve') await serve(options(args));
    else if (command === 'export') { const opts = options(args); withCacheLock(opts.root, () => { const result = exportSite(opts); if (opts.json) output(command, result); }, opts.cacheDir); }
    else throw new Error(`Unknown command: ${command}`);
} catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonRequested && command !== 'mcp') console.log(JSON.stringify({ schemaVersion: 1, command: command ?? null, ok: false, ...(command === 'serve' ? { event: 'error' } : {}), error: { message } }));
    else console.error(`lattice: ${message}`);
    process.exitCode = 2;
}
