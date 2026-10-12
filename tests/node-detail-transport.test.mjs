import test from 'node:test';
import assert from 'node:assert/strict';
import { logicLookupBucket } from '../dist/query/logic-model.js';
const repository = { name: 'fixture', commit: 'a'.repeat(40), sourceFingerprint: 'b'.repeat(64), dirty: false };
const binding = { schemaVersion: 1, graphHash: 'c'.repeat(64), repository };
const node = { id: 'n', kind: 'module', name: 'N', contentHash: 'd'.repeat(64), attributes: { nested: { value: 3 } }, sources: [] };
const graph = { schemaVersion: 1, hash: binding.graphHash, repository, nodes: [node], edges: [], facets: [], findings: [], views: [] };
const empty = { total: 0, pages: [] };
function fixture() {
    const ref = key => ({ parts: [{ path: 'details/data/packet.json', key }] });
    const record = { graph, facets: empty, findings: empty, relations: { incoming: empty, outgoing: empty, undirected: empty } };
    const packet = { ...binding, records: { lookup: JSON.stringify({ 'id:n': ref('node') }), node: JSON.stringify(record) } };
    return new Map([['details/index.json', { ...binding, lookupRoot: 'details/lookup', pageSize: 20, nodeCount: 1 }], [`details/lookup/${logicLookupBucket('id:n')}.json`, { ...binding, ranges: [{ first: 'id:n', last: 'id:n', ref: ref('lookup') }] }], [`details/lookup/${logicLookupBucket('id:missing')}.json`, { ...binding, ranges: [] }], ['details/data/packet.json', packet]]);
}
test('bounded node detail preserves exact selected attributes and never loads full graph', async t => {
    const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js'); const files = fixture(), requests = [];
    t.mock.method(globalThis, 'fetch', async url => { requests.push(String(url)); const path = String(url).slice(2).split('?')[0]; return files.has(path) ? Response.json(files.get(path)) : new Response(null, { status: 404 }); });
    const loader = createNodeDetailLoader({ hash: binding.graphHash, repository }, '?generation=7'); const index = await loader.index();
    const result = await loader.node(index, 'n'); assert.deepEqual(result.graph.nodes, [node]); assert.equal(await loader.node(index, 'missing'), undefined);
    assert.ok(requests.every(url => url.endsWith('?generation=7'))); assert.ok(!requests.some(url => url.includes('graph.json')));
});
test('node detail source mismatch fails closed and retries instead of retaining failed requests', async t => {
    const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js'); const files = fixture(); let corrupt = true;
    t.mock.method(globalThis, 'fetch', async url => { const path = String(url).slice(2); const value = files.get(path); if (!files.has(path)) return new Response(null, { status: 404 }); return Response.json(path.includes('packet') && corrupt ? { ...value, repository: { ...repository, commit: 'wrong' } } : value); });
    const loader = createNodeDetailLoader({ hash: binding.graphHash, repository }); const index = await loader.index();
    await assert.rejects(loader.node(index, 'n'), /소스/); corrupt = false; assert.equal((await loader.node(index, 'n')).graph.nodes[0].name, 'N');
});
test('only old export index absence permits full-graph compatibility fallback', async t => {
    const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js'); let status = 404;
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status }));
    const loader = createNodeDetailLoader({ hash: binding.graphHash, repository }); assert.equal(await loader.index(), undefined);
    status = 403; await assert.rejects(loader.index(), /403/);
});
test('actual exporter pages retain relations, deferred evidence, history identity and explicit absence', async t => {
    const { writeNodeDetails } = await import('../bin/export-details.mjs'); const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js'); const { nodeIdentity } = await import('../dist/query/history-model.js'); const { sourceCount } = await import('../viewer/source-groups.js');
    const source = { path: 'n.ts', line: 1, pointer: '', contentHash: 'a'.repeat(64) }, center = { ...node, attributes: { originalId: 'shared' }, sources: [source] };
    const neighbors = Array.from({ length: 45 }, (_, i) => ({ ...node, id: `other-${i}`, name: `Other ${i}` }));
    const edges = neighbors.map((target, i) => ({ id: `edge-${i}`, kind: 'imports', source: 'n', target: target.id, field: '', directed: true, sources: [source] }));
    const finding = { id: 'f', ruleId: 'r', severity: 'warning', targetIds: ['n'], metrics: { count: 1 }, message: 'Shared finding', basis: 'computed', sources: [source] };
    const current = { ...graph, nodes: [center, ...neighbors], edges, findings: [finding] }, files = new Map(); writeNodeDetails(current, (path, text) => files.set(path, text));
    const snapshot = { id: 'f'.repeat(64), graphHash: graph.hash, commit: 'previous' };
    writeNodeDetails({ ...current, repository: { ...repository, commit: snapshot.commit }, nodes: [{ ...center, id: 'renamed', name: 'Previous' }], edges: [] }, (path, text) => files.set(path, text), `details/snapshots/${snapshot.id}`);
    t.mock.method(globalThis, 'fetch', async url => { const key = String(url).slice(2); return new Response(files.get(key), { status: files.has(key) ? 200 : 404 }); });
    const loader = createNodeDetailLoader({ hash: graph.hash, repository }), index = await loader.index(), record = await loader.node(index, 'n');
    const found = []; for (let i = 0; i < record.relations.outgoing.pages.length; i++) { const page = await loader.page(index, record.relations.outgoing, i); found.push(...page.edges.map(edge => edge.id)); assert.equal(sourceCount(page.edges[0].sources), 1); }
    const findings = await loader.page(index, record.findings, 0); assert.equal(findings.findings[0].message, finding.message); assert.equal(sourceCount(findings.findings[0].sources), 1);
    assert.deepEqual(found, edges.map(edge => edge.id)); const historyIndex = await loader.index(snapshot); assert.equal((await loader.node(historyIndex, nodeIdentity(center), true)).graph.nodes[0].name, 'Previous'); assert.equal(await loader.node(historyIndex, 'missing'), undefined);
});
test('configured detail label lookups and human groups roundtrip without full node downloads', async t => {
    const { writeNodeDetails } = await import('../bin/export-details.mjs'); const { createNodeDetailLoader } = await import('../viewer/node-detail-data.js');
    const other = { ...node, id: 'other', name: 'Named reference', attributes: { large: 'x'.repeat(50000) } };
    const value = { ...graph, nodes: [node, other], edges: [{ id: 'e', kind: 'uses', source: 'n', target: 'other', field: '', directed: true, sources: [] }] }, files = new Map();
    writeNodeDetails(value, (path, text) => files.set(path, text), 'details', { detail: { summaryFields: [], relationships: [{ label: 'Human group', edgeKinds: ['uses'], direction: 'outgoing' }] } });
    const requests = []; t.mock.method(globalThis, 'fetch', async url => { const key = String(url).slice(2); requests.push(key); return new Response(files.get(key), { status: files.has(key) ? 200 : 404 }); });
    const loader = createNodeDetailLoader({ hash: graph.hash, repository }), index = await loader.index(), selected = await loader.node(index, 'n'), label = await loader.label(index, 'other');
    assert.equal(label.name, 'Named reference'); assert.deepEqual(label.attributes, {}); assert.deepEqual(label.sources, []);
    assert.equal(selected.presentationRelations[0].label, 'Human group'); assert.equal((await loader.page(index, selected.presentationRelations[0].pages, 0)).edges[0].target, 'other');
    assert.equal(await loader.label(index, 'literal text'), undefined); assert.ok(!requests.includes('graph.json'));
});
