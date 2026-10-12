import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';

async function modules() {
    const producer = await import('../bin/export-packs.mjs').catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
    assert.equal(typeof producer.createPackedExport, 'function', 'packed export producer exists');
    return { ...producer, ...await import('../viewer/packed-data.js') };
}
async function fixture(t) {
    const api = await modules(), directory = mkdtempSync(join(tmpdir(), 'lattice-packs-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const requests = []; let fail;
    const server = createServer((request, response) => {
        const path = new URL(request.url, 'http://fixture').pathname.slice(1); requests.push(path);
        try { const bytes = readFileSync(join(directory, path)); response.writeHead(200).end(fail === path ? Buffer.from('corrupt') : bytes); }
        catch (error) { if (error.code !== 'ENOENT') throw error; response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return { ...api, directory, requests, base: `http://127.0.0.1:${server.address().port}/`, fail: path => { fail = path; } };
}
test('packed HTTP transport shares records and reconstructs full provenance without eager reads', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const node = { id: 'a', sources: [{ path: 'a.ts', pointer: '', line: 1, contentHash: 'c', revision: 'rev' }], attributes: { literal: ['$ref', 0, 1] }, name: '한글😀' };
    const graph = { hash: 'one', repository: { commit: 'rev', sourceFingerprint: 'source', dirty: false }, nodes: [node], edges: [] };
    writer.json('graph.json', graph); writer.json('snapshots/old.json', { ...graph, hash: 'old' });
    writer.write('evidence/example.json', JSON.stringify(node.sources)); writer.finish();
    const loader = f.createPackedLoader(f.base);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(await loader.json('graph.json'), graph);
    assert.deepEqual(await loader.json('snapshots/old.json'), { ...graph, hash: 'old' });
    assert.equal(await loader.text('evidence/example.json'), JSON.stringify(node.sources));
    assert.equal(f.requests.some(path => path === 'evidence/example.json'), false);
    for (const file of readdirSync(join(f.directory, 'packs'))) {
        const bytes = readFileSync(join(f.directory, 'packs', file));
        assert.ok(bytes.length <= 262144); assert.ok(gunzipSync(bytes).length <= 262144);
    }
});
test('oversized Unicode records split into bounded packs and corrupt downloads remain retryable', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const value = { id: '__proto__', sources: [], text: '😀한글'.repeat(70000) };
    writer.json('large.json', value); writer.finish();
    const pack = `packs/${readdirSync(join(f.directory, 'packs'))[0]}`;
    f.fail(pack); const loader = f.createPackedLoader(f.base);
    await assert.rejects(loader.json('large.json'));
    f.fail(undefined); assert.deepEqual(await loader.json('large.json'), value);
    await assert.rejects(loader.json('../outside.json'), /path/i);
});
test('offline reconstruction retains distinct snapshot binding even when semantic graph hashes match', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const graph = { hash: 'same-semantic-hash', repository: { commit: 'current', sourceFingerprint: 'current-inputs', dirty: false }, lensDigest: 'lens', nodes: [{ id: 'same', sources: [{ path: 'a', line: 1, pointer: '', contentHash: 'source', revision: 'current' }] }] };
    const previous = { ...graph, repository: { commit: 'previous', sourceFingerprint: 'previous-inputs', dirty: false }, nodes: [{ ...graph.nodes[0], sources: [{ ...graph.nodes[0].sources[0], revision: 'previous' }] }] };
    writer.json('graph.json', graph); writer.json('snapshots/previous.json', previous); writer.finish();
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    assert.deepEqual(readPackedArtifact(f.directory, 'graph.json'), graph);
    assert.deepEqual(readPackedArtifact(f.directory, 'snapshots/previous.json'), previous);
    assert.deepEqual(await f.createPackedLoader(f.base).json('snapshots/previous.json'), previous);
});
test('publication rejects a missing persisted pack before exposing the transport manifest', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    writer.json('large.json', { text: Array.from({ length: 100000 }, (_, index) => `${index}한글`).join('') });
    const files = readdirSync(join(f.directory, 'packs')); assert.ok(files.length);
    rmSync(join(f.directory, 'packs', files[0]));
    assert.throws(() => writer.finish(), /ENOENT/);
    assert.throws(() => readFileSync(join(f.directory, 'transport.json')), /ENOENT/);
});
test('HTTP fallback SHA-256 matches platform hashing across padding boundaries and a full pack', async () => {
    const { packedHash } = await import('../viewer/packed-hash.js');
    const { createHash } = await import('node:crypto');
    for (const length of [0, 3, 55, 56, 63, 64, 65, 262144]) {
        const bytes = Uint8Array.from({ length }, (_, index) => (index * 71 + 19) % 256);
        assert.equal(packedHash(bytes), createHash('sha256').update(bytes).digest('hex'));
    }
});
test('legacy text artifacts retain original bytes for content-addressed evidence', async t => {
    const f = await fixture(t), original = '[\n  {"value": 1}\n]\n';
    writeFileSync(join(f.directory, 'legacy.json'), original);
    assert.equal(await f.createPackedLoader(f.base).text('legacy.json'), original);
});
