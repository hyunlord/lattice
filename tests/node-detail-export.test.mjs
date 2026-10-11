import test from 'node:test';
import assert from 'node:assert/strict';
import { writeNodeDetails } from '../bin/export-details.mjs';
import { logicLookupBucket } from '../dist/query/logic-model.js';
import { detailIdKey, detailIdentityKey } from '../dist/query/node-detail-transport.js';
import { nodeIdentity } from '../dist/query/history-model.js';
const source = { path: 'source.ts', pointer: '/node', line: 1, contentHash: 'source-hash' };
const node = id => ({ id, kind: 'module', name: id, attributes: {}, contentHash: 'hash-' + id, sources: [source] });
const selected = { ...node('center'), attributes: { note: '한글😀'.repeat(40000), originalId: 'before', layer: 'layer' } };
const nodes = [selected, ...Array.from({ length: 45 }, (_, index) => node('other-' + index))];
const edges = nodes.slice(1).map((target, index) => ({ id: 'edge-' + index, source: selected.id, target: target.id, kind: 'imports', directed: true, field: '', attributes: {}, sources: [source] }));
const graph = { schemaVersion: 1, hash: 'a'.repeat(64), repository: { name: 'fixture', dirty: false, commit: 'commit', sourceFingerprint: 'source' }, nodes, edges, facets: [{ id: 'facet', nodeId: 'center', key: 'role', value: 'main', ruleId: 'rule', sources: [source] }], findings: [{ id: 'finding', ruleId: 'rule', severity: 'warning', targetIds: ['center'], metrics: { n: 1 }, message: 'check', basis: 'computed', sources: [source] }], views: [], snapshots: [], inputs: [], adapterVersions: {}, lensDigest: null };
test('node detail packets keep exact attributes and all paginated relationships within bounded transport', () => {
    const files = new Map(); writeNodeDetails(graph, (path, text) => files.set(path, text));
    const read = path => JSON.parse(files.get(path));
    const load = ref => JSON.parse(ref.parts.map(part => read(part.path).records[part.key]).join(''));
    const index = read('details/index.json');
    const lookup = key => { const bucket = read(`${index.lookupRoot}/${logicLookupBucket(key)}.json`); const range = bucket.ranges.find(range => range.first <= key && range.last >= key); return range ? load(range.ref)[key] : undefined; };
    const detail = load(lookup(detailIdKey('center')));
    assert.deepEqual(detail.graph.nodes, [selected]);
    assert.deepEqual(lookup(detailIdentityKey(nodeIdentity(selected))), lookup(detailIdKey('center')));
    assert.equal(lookup(detailIdKey('absent')), undefined);
    assert.equal(detail.relations.outgoing.total, 45); assert.equal(detail.relations.outgoing.pages.length, 3);
    assert.deepEqual(detail.relations.outgoing.pages.flatMap(ref => load(ref).graph.edges).map(edge => edge.id), edges.map(edge => edge.id));
    assert.equal(detail.facets.total, 1); assert.equal(load(detail.facets.pages[0]).graph.facets[0].value, 'main');
    assert.equal(detail.findings.total, 1); assert.equal(load(load(detail.findings.pages[0]).findingRefs[0]).graph.findings[0].message, 'check');
    for (const [path, text] of files) if (path.startsWith('details/')) { assert.ok(Buffer.byteLength(text) <= 262144, `${path} exceeds byte limit`); const value = JSON.parse(text); assert.equal(value.graphHash, graph.hash); assert.deepEqual(value.repository, graph.repository); }
    const repeat = new Map(); writeNodeDetails(graph, (path, text) => repeat.set(path, text), 'details/snapshots/snapshot');
    for (const [path, text] of repeat) if (path !== 'details/snapshots/snapshot/index.json') assert.equal(text, files.get(path));
});

