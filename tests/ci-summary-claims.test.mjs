import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { summarize } from '../examples/ci/openai-summary.mjs';

const source = { path: 'src/main.ts', contentHash: 'a'.repeat(64), line: 1, startLine: 1, endLine: 2, text: 'export function run() {}\n' };
const request = { schemaVersion: 1, targets: [{ id: 'module:src/main.ts', sources: [source] }] };
const citation = { path: source.path, contentHash: source.contentHash, startLine: 1, endLine: 1, excerpt: 'export function run() {}' };
async function responseFor(claims, operation) {
    let body;
    const server = createServer(async (incoming, response) => {
        let raw = ''; for await (const chunk of incoming) raw += chunk;
        body = JSON.parse(raw);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summaries: [{ targetId: request.targets[0].id, claims }] }) }] }] }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const environment = { OPENAI_API_KEY: 'fixture-only', LATTICE_SUMMARY_MODEL: 'fixture-model', LATTICE_SUMMARY_ENDPOINT: `http://127.0.0.1:${server.address().port}` };
    try { await operation(environment, () => body); }
    finally { await new Promise(resolve => server.close(resolve)); }
}
test('external producer requests per-claim citations and preserves only explicitly cited evidence', async () => {
    const claims = [{ text: 'Exports run.', citations: [citation] }];
    await responseFor(claims, async (environment, received) => {
        const result = await summarize(request, environment);
        assert.deepEqual(result[0].claims, claims);
        assert.equal(result[0].summary, 'Exports run.');
        assert.match(received().instructions, /semantic truth/);
        assert.deepEqual(received().text.format.schema.properties.summaries.items.required, ['targetId', 'claims']);
    });
});
for (const [name, changes] of [['unknown path', { path: 'secret.ts' }], ['wrong hash', { contentHash: 'b'.repeat(64) }], ['unknown range', { endLine: 3 }], ['wrong excerpt', { excerpt: 'invented' }]]) {
    test(`external producer rejects ${name}`, async () => {
        await responseFor([{ text: 'Exports run.', citations: [{ ...citation, ...changes }] }], async environment => {
            await assert.rejects(summarize(request, environment), /citation/);
        });
    });
}
test('external producer rejects uncited prose and permits explicit abstention', async () => {
    await responseFor([{ text: 'Invented role.', citations: [] }], async environment => {
        await assert.rejects(summarize(request, environment), /citation/);
    });
    await responseFor([], async environment => {
        assert.deepEqual((await summarize(request, environment))[0].claims, []);
    });
});
test('external producer never uses ambient credentials when none are explicitly provided', async () => {
    await assert.rejects(summarize(request, {}), /required/);
});
