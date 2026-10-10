import type { CiReport } from './ci-report.mjs';
import { parseCiReport } from './ci-report.mjs';
import type { GithubClient, GithubConnection } from './ci-github.mjs';
import { botComment, githubClient, pullRequest } from './ci-github.mjs';
import { object } from './types.mjs';
import { readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const commentMarker = '<!-- lattice:system-diff -->';
function text(value: string): string {
    return value.slice(0, 160).replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/[&<>"'`*_{}\[\]()#+.!|\\~:@/=-]/gu, character => `&#${character.codePointAt(0)};`);
}
export function renderCiComment(report: CiReport): string {
    const lines = [commentMarker, '## Lattice system diff', '', `Source: \`${report.sourceCommit}\` · Graph: \`${report.graphHash}\``, '', '| Graph | Count |', '| --- | ---: |'];
    for (const [kind, count] of Object.entries(report.counts)) lines.push(`| ${kind} | ${count} |`);
    lines.push('', `Gates: **${report.gates.failed || report.gates.unknown ? 'FAIL' : 'PASS'}** (${report.gates.passed} passed, ${report.gates.failed} failed, ${report.gates.unknown} unknown).`);
    if (report.difference) {
        lines.push('', `Comparison: \`${report.difference.baseCommit}\` → \`${report.difference.headCommit}\``, '', '| Change | Added | Removed | Changed |', '| --- | ---: | ---: | ---: |');
        for (const [kind, counts] of Object.entries(report.difference.counts)) lines.push(`| ${kind} | ${counts.added} | ${counts.removed} | ${counts.changed} |`);
        for (const [status, findings] of Object.entries(report.difference.findings)) {
            lines.push('', `### Findings ${status}`);
            if (!findings.length) lines.push('None in the bounded summary.');
            for (const finding of findings.slice(0, 10)) lines.push(`- ${text(finding.severity)} · ${text(finding.ruleId)}: ${text(finding.message)}`);
        }
        lines.push('', 'Finding lists are limited to 10 per change category; the artifact contains the full graph and diff.');
    }
    const run = `https://github.com/${report.repository}/actions/runs/${report.runId}`;
    lines.push('', `[Workflow run](${run}) · [Graph, site and diff artifacts](${run}#artifacts)`, '', 'Findings are evidence from the selected graph, not proof of runtime behavior.');
    return lines.join('\n');
}
export interface CommentContext extends GithubConnection {
    readonly repository: string;
    readonly runId: string;
    readonly eventName: string;
    readonly event: unknown;
}
export async function publishCiComment(report: CiReport, context: CommentContext, client: GithubClient = githubClient(context)) {
    if (context.eventName !== 'pull_request') return { status: 'skipped', reason: 'not a pull request' };
    if (!object(context.event)) throw new Error('Invalid GitHub event');
    const event = pullRequest(context.event['pull_request']);
    if (event.headRepository !== context.repository || event.baseRepository !== context.repository) return { status: 'skipped', reason: 'fork pull request' };
    const expected = report.pullRequest;
    if (!expected || report.repository !== context.repository || report.runId !== context.runId || report.eventName !== context.eventName || expected.number !== event.number || expected.headSha !== event.headSha || expected.baseSha !== event.baseSha || report.sourceCommit !== event.headSha || report.difference?.headCommit !== event.headSha || report.difference?.baseCommit !== event.baseSha) throw new Error('CI report does not match trusted run and pull request context');
    const prefix = `/repos/${context.repository}`;
    const current = pullRequest(await client.request('GET', `${prefix}/pulls/${event.number}`));
    if (current.number !== event.number || !current.open || current.headSha !== event.headSha || current.baseSha !== event.baseSha || current.headRepository !== context.repository || current.baseRepository !== context.repository) return { status: 'skipped', reason: 'stale or closed pull request' };
    let existing: { readonly id: number; readonly body: string; } | undefined;
    for (let page = 1; ; page++) {
        const comments = await client.request('GET', `${prefix}/issues/${event.number}/comments?per_page=100&page=${page}`);
        if (!Array.isArray(comments)) throw new Error('Invalid GitHub comments response');
        for (const candidate of comments) {
            const comment = botComment(candidate);
            if (comment?.body.startsWith(`${commentMarker}\n`) && !existing) existing = comment;
        }
        if (comments.length < 100) break;
    }
    const body = renderCiComment(report);
    if (existing?.body === body) return { status: 'unchanged', commentId: existing.id };
    const result = await client.request(existing ? 'PATCH' : 'POST', existing ? `${prefix}/issues/comments/${existing.id}` : `${prefix}/issues/${event.number}/comments`, { body });
    if (!object(result) || typeof result['id'] !== 'number') throw new Error('Invalid GitHub comment write response');
    return { status: existing ? 'updated' : 'created', commentId: result['id'] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    try {
        const required = (name: string): string => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
        const path = process.argv[2]; if (!path || process.argv.length !== 3) throw new Error('Usage: ci-comment.mjs <summary.json>');
        const report = parseCiReport(JSON.parse(readFileSync(path, 'utf8')));
        const result = await publishCiComment(report, { repository: required('GITHUB_REPOSITORY'), runId: required('GITHUB_RUN_ID'), eventName: required('GITHUB_EVENT_NAME'), event: JSON.parse(readFileSync(required('GITHUB_EVENT_PATH'), 'utf8')), token: required('GITHUB_TOKEN'), ...(process.env['GITHUB_API_URL'] ? { apiUrl: process.env['GITHUB_API_URL'] } : {}) });
        console.log(JSON.stringify(result));
    } catch (error) {
        console.error(error instanceof Error ? error.message : 'CI comment failed'); process.exitCode = 1;
    }
}
