import { object } from './types.mjs';
export type Counts = { readonly nodes: number; readonly edges: number; readonly facets: number; readonly findings: number; readonly views: number; };
export type Delta = { readonly added: number; readonly removed: number; readonly changed: number; };
export type FindingSummary = { readonly id: string; readonly ruleId: string; readonly severity: 'info' | 'warning' | 'error'; readonly message: string; };
export type CiReport = {
    readonly schemaVersion: 1;
    readonly repository: string;
    readonly runId: string;
    readonly eventName: string;
    readonly sourceCommit: string;
    readonly graphHash: string;
    readonly pullRequest?: { readonly number: number; readonly headSha: string; readonly baseSha: string; };
    readonly counts: Counts;
    readonly gates: { readonly passed: number; readonly failed: number; readonly unknown: number; };
    readonly difference?: {
        readonly baseCommit: string; readonly headCommit: string;
        readonly counts: { readonly nodes: Delta; readonly edges: Delta; readonly facets: Delta; readonly findings: Delta; readonly views: Delta; };
        readonly findings: { readonly added: readonly FindingSummary[]; readonly removed: readonly FindingSummary[]; readonly changed: readonly FindingSummary[]; };
    };
};
export class CiReportError extends Error { constructor(message: string) { super(message); this.name = 'CiReportError'; } }
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
    if (!object(value) || Object.keys(value).some(key => !keys.includes(key))) throw new CiReportError(`Expected object with only ${keys.join(', ')}`);
    return value;
}
function text(value: unknown, field: string, pattern?: RegExp): string {
    if (typeof value !== 'string' || !value.length || value.length > 4096 || pattern && !pattern.test(value)) throw new CiReportError(`Invalid ${field}`);
    return value;
}
function integer(value: unknown, field: string, minimum = 0): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new CiReportError(`Invalid ${field}`);
    return value;
}
const sha = (value: unknown): string => text(value, 'commit', /^[a-f0-9]{40}$/u);
function delta(value: unknown): Delta {
    const item = record(value, ['added', 'removed', 'changed']);
    return { added: integer(item['added'], 'added'), removed: integer(item['removed'], 'removed'), changed: integer(item['changed'], 'changed') };
}
function summaries(value: unknown): FindingSummary[] {
    if (!Array.isArray(value) || value.length > 10) throw new CiReportError('Expected at most ten finding summaries');
    return value.map(value => {
        const item = record(value, ['id', 'ruleId', 'severity', 'message']);
        const severity = item['severity'];
        if (severity !== 'info' && severity !== 'warning' && severity !== 'error') throw new CiReportError('Invalid finding severity');
        return { id: text(item['id'], 'finding id'), ruleId: text(item['ruleId'], 'rule id'), severity, message: text(item['message'], 'message') };
    });
}
function difference(value: unknown): NonNullable<CiReport['difference']> {
    const item = record(value, ['baseCommit', 'headCommit', 'counts', 'findings']);
    const counts = record(item['counts'], ['nodes', 'edges', 'facets', 'findings', 'views']);
    const findings = record(item['findings'], ['added', 'removed', 'changed']);
    return { baseCommit: sha(item['baseCommit']), headCommit: sha(item['headCommit']), counts: { nodes: delta(counts['nodes']), edges: delta(counts['edges']), facets: delta(counts['facets']), findings: delta(counts['findings']), views: delta(counts['views']) }, findings: { added: summaries(findings['added']), removed: summaries(findings['removed']), changed: summaries(findings['changed']) } };
}
export function parseCiReport(value: unknown): CiReport {
    const item = record(value, ['schemaVersion', 'repository', 'runId', 'eventName', 'sourceCommit', 'graphHash', 'pullRequest', 'counts', 'gates', 'difference']);
    if (item['schemaVersion'] !== 1) throw new CiReportError('Unsupported CI report schema');
    const counts = record(item['counts'], ['nodes', 'edges', 'facets', 'findings', 'views']);
    const gates = record(item['gates'], ['passed', 'failed', 'unknown']);
    let pullRequest: CiReport['pullRequest'];
    if (item['pullRequest'] !== undefined) {
        const pr = record(item['pullRequest'], ['number', 'headSha', 'baseSha']);
        pullRequest = { number: integer(pr['number'], 'PR number', 1), headSha: sha(pr['headSha']), baseSha: sha(pr['baseSha']) };
    }
    return {
        schemaVersion: 1, repository: text(item['repository'], 'repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u), runId: text(item['runId'], 'run ID', /^[0-9]+$/u), eventName: text(item['eventName'], 'event name'), sourceCommit: sha(item['sourceCommit']), graphHash: text(item['graphHash'], 'graph hash', /^[a-f0-9]{64}$/u),
        ...(pullRequest ? { pullRequest } : {}), counts: { nodes: integer(counts['nodes'], 'nodes'), edges: integer(counts['edges'], 'edges'), facets: integer(counts['facets'], 'facets'), findings: integer(counts['findings'], 'findings'), views: integer(counts['views'], 'views') },
        gates: { passed: integer(gates['passed'], 'passed'), failed: integer(gates['failed'], 'failed'), unknown: integer(gates['unknown'], 'unknown') },
        ...(item['difference'] !== undefined ? { difference: difference(item['difference']) } : {}),
    };
}
