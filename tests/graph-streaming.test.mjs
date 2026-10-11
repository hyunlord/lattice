import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, createGraph } from '../dist/index.js';
import * as canonical from '../dist/core/canonical.js';
const digest = text => createHash('sha256').update(text).digest('hex');
const source = { path: 'data.json', pointer: '', line: 1, contentHash: 'a'.repeat(64), revision: 'ignored' };
const fixture = () => ({ repository: { name: 'test', dirty: false, sourceFingerprint: 'a'.repeat(64) }, nodes: [{ id: 'b', kind: 'record', name: '한글😀', attributes: { z: [1, 'x'], a: true }, sources: [source] }, { id: 'a', kind: 'record', name: 'A', attributes: {}, sources: [source] }], edges: [{ id: 'e', kind: 'uses', source: 'b', target: 'a', directed: true, field: '', sources: [source] }], facets: [{ id: 'f', nodeId: 'a', key: 'state', value: { n: 1 }, ruleId: 'r', sources: [source] }], findings: [{ id: 'warning', ruleId: 'r', severity: 'warning', targetIds: ['b', 'a'], metrics: { n: 2 }, message: 'Check', basis: 'computed', sources: [source] }], views: [{ id: 'v', type: 'table', label: 'Rows', query: { kinds: ['record'] }, sources: [source] }], snapshots: [], lensDigest: null, adapterVersions: {}, inputs: [{ path: 'data.json', contentHash: 'a'.repeat(64) }] });

test('incremental graph hashing preserves every legacy byte without a whole payload string', () => {
    const legacy = createGraph(fixture(), digest);
    let streams = 0;
    const incremental = Object.assign(digest, { stream(produce) { streams++; const hash = createHash('sha256'); produce(text => hash.update(text)); return hash.digest('hex'); } });
    const actual = createGraph(fixture(), incremental);
    assert.equal(actual.hash, legacy.hash);
    assert.deepEqual(actual.nodes.map(n => n.contentHash), legacy.nodes.map(n => n.contentHash));
    assert(streams > 0);
    delete incremental.stream;
});

test('canonical writer emits identical bounded chunks and preserves validation errors', () => {
    assert.equal(typeof canonical.writeCanonical, 'function');
    const values = [null, 2, '😀', 'x'.repeat(65534) + '😀' + '끝'.repeat(40000), { 2: 'b', 10: 'a', a: Array.from({ length: 500 }, (_, i) => ({ name: '한글'.repeat(100), i })) }];
    for (const value of values) { const chunks = []; canonical.writeCanonical(value, chunk => chunks.push(chunk)); assert.equal(chunks.join(''), canonicalJson(value)); assert.equal(chunks.reduce((hash, chunk) => hash.update(chunk), createHash('sha256')).digest('hex'), digest(canonicalJson(value))); assert(chunks.every(chunk => chunk.length <= 65536)); }
    const cyclic = {}; cyclic.self = cyclic;
    for (const invalid of [cyclic, { a: undefined }, { get a() { throw Error('getter executed'); } }, new Date(), Array(2)]) assert.throws(() => canonical.writeCanonical(invalid, () => { }), { name: 'GraphInputError' });
});
