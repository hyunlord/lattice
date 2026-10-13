import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as publicApi from '../dist/index.js';
import * as internal from '../dist/core/graph.js';
const digest = text => createHash('sha256').update(text).digest('hex');
const streamDigest = Object.assign(text => digest(text), { stream: produce => { const hash = createHash('sha256'); produce(text => hash.update(text)); return hash.digest('hex'); } });
function fixture() {
    const source = { path: 'a.json', line: 1, pointer: '/a', contentHash: digest('a'), revision: 'revision', url: 'https://example.invalid/a' }, sources = [source, source];
    return {
        repository: { name: 'fixture', dirty: true, sourceFingerprint: digest('a') }, lensDigest: null, adapterVersions: {}, inputs: [{ path: 'a.json', contentHash: source.contentHash }], snapshots: [],
        nodes: ['b', 'a'].map(id => ({ id, kind: 'record', name: id, attributes: { text: '한글😀'.repeat(18000), steps: [2, 1] }, sources })),
        edges: [{ id: 'ab', kind: 'reference', source: 'a', target: 'b', directed: true, sources }], facets: [], findings: [], views: []
    };
}
test('owned parsed drafts retain exact graph and node identity without a public API export', () => {
    assert.equal(typeof internal.createGraphFromOwnedDraft, 'function'); assert.equal(publicApi.createGraphFromOwnedDraft, undefined);
    for (const hashing of [digest, streamDigest]) {
        const input = fixture(), expected = publicApi.createGraph(input, hashing), graph = internal.createGraphFromOwnedDraft(input, hashing);
        assert.deepEqual(graph, expected); assert.strictEqual(graph.nodes[0].attributes, input.nodes[1].attributes);
        assert.strictEqual(graph.nodes[0].sources, graph.edges[0].sources); assert.equal(graph.nodes[0].sources.length, 2);
        assert.throws(() => graph.nodes[0].sources[0].revision = 'changed', TypeError); assert.throws(() => input.nodes[0].attributes.steps.push(3), TypeError);
    }
});
test('public graph construction still isolates all caller-owned data', () => {
    const input = fixture(), graph = publicApi.createGraph(input, streamDigest), before = graph.nodes[0].contentHash;
    input.nodes[0].attributes.steps.push(3); input.nodes[0].sources[0].url = 'https://example.invalid/changed';
    assert.deepEqual(graph.nodes[1].attributes.steps, [2, 1]); assert.equal(graph.nodes[0].sources[0].url, 'https://example.invalid/a'); assert.equal(graph.nodes[0].contentHash, before);
});
test('owned and public construction reject identical invalid input and digest results', () => {
    assert.equal(typeof internal.createGraphFromOwnedDraft, 'function');
    for (const change of [g => g.nodes.push(g.nodes[0]), g => g.edges[0].target = 'missing', g => g.nodes[0].attributes.bad = NaN, g => g.nodes[0].sources[0].line = 0]) {
        const a = fixture(), b = fixture(); change(a); change(b);
        assert.throws(() => publicApi.createGraph(a, streamDigest), { name: 'GraphInputError' }); assert.throws(() => internal.createGraphFromOwnedDraft(b, streamDigest), { name: 'GraphInputError' });
    }
    for (const hashing of [() => 'invalid', Object.assign(text => digest(text), { stream: () => 'invalid' })]) assert.throws(() => internal.createGraphFromOwnedDraft(fixture(), hashing), { name: 'GraphInputError' });
});