test('detail lookup splits colliding IDs and preserves directional, self-loop and historical source binding', () => {
    const colliding = [];
    for (let index = 0; colliding.length < 140; index++) { const id = `collision-${index}`; if (logicLookupBucket(detailIdKey(id)) === '00') colliding.push(node(id)); }
    const extraEdges = [{ ...edges[0], id: 'incoming', source: colliding[1].id, target: colliding[0].id }, { ...edges[0], id: 'self', source: colliding[0].id, target: colliding[0].id, directed: false }];
    const value = { ...graph, nodes: colliding, edges: extraEdges, facets: [], findings: [] }, files = new Map(); writeNodeDetails(value, (path, text) => files.set(path, text));
    const read = path => JSON.parse(files.get(path)); const load = ref => JSON.parse(ref.parts.map(part => read(part.path).records[part.key]).join(''));
    const index = read('details/index.json'), bucket = read(index.lookupRoot + '/00.json'); assert.equal(bucket.ranges.length, 2);
    const key = detailIdKey(colliding[0].id), detail = load(load(bucket.ranges.find(range => range.first <= key && range.last >= key).ref)[key]);
    assert.equal(detail.relations.incoming.total, 1); assert.equal(detail.relations.outgoing.total, 0); assert.equal(detail.relations.undirected.total, 1);
    const part = load(detail.relations.incoming.pages[0]).graph, group = part.evidence.groups[part.evidence.records.edges.incoming];
    assert.deepEqual(group.pages.flatMap(path => read(path)), [source]);
    const previous = new Map(); writeNodeDetails({ ...value, repository: { ...value.repository, commit: 'previous' } }, (path, text) => previous.set(path, text), 'details/snapshots/previous');
    assert.notEqual(JSON.parse(previous.get('details/snapshots/previous/index.json')).lookupRoot, index.lookupRoot);
    for (const [path, text] of files) if (path.startsWith('details/')) assert.ok(Buffer.byteLength(text) <= 262144);
});

test('many target nodes share one exact large finding instead of duplicating its payload', () => {
    const targets = Array.from({ length: 80 }, (_, index) => node(`target-${index}`));
    const finding = { ...graph.findings[0], targetIds: targets.map(node => node.id), message: 'unchanged finding '.repeat(20000) };
    const files = new Map(); writeNodeDetails({ ...graph, nodes: targets, edges: [], facets: [], findings: [finding] }, (path, text) => files.set(path, text));
    const read = path => JSON.parse(files.get(path)), load = ref => JSON.parse(ref.parts.map(part => read(part.path).records[part.key]).join(''));
    const index = read('details/index.json');
    const record = id => { const key = detailIdKey(id), bucket = read(`${index.lookupRoot}/${logicLookupBucket(key)}.json`), range = bucket.ranges.find(range => range.first <= key && range.last >= key); return load(load(range.ref)[key]); };
    const first = load(record(targets[0].id).findings.pages[0]).findingRefs[0], last = load(record(targets[79].id).findings.pages[0]).findingRefs[0];
    assert.deepEqual(first, last); assert.deepEqual(load(first).graph.findings[0].targetIds, finding.targetIds); assert.equal(load(first).graph.findings[0].message, finding.message);
    assert.ok([...files.values()].reduce((sum, text) => sum + Buffer.byteLength(text), 0) < 2_000_000);
});

test('configured detail groups preserve human labels, original relationship order and lightweight referenced labels', async () => {
    const { detailLabelKey } = await import('../dist/query/node-detail-transport.js');
    const value = { ...graph, nodes: [node('a'), { ...node('b'), name: 'Readable target' }], edges: [{ ...edges[0], id: 'second', source: 'a', target: 'b' }, { ...edges[0], id: 'first', source: 'b', target: 'a' }, { ...edges[0], id: 'third', source: 'b', target: 'a', directed: false }], facets: [], findings: [] };
    const presentation = { detail: { summaryFields: [{ label: 'Related', path: ['related'] }], relationships: [{ label: 'Uses', edgeKinds: ['imports'], direction: 'outgoing' }, { label: 'Together', edgeKinds: ['imports'], direction: 'both' }, { label: 'Receives', edgeKinds: ['imports'], direction: 'incoming' }] } };
    const files = new Map(); writeNodeDetails(value, (path, text) => files.set(path, text), 'details', presentation);
    const read = path => JSON.parse(files.get(path)), load = ref => JSON.parse(ref.parts.map(part => read(part.path).records[part.key]).join(''));
    const index = read('details/index.json'), lookup = key => { const bucket = read(`${index.lookupRoot}/${logicLookupBucket(key)}.json`), range = bucket.ranges.find(range => range.first <= key && range.last >= key); return range ? load(load(range.ref)[key]) : undefined; };
    const detail = lookup(detailIdKey('a'));
    assert.deepEqual(detail.presentationRelations.map(group => group.label), ['Uses', 'Together', 'Receives']);
    assert.deepEqual(detail.presentationRelations.map(group => group.pages.pages.flatMap(ref => load(ref).graph.edges).map(edge => edge.id)), [['second'], ['second', 'first', 'third'], ['first', 'third']]);
    const label = lookup(detailLabelKey('b')).graph.nodes[0]; assert.equal(label.name, 'Readable target'); assert.deepEqual(label.attributes, {}); assert.deepEqual(label.sources, []);
});
