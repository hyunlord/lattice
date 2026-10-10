import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const initialize = (protocolVersion = '2025-11-25') => ({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion, capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
const ready = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (id, name, args = {}) => ({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
async function exchange(messages) {
    const script = `import {runStdio} from ${JSON.stringify(new URL('../bin/mcp-protocol.mjs', import.meta.url).href)}; await runStdio(async (name,args) => { if(args.q === 'fail') throw new Error('SECRET_TOKEN'); await new Promise(resolve => setTimeout(resolve, 2)); return {name,args,label:'한글\\ntext'}; });`;
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const exit = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    const wire = messages.map(message => typeof message === 'string' ? message : JSON.stringify(message)).join('\n') + '\n';
    const bytes = Buffer.from(wire);
    for (let offset = 0; offset < bytes.length; offset += 7) child.stdin.write(bytes.subarray(offset, offset + 7));
    child.stdin.end();
    assert.equal(await exit, 0, stderr);
    assert.equal(stderr, '');
    return stdout.trim().split('\n').map(line => JSON.parse(line));
}

test('stdio frames fragmented requests, serves eleven tools, serializes calls and exits at EOF', async () => {
    const results = await exchange([initialize(), ready, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, call(3, 'lattice_find', { q: '한글' }), { jsonrpc: '2.0', id: 4, method: 'ping' }]);
    assert.deepEqual(results.map(result => result.id), [1, 2, 3, 4]);
    assert.equal(results[0].result.protocolVersion, '2025-11-25');
    assert.equal(results[1].result.tools.length, 11);
    assert.equal(results[1].result.tools[0].annotations.readOnlyHint, true);
    assert.equal(results[2].result.structuredContent.args.q, '한글');
    assert.deepEqual(JSON.parse(results[2].result.content[0].text), results[2].result.structuredContent);
    assert.deepEqual(results[3].result, {});
});

test('legacy negotiation strips newer output fields and modern discovery permits fallback', async () => {
    const results = await exchange([{ jsonrpc: '2.0', id: 0, method: 'server/discover' }, initialize('2024-11-05'), ready, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, call(3, 'lattice_overview')]);
    assert.equal(results[0].error.code, -32601);
    assert.equal(results[1].result.protocolVersion, '2024-11-05');
    assert.equal('annotations' in results[2].result.tools[0], false);
    assert.equal('structuredContent' in results[3].result, false);
    assert.equal(JSON.parse(results[3].result.content[0].text).name, 'lattice_overview');
    assert.equal((await exchange([initialize('2099-01-01')]))[0].result.protocolVersion, '2025-11-25');
    assert.equal((await exchange([initialize('2025-06-18')]))[0].result.protocolVersion, '2025-06-18');
});

test('protocol faults stay distinct from actionable tool errors without leaking handler secrets', async () => {
    const results = await exchange(['{', [], call(0, 'lattice_overview'), initialize(), ready, call(2, 'missing'), call(3, 'lattice_node'), call(4, 'lattice_find', { q: 'fail' }), { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'lattice_find', arguments: [] } }, { jsonrpc: '2.0', method: 'unknown/notification' }]);
    assert.deepEqual(results.slice(0, 3).map(result => result.error.code), [-32700, -32600, -32600]);
    assert.equal(results[4].error.code, -32602);
    assert.equal(results[5].result.isError, true);
    assert.match(results[5].result.content[0].text, /required/);
    assert.equal(results[6].result.isError, true);
    assert.doesNotMatch(JSON.stringify(results), /SECRET_TOKEN/);
    assert.equal(results[7].error.code, -32602);
    assert.equal(results.length, 8);
});
