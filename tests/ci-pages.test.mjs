import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { checkPages, PagesCheckError } from '../bin/ci-pages.mjs';
async function fixture(t, status, body = JSON.stringify({ message: 'Resource not accessible by integration' }), headers = {}) {
    const requests = [];
    const server = createServer((request, response) => {
        requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization });
        response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
        response.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    return { requests, context: { token: 'fixture-token', repository: 'example/project', apiUrl: `http://127.0.0.1:${server.address().port}` } };
}
test('Pages check observes an enabled site using authenticated GET only', async t => {
    const f = await fixture(t, 200);
    const result = await checkPages(f.context);
    assert.equal(result.available, true);
    assert.deepEqual(f.requests, [{ method: 'GET', path: '/repos/example/project/pages', authorization: 'Bearer fixture-token' }]);
});
test('Pages 404 leaves settings untouched and explicitly points to artifact fallback', async t => {
    const f = await fixture(t, 404);
    const result = await checkPages(f.context);
    assert.equal(result.available, false);
    assert.match(result.notice, /workflow artifacts/);
    assert.deepEqual(f.requests.map(request => request.method), ['GET']);
});
test('Pages permission error includes the remote reason and remains a single failed request', async t => {
    const f = await fixture(t, 403);
    await assert.rejects(checkPages(f.context), error => error instanceof PagesCheckError && error.message.includes('HTTP 403') && error.message.includes('Resource not accessible by integration'));
    assert.equal(f.requests.length, 1);
});

const diagnosticHeaders = {
    'x-github-request-id': 'ABC:123', 'x-accepted-github-permissions': 'pages=read',
    'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '0', 'x-ratelimit-used': '5000',
    'x-ratelimit-reset': '1800000000', 'x-ratelimit-resource': 'core', 'retry-after': '60',
    authorization: 'Bearer separate-response-credential', 'set-cookie': 'secret-cookie',
};
test('Pages CLI stderr exposes 403 reason, docs and allowlisted headers while removing credentials', async t => {
    const f = await fixture(t, 403, JSON.stringify({
        message: 'Resource not accessible by integration; fixture-token; Bearer different-credential; Authorization: Basic other-credential',
        documentation_url: 'https://docs.github.com/rest/pages',
        token: 'private-extra-json-field',
    }), diagnosticHeaders);
    await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('../bin/ci-pages.mjs', import.meta.url))], {
        env: { ...process.env, GITHUB_TOKEN: f.context.token, GITHUB_REPOSITORY: f.context.repository, GITHUB_API_URL: f.context.apiUrl, GITHUB_OUTPUT: '' },
    }), error => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /HTTP 403.*Resource not accessible by integration/s);
        assert.match(error.stderr, /https:\/\/docs.github.com\/rest\/pages/);
        for (const [name, value] of Object.entries(diagnosticHeaders).slice(0, 8)) assert.ok(error.stderr.includes(`${name}=${value}`));
        for (const secret of ['fixture-token', 'different-credential', 'other-credential', 'separate-response-credential', 'private-extra-json-field', 'secret-cookie']) assert.ok(!error.stderr.includes(secret));
        return true;
    });
    assert.equal(f.requests.length, 1);
});
test('Pages JSON and non-JSON rendered body are limited to 1024 UTF-8 bytes after redaction', async t => {
    for (const body of [JSON.stringify({ message: '설명😀'.repeat(500), documentation_url: 'https://docs.github.com/' }), 'upstream gateway: fixture-token Authorization: custom unrelated-credential\n' + '오류😀'.repeat(500)]) {
        const f = await fixture(t, 502, body);
        await assert.rejects(checkPages(f.context), error => {
            assert.ok(error instanceof PagesCheckError);
            const rendered = error.message.split('\nBody: ')[1];
            assert.ok(rendered);
            assert.ok(Buffer.byteLength(rendered, 'utf8') <= 1024);
            assert.ok(!rendered.includes('fixture-token'));
            assert.ok(!rendered.includes('unrelated-credential'));
            assert.ok(!rendered.includes('�'));
            return true;
        });
    }
});
test('Pages oversized response is discarded rather than leaking a credential cut at the read boundary', async t => {
    const f = await fixture(t, 500, 'x'.repeat(65530) + 'fixture-token');
    await assert.rejects(checkPages(f.context), error => /body omitted/i.test(error.message) && !error.message.includes('fixture-'));
});
test('Pages diagnostics redact nested authorization echoes and credentials in allowlisted headers before truncation', async t => {
    const f = await fixture(t, 403, JSON.stringify({
        message: 'Denied: {"Authorization":"custom nested-credential with spaces"}',
        documentation_url: 'https://docs.github.com/?token=other-url-credential',
    }), {
        'x-github-request-id': 'fixture-token',
        'x-accepted-github-permissions': 'pages=read; Authorization="custom header-credential"',
        'retry-after': 'Bearer distinct-header-credential',
        'x-ratelimit-resource': 'ghp_distinctgithubcredential',
    });
    await assert.rejects(checkPages(f.context), error => {
        for (const secret of ['nested-credential', 'with spaces', 'other-url-credential', 'fixture-token', 'header-credential', 'ghp_distinctgithubcredential']) assert.ok(!error.message.includes(secret));
        assert.match(error.message, /pages=read/);
        return true;
    });
    const boundary = await fixture(t, 403, 'x'.repeat(1015) + 'fixture-token');
    await assert.rejects(checkPages(boundary.context), error => !error.message.includes('fixture-') && Buffer.byteLength(error.message.split('\nBody: ')[1]) <= 1024);
});
