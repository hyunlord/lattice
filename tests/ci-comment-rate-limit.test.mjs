import assert from 'node:assert/strict';
import test from 'node:test';
import { commentClient, CommentRateLimitError } from '../bin/ci-comment-rate-limit.mjs';
import { GithubApiError } from '../bin/ci-github.mjs';

test('comment retry uses 1s and 2s delays and returns a recovered response', async () => {
    const delays = []; let attempts = 0;
    const client = commentClient({ async request() { attempts++; if (attempts < 3) throw new GithubApiError('HTTP 429', true); return { id: 1 }; } }, async ms => delays.push(ms));
    assert.deepEqual(await client.request('POST', '/comment'), { id: 1 });
    assert.deepEqual(delays, [1000, 2000]); assert.equal(attempts, 3);
});
test('comment retry exhausts exactly three requests', async () => {
    const delays = []; let attempts = 0;
    const client = commentClient({ async request() { attempts++; throw new GithubApiError('HTTP 403 rate limit', true); } }, async ms => delays.push(ms));
    await assert.rejects(client.request('PATCH', '/comment'), CommentRateLimitError);
    assert.deepEqual(delays, [1000, 2000]); assert.equal(attempts, 3);
});
for (const error of [new GithubApiError('HTTP 403 denied', false), new SyntaxError('invalid JSON'), new Error('network failed')]) {
    test(`comment retry preserves ${error.message}`, async () => {
        let attempts = 0;
        const client = commentClient({ async request() { attempts++; throw error; } }, async () => assert.fail('must not wait'));
        await assert.rejects(client.request('GET', '/comment'), error); assert.equal(attempts, 1);
    });
}
