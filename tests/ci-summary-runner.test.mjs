import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('../examples/ci/openai-summary.mjs', import.meta.url));
const request = { schemaVersion: 1, targets: [{ id: 'module:src/main.ts', kind: 'module', name: 'main', sources: [{ path: 'src/main.ts', contentHash: 'a'.repeat(64), line: 2, text: 'export function run() { return 7; }' }] }] };
async function invoke(endpoint) {
    const child = spawn(process.execPath, [runner], { env: { ...process.env, OPENAI_API_KEY: 'mock-only-key', LATTICE_SUMMARY_MODEL: 'test-model', LATTICE_SUMMARY_ENDPOINT: endpoint }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    child.stdin.end(JSON.stringify(request));
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
    return { code, stdout, stderr };
}
async function serve(handler, operation) {
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try { return await operation(`http://127.0.0.1:${server.address().port}/v1/responses`); }
    finally { await new Promise(resolve => server.close(resolve)); }
}
test('external CI runner sends changed source evidence and binds summaries to original hashes', async () => {
    let received;
    const result = await serve(async (incoming, response) => {
        let raw = ''; for await (const chunk of incoming) raw += chunk;
        received = { body: JSON.parse(raw), authorization: incoming.headers.authorization, path: incoming.url };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ summaries: [{ targetId: request.targets[0].id, summary: 'Provides the application entry function.' }] }) }] }] }));
    }, invoke);
    assert.equal(result.code, 0);
    assert.equal(received.path, '/v1/responses'); assert.equal(received.authorization, 'Bearer mock-only-key');
    assert.equal(received.body.store, false); assert.equal(received.body.text.format.strict, true);
    assert.deepEqual(JSON.parse(received.body.input), request.targets);
    assert.deepEqual(JSON.parse(result.stdout), [{ schemaVersion: 1, targetId: request.targets[0].id, summary: 'Provides the application entry function.', author: 'OpenAI:test-model', sources: [{ path: 'src/main.ts', contentHash: 'a'.repeat(64), line: 2 }] }]);
});
test('provider errors never echo response text or credentials', async () => {
    const result = await serve((_incoming, response) => { response.writeHead(429); response.end('private provider text mock-only-key'); }, invoke);
    assert.equal(result.code, 1); assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /mock-only-key|private provider text/u);
});
