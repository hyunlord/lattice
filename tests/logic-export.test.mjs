import test from 'node:test';
import assert from 'node:assert/strict';
import * as exporter from '../bin/export-logic.mjs';
import { logicEntrypoints } from '../dist/query/logic-model.js';
const source = { path: 'main.ts', line: 1, pointer: '', contentHash: 's' };
const node = (id) => ({ id, kind: 'function', name: id, attributes: { entrypoints: [{ category: 'executable', rule: 'main', source }] }, sources: [source], contentHash: id });
const graph = { schemaVersion: 1, hash: 'g', repository: { name: 'fixture', dirty: false, sourceFingerprint: 's' }, nodes: [node('a'), node('b')], edges: [{ id: 'ab', kind: 'calls', source: 'a', target: 'b', directed: true, field: '', attributes: { resolution: 'exact' }, sources: [source] }], facets: [], findings: [], views: [], snapshots: [], inputs: [], adapterVersions: {}, lensDigest: null };
test('logic export writes bounded source-bound entrypoints and adjacent call pages', () => {
    assert.equal(typeof exporter.writeLogic, 'function');
    const files = new Map(); exporter.writeLogic(graph, (path, text) => files.set(path, JSON.parse(text)));
    const index = files.get('logic/index.json'); assert.equal(index.graphHash, 'g'); assert.equal(index.entrypointCount, 2);
    const canonicalEntries = logicEntrypoints(graph).items;
    assert.deepEqual(canonicalEntries.map(item => item.node.id), ['a', 'b'], 'execution entries prefer outgoing exact calls');
    assert.deepEqual(files.get('logic/entrypoints/0.json').items, canonicalEntries);
    const directory = [...files.entries()].find(([path, data]) => path.startsWith('logic/lookup/') && data.records?.a)?.[1];
    assert.ok(directory); const detail = files.get(directory.records.a);
    assert.equal(detail.outgoing.total, 1); assert.deepEqual(detail.outgoing.items[0].sources, [source]); assert.equal(detail.incoming.total, 0);
});

test('lazy client reads real HTTP pages, preserves query results and retries hash mismatches', async () => {
    const { createServer } = await import('node:http');
    const { createLogicProvider } = await import('../viewer/logic-data.js');
    const { logicCalls, logicFlow, logicEntrypoints } = await import('../dist/query/logic-model.js');
    const files = new Map(); exporter.writeLogic(graph, (path, text) => files.set('/' + path, text));
    const requested = []; let mismatch = true;
    const server = createServer((request, response) => { requested.push(request.url); const body = files.get(request.url); if (!body) { response.writeHead(404).end(); return; } response.setHeader('content-type', 'application/json'); response.end(mismatch ? body.replace('"graphHash":"g"', '"graphHash":"stale"') : body); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const original = globalThis.fetch, port = server.address().port;
    globalThis.fetch = (url, options) => original(new URL(String(url), `http://127.0.0.1:${port}/`), options);
    try {
        const provider = createLogicProvider('g'); assert.equal(requested.length, 0);
        await assert.rejects(provider.entrypoints(), /출처/); mismatch = false;
        assert.deepEqual(await provider.entrypoints(), logicEntrypoints(graph));
        assert.deepEqual(await provider.calls({ id: 'a' }), logicCalls(graph, { id: 'a' }));
        assert.deepEqual(await provider.flow({ id: 'a' }), logicFlow(graph, { id: 'a' }));
        assert.equal(provider.name('b'), 'b'); assert.equal(requested.includes('/graph.json'), false);
        await assert.rejects(provider.calls({ id: 'unknown' }), /ID/);
    } finally { globalThis.fetch = original; await new Promise(resolve => server.close(resolve)); }
});

test('lazy client crosses page boundaries and preserves exact static flow budgets', async () => {
    const { createServer } = await import('node:http');
    const { createLogicProvider } = await import('../viewer/logic-data.js');
    const { logicCalls, logicFlow, logicEntrypoints } = await import('../dist/query/logic-model.js');
    const nodes = Array.from({ length: 131 }, (_, i) => node(`f${String(i).padStart(3, '0')}`));
    const edges = nodes.slice(1).map((item, i) => ({ ...graph.edges[0], id: `e${String(i).padStart(3, '0')}`, source: nodes[0].id, target: item.id, attributes: { resolution: i % 3 ? 'exact' : 'estimated' } }));
    const large = { ...graph, nodes, edges }; const files = new Map(); exporter.writeLogic(large, (path, text) => files.set('/' + path, text));
    const requested = []; const server = createServer((request, response) => { requested.push(request.url); const body = files.get(request.url); response.writeHead(body ? 200 : 404, { 'content-type': 'application/json' }).end(body ?? '{}'); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const original = globalThis.fetch, port = server.address().port;
    globalThis.fetch = (url, options) => original(new URL(String(url), `http://127.0.0.1:${port}/`), options);
    try {
        const provider = createLogicProvider('g');
        assert.deepEqual(await provider.entrypoints({ offset: 99, limit: 3 }), logicEntrypoints(large, { offset: 99, limit: 3 }));
        const options = { id: 'f000', offset: 99, limit: 3, includeEstimated: true };
        assert.deepEqual(await provider.calls(options), logicCalls(large, options));
        const flow = { id: 'f000', depth: 3, maxNodes: 3, maxEdges: 2 };
        assert.deepEqual(await provider.flow(flow), logicFlow(large, flow));
        assert.equal(requested.includes('/graph.json'), false);
        assert.ok(requested.length < 20);
    } finally { globalThis.fetch = original; await new Promise(resolve => server.close(resolve)); }
});

test('lazy flow does not spend accepted-edge budget on rejected target nodes', async () => {
    const { createLogicProvider } = await import('../viewer/logic-data.js');
    const { logicFlow } = await import('../dist/query/logic-model.js');
    const edges = [['a', 'b'], ['a', 'c'], ['a', 'd'], ['b', 'a']].map(([source, target], index) => ({ ...graph.edges[0], id: String(index), source, target }));
    const fixture = { ...graph, nodes: ['a', 'b', 'c', 'd'].map(node), edges };
    const files = new Map(); exporter.writeLogic(fixture, (path, text) => files.set('./' + path, text));
    const original = globalThis.fetch;
    globalThis.fetch = async url => new Response(files.get(String(url)) ?? '{}', { status: files.has(String(url)) ? 200 : 404 });
    try {
        const options = { id: 'a', depth: 3, maxNodes: 2, maxEdges: 2 };
        const expected = logicFlow(fixture, options);
        assert.deepEqual(expected.edges.map(edge => edge.id), ['0', '3']);
        const provider = createLogicProvider('g');
        assert.deepEqual(await provider.flow(options), expected);
        for (const depth of [0, 1, 3]) for (const maxNodes of [1, 2, 4]) for (const maxEdges of [1, 2, 3]) {
            const limits = { id: 'a', depth, maxNodes, maxEdges };
            assert.deepEqual(await provider.flow(limits), logicFlow(fixture, limits));
        }
    } finally { globalThis.fetch = original; }
});
