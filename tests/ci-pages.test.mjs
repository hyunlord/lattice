import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { checkPages, PagesCheckError } from '../bin/ci-pages.mjs';
async function fixture(t, status) {
    const requests = [];
    const server = createServer((request, response) => {
        requests.push({ method: request.method, path: request.url, authorization: request.headers.authorization });
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ message: 'sensitive remote body must not be printed' }));
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
test('Pages permission error stays a visible failure without echoing response body or token', async t => {
    const f = await fixture(t, 403);
    await assert.rejects(checkPages(f.context), error => error instanceof PagesCheckError && error.message === 'GitHub Pages availability check failed with HTTP 403');
    assert.equal(f.requests.length, 1);
});
