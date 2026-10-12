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
test('structured detail records preserve oversized values and lazy ordered provenance inside bounded packs', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const { writeNodeDetails } = await import('../bin/export-details.mjs');
    const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js');
    const { deferredSources } = await import('../viewer/source-groups.js');
    const repository = { name: 'fixture', commit: 'current', dirty: false, sourceFingerprint: 'inputs' };
    const source = { path: 'a.ts', line: 1, pointer: '', contentHash: 'a'.repeat(64), revision: 'current' };
    const node = { id: 'a', kind: 'item', name: 'A', contentHash: 'b'.repeat(64), attributes: { large: '한글😀'.repeat(80000) }, sources: [source] };
    const sources = Array.from({ length: 260 }, (_, i) => ({ ...source, line: i + 1 }));
    const graph = { schemaVersion: 1, hash: 'graph', repository, nodes: [node], edges: [{ id: 'edge', kind: 'uses', source: 'a', target: 'a', directed: true, field: '', sources }], facets: [], findings: [], views: [], lensDigest: null };
    const structured = [];
    writeNodeDetails(graph, writer.write, 'details', {}, { json: (path, value) => { if (value.records) structured.push(...Object.values(value.records)); writer.json(path, value); }, reference: writer.reference }); writer.finish();
    assert.ok(structured.some(value => Array.isArray(value) && value.some(row => Array.isArray(row) && row[0] === 0 && row[1] === 'a')), 'lookup rows reuse canonical IDs instead of prefixed duplicate strings');
    const nativeFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', (path, init) => nativeFetch(String(path).startsWith('./') ? f.base + String(path).slice(2) : path, init));
    const loader = createNodeDetailLoader({ hash: graph.hash, repository }), index = await loader.index();
    assert.equal(index.detailVersion, 2);
    const record = await loader.node(index, 'a'); assert.deepEqual(record.graph.nodes[0], node);
    const { nodeIdentity } = await import('../dist/query/history-model.js');
    assert.deepEqual((await loader.node(index, nodeIdentity(node), true)).graph.nodes[0], node);
    assert.ok(Number.isSafeInteger(record.relations.outgoing.pages[0].record), 'structured detail references use bound numeric record ordinals');
    const page = await loader.page(index, record.relations.outgoing, 0), group = deferredSources(page.edges[0].sources)[0];
    assert.equal(group.count, sources.length);
    assert.ok(group.pages.every(path => path.startsWith('records/')));
    const { readEvidencePage } = await import('../viewer/evidence.js');
    const evidence = []; for (const path of group.pages) evidence.push(...await readEvidencePage(path));
    await assert.rejects(readEvidencePage(group.pages[0].replace(/[a-f0-9]{64}\.json$/u, '0'.repeat(64) + '.json')), /해시/);
    assert.deepEqual(evidence, sources);
    assert.ok(!f.requests.includes('graph.json'));
    for (const file of readdirSync(join(f.directory, 'packs'))) { const bytes = readFileSync(join(f.directory, 'packs', file)); assert.ok(bytes.length <= 262144); assert.ok(gunzipSync(bytes).length <= 262144); }
});
test('lookup indexes are gzip bounded and corruption remains retryable', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    writer.json('one.json', { answer: 42 }); writer.finish();
    const manifest = JSON.parse(readFileSync(join(f.directory, 'transport.json')));
    assert.equal(manifest.indexEncoding, 'gzip');
    const index = 'transport/' + readdirSync(join(f.directory, 'transport')).find(path => path.startsWith('files-') && path.endsWith('.gz'));
    const bytes = readFileSync(join(f.directory, index)); assert.ok(bytes.length <= 262144); assert.ok(gunzipSync(bytes).length <= 262144);
    f.fail('transport/packs-0.json.gz'); const loader = f.createPackedLoader(f.base);
    await assert.rejects(loader.json('one.json')); f.fail(undefined); assert.deepEqual(await loader.json('one.json'), { answer: 42 });
});
test('large containers stream through chunks while preserving own keys and complete order', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const entries = Array.from({ length: 4097 }, (_, i) => [`key-${i}`, { id: `record-${i}`, sources: [], value: i }]);
    const value = { array: entries.map(([, value]) => value), object: Object.fromEntries([...entries, ['__proto__', { preserved: true }]]) };
    writer.json('containers.json', value); writer.finish();
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    assert.deepEqual(readPackedArtifact(f.directory, 'containers.json'), value);
    assert.deepEqual(await f.createPackedLoader(f.base).json('containers.json'), value);
});
test('canonical bodies are shared across full records and lazy field projections', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const node = { id: 'shared', name: 'shared name', contentHash: 'same', attributes: { documentation: Array.from({ length: 80000 }, (_, i) => `attribute-${i}`).join(' ') }, sources: Array.from({ length: 2000 }, (_, i) => ({ path: `source-${i}.ts`, contentHash: String(i), line: i + 1 })) };
    const thin = { ...node, attributes: {}, sources: [] };
    const edge = { id: 'edge-body', attributes: { note: 'stable-attribute-marker-' + 'x'.repeat(500) }, sources: node.sources };
    writer.json('edge.json', edge); writer.json('edge-thin.json', { ...edge, sources: [] });
    writer.json('full.json', node); writer.json('thin.json', thin); writer.finish();
    const encoded = readdirSync(join(f.directory, 'packs')).flatMap(path => JSON.parse(gunzipSync(readFileSync(join(f.directory, 'packs', path)))));
    assert.equal(JSON.stringify(encoded).split('stable-attribute-marker-').length - 1, 1, 'source overrides preserve one stored attribute body');
    const bodies = encoded.filter(value => Array.isArray(value) && value[0] === 'o' && value[1].some(entry => entry[0] === 'id' && entry[1] === 'shared'));
    assert.equal(bodies.length, 1, 'full and thin records share one stable body');
    assert.ok(bodies[0][1].every(entry => entry[0] !== 'sources' && entry[0] !== 'attributes'));
    assert.deepEqual(await f.createPackedLoader(f.base).json('thin.json'), thin);
    const thinPacks = f.requests.filter(path => path.startsWith('packs/')).length;
    assert.ok(thinPacks < readdirSync(join(f.directory, 'packs')).length, 'thin projection does not fetch large excluded fields');
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    assert.deepEqual(readPackedArtifact(f.directory, 'full.json'), node);
});
test('generation-local direct records avoid redundant file indexes while retaining integrity and retries', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    assert.equal(typeof writer.reference, 'function');
    const value = [{ path: 'a.ts', line: 1, pointer: '', contentHash: 'hash', revision: 'current' }];
    const path = writer.reference(value, 'evidence-page');
    assert.throws(() => writer.json(path, { wrong: true }), /Reserved/); writer.finish();
    const manifest = JSON.parse(readFileSync(join(f.directory, 'transport.json')));
    assert.equal(manifest.fileCount, 0);
    assert.match(path, /^records\/\d+\/\d+\/evidence-page\.json$/u);
    const pack = `packs/${readdirSync(join(f.directory, 'packs'))[0]}`;
    f.fail(pack); const loader = f.createPackedLoader(f.base); await assert.rejects(loader.json(path));
    f.fail(undefined); assert.deepEqual(await loader.json(path), value);
    assert.ok(!f.requests.some(path => path.startsWith('transport/files-')));
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    assert.deepEqual(readPackedArtifact(f.directory, path), value);
    await assert.rejects(loader.json('records/999999/0/evidence-page.json'));
});
test('packed logic records use direct addresses with paged query parity and source binding', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const { writeLogic } = await import('../bin/export-logic.mjs');
    const { createLogicProvider } = await import('../viewer/logic-data.js');
    const { logicCalls } = await import('../dist/query/logic-model.js');
    const source = { path: 'main.ts', line: 1, pointer: '', contentHash: 'source' }, repository = { name: 'fixture', commit: 'current', dirty: false, sourceFingerprint: 'inputs' };
    const nodes = Array.from({ length: 202 }, (_, i) => ({ id: `fn-${i}`, kind: 'function', name: `fn-${i}`, attributes: { entrypoints: [{ category: 'executable', rule: 'main', source }] }, sources: [source], contentHash: String(i) }));
    const graph = { schemaVersion: 1, hash: 'graph', repository, nodes, edges: nodes.slice(1).map(node => ({ id: `edge-${node.id}`, kind: 'calls', source: 'fn-0', target: node.id, directed: true, field: '', attributes: { resolution: 'exact' }, sources: [source] })), facets: [], findings: [], views: [] };
    let direct = 0; writeLogic(graph, writer.write, { reference: (...args) => { direct++; return writer.reference(...args); } }); writer.finish();
    assert.ok(direct > nodes.length);
    const nativeFetch = globalThis.fetch; t.mock.method(globalThis, 'fetch', (path, init) => nativeFetch(String(path).startsWith('./') ? f.base + String(path).slice(2) : path, init));
    const provider = createLogicProvider(graph.hash, '', repository), options = { id: 'fn-0', direction: 'out', offset: 100, limit: 100 };
    assert.deepEqual(await provider.calls(options), logicCalls(graph, options));
    await assert.rejects(createLogicProvider(graph.hash, '', { ...repository, commit: 'wrong' }).calls(options), /소스/);
    assert.ok(!f.requests.includes('graph.json'));
});
test('declared identifiers share one scalar across canonical records, endpoints and lookup keys', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory), id = 'canonical-record-'.repeat(10);
    assert.equal(typeof writer.identifiers, 'function'); writer.identifiers([{ id }]);
    const value = { nodes: [{ id, attributes: {}, sources: [] }], edges: [{ id: 'edge', source: id, target: id }], mapping: { [id]: { record: 0 } } };
    writer.json('identifiers.json', value); writer.finish();
    const encoded = readdirSync(join(f.directory, 'packs')).flatMap(path => JSON.parse(gunzipSync(readFileSync(join(f.directory, 'packs', path)))));
    assert.equal(JSON.stringify(encoded).split(id).length - 1, 1);
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    assert.deepEqual(readPackedArtifact(f.directory, 'identifiers.json'), value);
    assert.deepEqual(await f.createPackedLoader(f.base).json('identifiers.json'), value);
});
test('compact detail lookup preserves original identity and layer isolation and rejects malformed rows', async t => {
    const f = await fixture(t), files = new Map();
    const { mkdirSync } = await import('node:fs'); const { dirname } = await import('node:path');
    const { writeNodeDetails } = await import('../bin/export-details.mjs');
    const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js');
    const { nodeIdentity } = await import('../dist/query/history-model.js');
    const repository = { name: 'fixture', commit: 'old', dirty: false, sourceFingerprint: 'old-input' };
    const node = { id: 'versioned-id', name: 'Original', kind: 'item', contentHash: 'hash', attributes: { originalId: 'stable-id', layer: 'product' }, sources: [] };
    const graph = { schemaVersion: 1, hash: 'graph', repository, nodes: [node], edges: [], facets: [], findings: [], views: [], lensDigest: null };
    writeNodeDetails(graph, (path, text) => files.set(path, JSON.parse(text)), 'details', {}, { json: (path, value) => files.set(path, value) });
    const persist = () => { for (const [path, value] of files) { mkdirSync(dirname(join(f.directory, path)), { recursive: true }); writeFileSync(join(f.directory, path), JSON.stringify(value)); } }; persist();
    const nativeFetch = globalThis.fetch; t.mock.method(globalThis, 'fetch', (path, init) => nativeFetch(String(path).startsWith('./') ? f.base + String(path).slice(2) : path, init));
    const loader = createNodeDetailLoader({ hash: graph.hash, repository }), index = await loader.index();
    assert.deepEqual((await loader.node(index, nodeIdentity(node), true)).graph.nodes[0], node);
    assert.equal(await loader.node(index, nodeIdentity({ ...node, attributes: { ...node.attributes, layer: 'other' } }), true), undefined);
    assert.equal(await loader.node(index, 'unknown'), undefined);
    const packet = [...files.values()].find(value => value.records && Object.values(value.records).some(value => Array.isArray(value) && value.some(row => row[0] === 0 && row[1] === node.id)));
    const rows = Object.values(packet.records).find(value => Array.isArray(value) && value.some(row => row[0] === 0 && row[1] === node.id)), row = rows.find(row => row[0] === 0 && row[1] === node.id);
    row[0] = 99; persist();
    const retry = createNodeDetailLoader({ hash: graph.hash, repository });
    await assert.rejects(retry.node(await retry.index(), node.id), /compact detail key/);
    row[0] = 0; persist(); assert.deepEqual((await retry.node(await retry.index(), node.id)).graph.nodes[0], node);
});
test('JSON-looking strings remain byte-exact and preserve recomputed canonical graph hashes', async t => {
    const f = await fixture(t), writer = f.createPackedExport(f.directory);
    const { createGraph } = await import('../dist/index.js'); const { digest } = await import('../bin/storage.mjs');
    const literal = JSON.stringify({ id: 'x', attributes: { note: 'x'.repeat(150) }, name: 'X', sources: [] });
    const graph = createGraph({ repository: { name: 'fixture', dirty: false, sourceFingerprint: 'a'.repeat(64) }, nodes: [{ id: 'node', kind: 'item', name: 'Node', attributes: { literal }, sources: [] }], edges: [], facets: [], findings: [], views: [], inputs: [], snapshots: [], adapterVersions: {}, lensDigest: null }, digest);
    writer.json('graph.json', graph); writer.finish();
    const { readPackedArtifact } = await import('../bin/packed-reader.mjs');
    for (const result of [readPackedArtifact(f.directory, 'graph.json'), await f.createPackedLoader(f.base).json('graph.json')]) {
        assert.equal(result.nodes[0].attributes.literal, literal);
        assert.equal(createGraph(result, digest).hash, graph.hash);
    }
});
