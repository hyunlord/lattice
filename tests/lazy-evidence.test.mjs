import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { thinGraph } from '../bin/export-evidence.mjs';
import { parseGraph } from '../viewer/data.js';
import { deferredSources, mergeSourceGroups, sourceCount } from '../viewer/source-groups.js';
const source = i => ({ path: 'data.json', line: i + 1, pointer: '/' + i, contentHash: 'a'.repeat(64), revision: 'old', url: `https://example.com/old#L${i + 1}` });
const fixture = () => ({ schemaVersion: 1, hash: 'b'.repeat(64), repository: { name: 'test', dirty: false, sourceFingerprint: 'c'.repeat(64) }, nodes: [{ id: 'n', kind: 'item', name: 'Name', attributes: {}, contentHash: 'a'.repeat(64), sources: [source(0)] }], edges: [{ id: 'e', kind: 'relates', source: 'n', target: 'n', directed: true, field: 'x', sources: Array.from({ length: 260 }, (_, i) => source(i % 130)) }], facets: [{ id: 'f', nodeId: 'n', key: 'state', value: { sources: [source(2)] }, ruleId: 'r', sources: [source(0), source(1)] }], findings: [], views: [] });
test('thin export preserves canonical graph and full ordered provenance in bounded content-addressed pages', () => {
    const graph = fixture(), before = JSON.stringify(graph), files = new Map();
    const thin = thinGraph(graph, (path, text) => files.set(path, text));
    assert.equal(JSON.stringify(graph), before); assert.equal(thin.hash, graph.hash);
    assert.deepEqual(thin.nodes, graph.nodes); assert.deepEqual(thin.facets[0].value, graph.facets[0].value);
    assert.deepEqual(thin.edges[0].sources, []);
    const group = thin.evidence.groups[thin.evidence.records.edges.e];
    assert.equal(group.count, 260); assert.equal(group.pages.length, 3);
    const sources = group.pages.flatMap(path => { const raw = files.get(path); assert.equal(path, `evidence/${createHash('sha256').update(raw).digest('hex')}.json`); const page = JSON.parse(raw); assert.ok(page.length <= 128); return page; });
    assert.deepEqual(sources, graph.edges[0].sources);
    const changed = fixture(); changed.edges[0].sources[0] = { ...source(0), url: 'https://example.com/new' };
    const other = thinGraph(changed, () => { }); assert.notEqual(other.evidence.records.edges.e, thin.evidence.records.edges.e);
});
test('deferred group references survive merged facet/view provenance without eager hydration', () => {
    const thin = thinGraph(fixture(), () => { }), graph = parseGraph(thin);
    const groups = deferredSources(graph.edges[0].sources); assert.equal(groups.length, 1);
    const merged = mergeSourceGroups([graph.edges[0].sources, graph.facets[0].sources, graph.edges[0].sources]);
    assert.equal(deferredSources(merged).length, 2); assert.equal(sourceCount(merged), 262);
    assert.equal(deferredSources(parseGraph(fixture()).edges[0].sources).length, 0);
});
test('lazy page loading makes no request before use, shares in-flight reads and retries failures', async t => {
    const { readEvidencePage, hydrateSources } = await import('../viewer/evidence.js');
    const graph = fixture(), files = new Map(), thin = thinGraph(graph, (p, s) => files.set(p, s));
    const parsed = parseGraph(thin), group = deferredSources(parsed.edges[0].sources)[0];
    let calls = 0, fail = true;
    t.mock.method(globalThis, 'fetch', async url => { calls++; return fail ? new Response('missing', { status: 404 }) : new Response(files.get(String(url).slice(2))); });
    assert.equal(calls, 0);
    await assert.rejects(readEvidencePage(group.pages[0]), /HTTP 404/); assert.equal(calls, 1);
    fail = false; const [one, two] = await Promise.all([readEvidencePage(group.pages[0]), readEvidencePage(group.pages[0])]);
    assert.deepEqual(one, two); assert.equal(calls, 2);
    assert.deepEqual(await hydrateSources(parsed.edges[0].sources), graph.edges[0].sources);
    assert.equal(calls, 4);
    await assert.rejects(readEvidencePage('https://evil.test/x'), /근거 경로/);
    assert.equal(calls, 4);
});
test('invalid manifests and mismatched content-addressed evidence fail visibly', async t => {
    const thin = thinGraph(fixture(), () => { }); const id = thin.evidence.records.edges.e;
    const invalid = structuredClone(thin); invalid.evidence.groups[id].pages[0] = '../graph.json';
    assert.throws(() => parseGraph(invalid), /근거 페이지/);
    const { readEvidencePage } = await import('../viewer/evidence.js');
    t.mock.method(globalThis, 'fetch', async () => new Response('[]'));
    await assert.rejects(readEvidencePage('evidence/' + 'f'.repeat(64) + '.json'), /해시/);
});
test('record identifiers matching object prototype keys retain their own evidence descriptors', () => {
    for (const id of ['__proto__', 'constructor', 'toString']) {
        const graph = fixture(); graph.edges[0].id = id;
        const thin = thinGraph(graph, () => { });
        assert.ok(Object.hasOwn(thin.evidence.records.edges, id));
        const parsed = parseGraph(JSON.parse(JSON.stringify(thin)));
        assert.equal(deferredSources(parsed.edges[0].sources)[0].count, 260);
    }
});
test('ordinary HTTP without WebCrypto keeps schema-validated evidence readable', async t => {
    const { readEvidencePage } = await import('../viewer/evidence.js');
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    t.after(() => { if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor); });
    const text = JSON.stringify([source(987)]), path = `evidence/${createHash('sha256').update(text).digest('hex')}.json`;
    t.mock.method(globalThis, 'fetch', async () => new Response(text));
    assert.deepEqual(await readEvidencePage(path), [source(987)]);
});
test('actual facet cells and automatic matrix projections retain deferred source groups', async () => {
    const { cellValue } = await import('../viewer/list-model.js');
    const { automaticViews, normalizeView } = await import('../viewer/views-model.js');
    const graph = parseGraph(thinGraph(fixture(), () => { }));
    const cell = cellValue(graph.nodes[0], { id: 'facet:state', type: 'facet', key: 'state', label: 'State' }, graph.facets);
    assert.deepEqual(cell.value, graph.facets[0].value);
    assert.equal(deferredSources(cell.sources)[0].count, 2);
    const view = automaticViews(graph.nodes, graph.edges)[0];
    assert.equal(deferredSources(view.sources)[0].count, 260);
    const projection = normalizeView(view, graph.nodes, graph.edges);
    assert.equal(projection.type, 'matrix');
    assert.equal(deferredSources(projection.cells[0].sources)[0].count, 260);
});
