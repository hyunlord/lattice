import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import type { Finding, Graph } from '../dist/core/model.js';
import type { GraphDiff } from '../dist/core/diff.js';
import { buildRepository } from './build.mjs';
import { compareRepository } from './history.mjs';
import { exportSite } from './export.mjs';
import { atomic, persistBuild, withCacheLock } from './storage.mjs';
import { object, type Options } from './types.mjs';
import { parseCiReport, type CiReport, type Counts, type FindingSummary } from './ci-report.mjs';

export type CiBuildConfig = {
    readonly root: string; readonly runnerTemp: string; readonly cacheDir: string; readonly outputDir: string; readonly reportPath: string;
    readonly repository: string; readonly runId: string; readonly eventName: string;
    readonly sourceCommit?: string; readonly pullRequest?: CiReport['pullRequest'];
    readonly lens?: string; readonly baseRef?: string; readonly historyRef?: string; readonly historyCurrentLens?: boolean;
};
const within = (parent: string, child: string): boolean => child === parent || child.startsWith(parent + sep);
function physical(path: string): string {
    const requested = resolve(path);
    let ancestor = requested;
    while (!existsSync(ancestor)) ancestor = dirname(ancestor);
    return resolve(realpathSync(ancestor), relative(ancestor, requested));
}
function countGraph(graph: Graph): Counts { return { nodes: graph.nodes.length, edges: graph.edges.length, facets: graph.facets.length, findings: graph.findings.length, views: graph.views.length }; }
function summarizeFinding(finding: Finding): FindingSummary { return { id: finding.id, ruleId: finding.ruleId, severity: finding.severity, message: finding.message.slice(0, 1000) || '(empty message)' }; }
function diffSummary(comparison: ReturnType<typeof compareRepository>): NonNullable<CiReport['difference']> {
    const difference = comparison.difference;
    const count = (key: keyof GraphDiff) => ({ added: difference[key].added.length, removed: difference[key].removed.length, changed: difference[key].changed.length });
    return { baseCommit: difference.before.commit ?? '', headCommit: difference.after.commit ?? '', counts: { nodes: count('nodes'), edges: count('edges'), facets: count('facets'), findings: count('findings'), views: count('views') }, findings: { added: difference.findings.added.slice(0, 10).map(summarizeFinding), removed: difference.findings.removed.slice(0, 10).map(summarizeFinding), changed: difference.findings.changed.slice(0, 10).map(change => summarizeFinding(change.after)) } };
}
export function runCiBuild(config: CiBuildConfig) {
    const root = realpathSync(config.root), runnerTemp = realpathSync(config.runnerTemp);
    const cacheDir = physical(config.cacheDir), outputPath = physical(config.outputDir), reportPath = physical(config.reportPath);
    for (const path of [cacheDir, outputPath, reportPath]) {
        if (path === runnerTemp || !within(runnerTemp, path) || within(root, path) || within(path, root)) throw new Error('CI cache, site and report must use dedicated paths inside RUNNER_TEMP outside source');
    }
    if (within(cacheDir, outputPath) || within(outputPath, cacheDir) || within(cacheDir, reportPath) || within(outputPath, reportPath) || within(reportPath, cacheDir) || within(reportPath, outputPath)) throw new Error('CI cache, site and report paths must be separate');
    const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    if (config.sourceCommit !== undefined && config.sourceCommit !== sourceCommit) throw new Error('CI sourceCommit does not match checked-out HEAD');
    if (config.pullRequest && config.pullRequest.headSha !== sourceCommit) throw new Error('CI must check out the PR head SHA');
    const options: Options = { root, cacheDir, json: true, ...(config.lens !== undefined ? { lens: config.lens } : {}) };
    const current = withCacheLock(root, () => buildRepository(options), cacheDir);
    if (current.graph.repository.dirty || current.graph.repository.commit !== sourceCommit) throw new Error('CI source changed or is dirty; refusing misleading commit provenance');
    const gates = { passed: 0, failed: 0, unknown: 0 };
    for (const finding of current.graph.findings) if (finding.gate) {
        switch (finding.gate.status) { case 'pass': gates.passed++; break; case 'fail': gates.failed++; break; case 'unknown': gates.unknown++; break; }
    }
    const comparison = config.baseRef ? compareRepository(options, config.baseRef, current) : undefined;
    if (config.historyRef) {
        const historyOptions: Options = { ...options };
        if (config.historyCurrentLens) {
            const lens = config.lens !== undefined ? resolve(root, config.lens) : ['.lattice/lens.yaml', '.lattice/lens.yml', '.lattice/lens.json'].map(path => join(root, path)).find(existsSync);
            if (!lens) throw new Error('historyCurrentLens requires a lens');
            const directory = join(dirname(reportPath), 'history-lens');
            mkdirSync(directory, { recursive: true });
            const copied = join(directory, basename(lens));
            writeFileSync(copied, readFileSync(lens));
            historyOptions.lens = copied;
        }
        const historyCurrent = withCacheLock(root, () => buildRepository(historyOptions), cacheDir);
        compareRepository(historyOptions, config.historyRef, historyCurrent);
    }
    const exported = withCacheLock(root, () => {
        const graph = persistBuild(root, current, cacheDir);
        if (comparison) atomic(join(cacheDir, 'diff.json'), comparison.difference);
        exportSite({ ...options, output: outputPath });
        return graph;
    }, cacheDir);
    const report = parseCiReport({ schemaVersion: 1, repository: config.repository, runId: config.runId, eventName: config.eventName, sourceCommit, graphHash: exported.hash, ...(config.pullRequest ? { pullRequest: config.pullRequest } : {}), counts: countGraph(exported), gates, ...(comparison ? { difference: diffSummary(comparison) } : {}) });
    atomic(reportPath, report);
    return { report, checkStatus: gates.failed || gates.unknown ? 'fail' : 'pass', cacheDir, outputPath, reportPath };
}
function env(name: string): string { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; }
function pullRequest(eventName: string): CiReport['pullRequest'] {
    if (eventName !== 'pull_request') return undefined;
    const event: unknown = JSON.parse(readFileSync(env('GITHUB_EVENT_PATH'), 'utf8'));
    const pr = object(event) ? event['pull_request'] : undefined;
    if (!object(pr) || typeof pr['number'] !== 'number' || !Number.isSafeInteger(pr['number']) || pr['number'] < 1 || !object(pr['head']) || !object(pr['base']) || typeof pr['head']['sha'] !== 'string' || typeof pr['base']['sha'] !== 'string' || !/^[a-f0-9]{40}$/u.test(pr['head']['sha']) || !/^[a-f0-9]{40}$/u.test(pr['base']['sha'])) throw new Error('Invalid pull_request event metadata');
    return { number: pr['number'], headSha: pr['head']['sha'], baseSha: pr['base']['sha'] };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const eventName = env('GITHUB_EVENT_NAME'), pr = pullRequest(eventName);
        const result = runCiBuild({ root: env('LATTICE_ROOT'), runnerTemp: env('RUNNER_TEMP'), cacheDir: env('LATTICE_CACHE_DIR'), outputDir: env('LATTICE_OUTPUT_DIR'), reportPath: env('LATTICE_REPORT_PATH'), repository: env('GITHUB_REPOSITORY'), runId: env('GITHUB_RUN_ID'), eventName, ...(pr ? { pullRequest: pr, baseRef: process.env['LATTICE_BASE_REF'] || pr.baseSha } : { sourceCommit: env('GITHUB_SHA'), ...(process.env['LATTICE_BASE_REF'] ? { baseRef: process.env['LATTICE_BASE_REF'] } : {}) }), ...(process.env['LATTICE_LENS'] ? { lens: process.env['LATTICE_LENS'] } : {}), ...(process.env['LATTICE_HISTORY_REF'] ? { historyRef: process.env['LATTICE_HISTORY_REF'] } : {}), historyCurrentLens: process.env['LATTICE_HISTORY_CURRENT_LENS'] === 'true' });
        const output = process.env['GITHUB_OUTPUT'];
        if (output) appendFileSync(output, Object.entries({ 'check-status': result.checkStatus, 'site-path': result.outputPath, 'report-path': result.reportPath, 'cache-path': result.cacheDir, 'graph-hash': result.report.graphHash }).map(([key, value]) => `${key}=${value}\n`).join(''));
        console.log(JSON.stringify(result));
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
