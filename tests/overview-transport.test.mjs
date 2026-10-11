import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
test('static overview transport exists before fetching the canonical graph', async () => {
    assert.ok(existsSync(new URL('../bin/export-overview.mjs', import.meta.url)), 'overview writer must be built');
    const { writeOverview } = await import('../bin/export-overview.mjs');
    const graph = { schemaVersion: 1, hash: 'b'.repeat(64), repository: { name: 'sample', commit: 'a'.repeat(40), dirty: false, sourceFingerprint: 'c'.repeat(64) }, nodes: [], edges: [], facets: [], findings: [], views: [] };
    const files = new Map(); writeOverview(graph, { kinds: [] }, (path, text) => files.set(path, text));
    const overview = JSON.parse(files.get('overview.json'));
    assert.equal(overview.hash, graph.hash); assert.deepEqual(overview.repository, graph.repository);
    assert.equal(overview.schemaVersion, 1); assert.equal(overview.layers.length, 1);
    assert.ok(overview.layers[0].model); assert.equal(files.has('graph.json'), false);
});
test('overview preserves curated layers and exact model while deferring structural node metadata', async () => {
    const { writeOverview } = await import('../bin/export-overview.mjs');
    const { parseOverview } = await import('../viewer/overview-data.js');
    const source = { path: 'src/main.ts', line: 1, pointer: '', contentHash: 'a'.repeat(64) };
    const graph = { hash: 'b'.repeat(64), repository: { name: 'example', dirty: false, sourceFingerprint: 'c'.repeat(64) }, nodes: [{ id: 'n', kind: 'module', name: 'main', attributes: {}, sources: [source], contentHash: 'a'.repeat(64) }], edges: [], facets: [] };
    const before = JSON.stringify(graph), files = new Map(); writeOverview(graph, { kinds: [] }, (path, text) => files.set(path, text));
    const overview = parseOverview(JSON.parse(files.get('overview.json'))), layer = overview.layers[0], complete = JSON.parse(files.get(layer.path));
    assert.equal(JSON.stringify(graph), before); assert.equal(layer.deferred, true); assert.deepEqual(layer.model.nodes, []);
    assert.equal(complete.model.nodes.length, 1); assert.deepEqual(layer.model.stages.map(s => s.nodeIds), complete.model.stages.map(s => s.nodeIds));
    graph.nodes[0].attributes.layer = 'design'; graph.nodes[0].kind = 'object';
    writeOverview(graph, { kinds: [{ id: 'object', label: 'Object' }], defaultLayer: 'design', loop: { stages: [{ id: 'one', title: 'One', summary: 'Role', unit: 'items', kinds: ['object'], systemIds: [] }], flows: [], catalogKinds: ['object'] } }, (path, text) => files.set(path, text));
    const curated = parseOverview(JSON.parse(files.get('overview.json')));
    assert.equal(curated.defaultLayer, 'design'); assert.equal(curated.layers[0].deferred, false); assert.equal(curated.layers[0].model.nodes.length, 1);
});
test('overview loader only falls back for old export 404 and retries source-bound model failure', async t => {
    const { writeOverview } = await import('../bin/export-overview.mjs');
    const { createOverviewLoader } = await import('../viewer/overview-data.js');
    const files = new Map(), graph = { hash: 'd'.repeat(64), repository: { name: 'sample', dirty: false, sourceFingerprint: 'c'.repeat(64) }, nodes: [], edges: [], facets: [] };
    writeOverview(graph, {}, (path, text) => files.set(path, text));
    let status = 503; const requests = [];
    t.mock.method(globalThis, 'fetch', async url => { requests.push(url); return new Response(files.get(String(url).slice(2).split('?')[0]), { status }); });
    const loader = createOverviewLoader('?generation=3');
    await assert.rejects(loader.read(), /503/); status = 404; assert.equal(await loader.read(), undefined);
    status = 200; const overview = await loader.read(); assert.equal(requests.length, 3); assert.equal(requests.some(path => path.includes('graph.json')), false);
    const layer = overview.layers[0], original = files.get(layer.path); files.set(layer.path, original.replace(graph.hash, 'wrong'));
    await assert.rejects(loader.model(overview, layer), /소스가 다릅니다/);
    files.set(layer.path, original); const [one, two] = await Promise.all([loader.model(overview, layer), loader.model(overview, layer)]); assert.deepEqual(one, two); assert.equal(requests.length, 5);
    assert.ok(requests.every(url => url.endsWith('?generation=3')));
});
test('unsupported-language counts are source-bound first-screen limitations', async () => {
    const { writeOverview } = await import('../bin/export-overview.mjs');
    const { parseOverview } = await import('../viewer/overview-data.js');
    const files = new Map(), graph = { hash: 'e'.repeat(64), repository: { name: 'source', dirty: false, sourceFingerprint: 'f'.repeat(64) }, nodes: [], edges: [], facets: [] };
    writeOverview(graph, { inputDiagnostics: [{ code: 'unsupported-language', language: 'c', fileCount: 17 }, { code: 'other', language: 'cpp', fileCount: 4 }] }, (path, text) => files.set(path, text));
    assert.deepEqual(parseOverview(JSON.parse(files.get('overview.json'))).limitations, [{ language: 'c', fileCount: 17 }]);
});
