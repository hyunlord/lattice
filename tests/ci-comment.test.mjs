import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { githubClient } from '../bin/ci-github.mjs';
import { renderCiComment, publishCiComment, commentMarker } from '../bin/ci-comment.mjs';
const head = 'a'.repeat(40), base = 'b'.repeat(40);
const counts = { nodes: 2, edges: 1, facets: 0, findings: 1, views: 0 };
const delta = Object.fromEntries(Object.keys(counts).map(key => [key, { added: 1, removed: 0, changed: 0 }]));
const report = { schemaVersion: 1, repository: 'owner/repo', runId: '123', eventName: 'pull_request', sourceCommit: head, graphHash: 'c'.repeat(64), pullRequest: { number: 4, headSha: head, baseSha: base }, counts, gates: { passed: 1, failed: 0, unknown: 0 }, difference: { baseCommit: base, headCommit: head, counts: delta, findings: { added: [{ id: 'f', ruleId: '@team/[link]', severity: 'warning', message: '<script> @everyone ![image](https://evil)\n# heading' }], removed: [], changed: [] } } };
const pull = { number: 4, state: 'open', head: { sha: head, repo: { full_name: 'owner/repo' } }, base: { sha: base, repo: { full_name: 'owner/repo' } } };
async function fixture(t, comments = [], current = pull) {
    const writes = [], requests = [];
    const server = createServer(async (req, res) => {
        requests.push(req.url); assert.equal(req.headers.authorization, 'Bearer test-only');
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET') return res.end(JSON.stringify(req.url.includes('/pulls/') ? current : comments.slice((Number(new URL(req.url, 'http://localhost').searchParams.get('page')) - 1) * 100, Number(new URL(req.url, 'http://localhost').searchParams.get('page')) * 100)));
        let body = ''; for await (const chunk of req) body += chunk;
        writes.push({ method: req.method, url: req.url, ...JSON.parse(body) }); res.end('{"id":55}');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const context = { repository: 'owner/repo', runId: '123', eventName: 'pull_request', event: { pull_request: pull }, token: 'test-only', apiUrl: `http://127.0.0.1:${server.address().port}` };
    return { context, writes, requests };
}
test('rendered comment neutralizes source Markdown and mentions while retaining trusted links', () => {
    const body = renderCiComment(report);
    assert.ok(body.startsWith(commentMarker)); assert.ok(body.includes('Gates: **PASS**'));
    assert.ok(!body.includes('@everyone')); assert.ok(!body.includes('<script>')); assert.ok(!body.includes('![image]'));
    assert.ok(body.includes('https://github.com/owner/repo/actions/runs/123#artifacts'));
    const many = Array.from({ length: 10 }, () => ({ id: 'f', ruleId: '*'.repeat(4096), severity: 'warning', message: '*'.repeat(4096) }));
    assert.ok(renderCiComment({ ...report, difference: { ...report.difference, findings: { added: many, removed: many, changed: many } } }).length < 65536);
});
test('publisher creates one comment without editing a user marker', async t => {
    const f = await fixture(t, [{ id: 9, body: commentMarker + '\nuser text', user: { type: 'User', login: 'human' } }]);
    assert.equal((await publishCiComment(report, f.context)).status, 'created');
    assert.equal(f.writes.length, 1); assert.equal(f.writes[0].method, 'POST');
});
test('publisher finds a paginated bot comment and updates only that marker', async t => {
    const comments = Array.from({ length: 100 }, (_, id) => ({ id: id + 1, body: 'other', user: { type: 'User', login: 'human' } }));
    comments.push({ id: 222, body: commentMarker + '\nold', user: { type: 'Bot', login: 'github-actions[bot]' } });
    const f = await fixture(t, comments);
    assert.equal((await publishCiComment(report, f.context)).status, 'updated');
    assert.equal(f.writes[0].method, 'PATCH'); assert.ok(f.writes[0].url.endsWith('/222'));
    assert.ok(f.requests.some(path => path.endsWith('page=2')));
});
test('publisher leaves an identical comment unchanged', async t => {
    const f = await fixture(t, [{ id: 55, body: renderCiComment(report), user: { type: 'Bot', login: 'github-actions[bot]' } }]);
    assert.equal((await publishCiComment(report, f.context)).status, 'unchanged'); assert.equal(f.writes.length, 0);
});
test('publisher skips stale and fork pull requests and rejects unrelated run reports', async t => {
    const f = await fixture(t, [], { ...pull, head: { ...pull.head, sha: 'd'.repeat(40) } });
    assert.equal((await publishCiComment(report, f.context)).status, 'skipped'); assert.equal(f.writes.length, 0);
    const fork = { ...f.context, event: { pull_request: { ...pull, head: { ...pull.head, repo: { full_name: 'fork/repo' } } } } };
    assert.equal((await publishCiComment(report, fork)).reason, 'fork pull request');
    await assert.rejects(() => publishCiComment({ ...report, runId: '124' }, f.context), /trusted run/);
    assert.equal(f.writes.length, 0);
});

test('GitHub failures retain bounded denial evidence without exposing credentials', async t => {
    const server = createServer((_req, res) => {
        res.writeHead(403, { 'content-type': 'application/json', 'x-github-request-id': 'request-123', 'x-accepted-github-permissions': 'pull_requests=write', 'retry-after': '60' });
        res.end(JSON.stringify({ message: 'Denied secret-token\n' + 'x'.repeat(1000) }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const client = githubClient({ token: 'secret-token', apiUrl: `http://127.0.0.1:${server.address().port}` });
    await assert.rejects(client.request('PATCH', '/comment', { body: 'private body' }), error => {
        assert.match(error.message, /HTTP 403.*Denied \[redacted\]/);
        assert.match(error.message, /x-github-request-id=request-123/);
        assert.match(error.message, /retry-after=60/);
        assert.match(error.message, /x-accepted-github-permissions=pull_requests=write/);
        assert(!error.message.includes('secret-token') && !error.message.includes('private body'));
        assert(!error.message.includes('\n') && error.message.length < 1000);
        return true;
    });
});
