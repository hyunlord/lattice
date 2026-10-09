import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lattice from '../dist/index.js';

const digest = (text) => createHash('sha256').update(text).digest('hex');
const source = { path: 'records.json', line: 2, pointer: '/0', contentHash: digest('input'), revision: 'working-tree' };
const node = (id) => ({ id, kind: 'record', name: id, attributes: { revision: 'business-value', steps: [2, 1] }, sources: [source] });
const fixture = () => ({
    repository: { name: 'example', dirty: true, sourceFingerprint: digest('input') },
    nodes: [node('b'), node('a')],
    edges: [{ id: 'a-b', kind: 'reference', source: 'a', target: 'b', directed: true, field: '/targetId', sources: [source] }],
    facets: [{ id: 'f', nodeId: 'a', key: 'status', value: 'active', ruleId: 'rule', sources: [source] }],
    findings: [{ id: 'finding', ruleId: 'rule', severity: 'info', targetIds: ['b', 'a'], metrics: { count: 2 }, message: 'Two records', basis: 'computed', sources: [source] }],
    views: [{ id: 'view', type: 'table', label: 'Records', query: { kinds: ['record'] }, sources: [source] }],
    snapshots: [], lensDigest: digest('lens'), adapterVersions: { data: '1' },
    inputs: [{ path: 'records.json', contentHash: digest('input') }],
});

test('graph identity ignores envelope and source revisions while sorting collections', () => {
    const before = fixture();
    const after = fixture();
    after.nodes.reverse();
    after.repository = { ...after.repository, commit: 'new-commit', dirty: false };
    after.snapshots = [{ id: 'history', graphHash: digest('history'), lensHash: digest('lens'), inputFingerprint: digest('input'), coverage: 'historical', artifactPath: 'snapshots/history.json' }];
    for (const records of [after.nodes, after.edges, after.facets, after.findings, after.views]) {
        for (const record of records) record.sources = record.sources.map(s => ({ ...s, revision: 'new-commit', url: 'https://example.com/source' }));
    }
    assert.equal(typeof lattice.createGraph, 'function');
    const first = lattice.createGraph(before, digest);
    const second = lattice.createGraph(after, digest);
    assert.equal(first.hash, second.hash);
    assert.deepEqual(first.nodes.map(n => n.id), ['a', 'b']);
    assert.deepEqual(before.nodes.map(n => n.id), ['b', 'a']);
});

test('semantic and provenance edits change graph identity', () => {
    const baseline = lattice.createGraph(fixture(), digest).hash;
    for (const edit of [
        graph => { graph.nodes[0].attributes.revision = 'other-business-value'; },
        graph => { graph.nodes[0].attributes.steps.reverse(); },
        graph => { graph.nodes[0].sources = [{ ...source, line: 3 }]; },
        graph => { graph.edges[0].field = '/other'; },
        graph => { graph.facets[0].value = 'inactive'; },
        graph => { graph.findings[0].metrics.count = 3; },
        graph => { graph.views[0].label = 'Inventory'; },
        graph => { graph.lensDigest = digest('changed lens'); },
        graph => { graph.inputs[0].contentHash = digest('changed input'); },
    ]) {
        const changed = fixture(); edit(changed);
        assert.notEqual(lattice.createGraph(changed, digest).hash, baseline);
    }
});

test('duplicate identities and unresolved graph endpoints are rejected', () => {
    for (const edit of [
        graph => { graph.nodes.push(node('a')); },
        graph => { graph.edges[0].target = 'missing'; },
        graph => { graph.facets[0].nodeId = 'missing'; },
        graph => { graph.findings[0].targetIds = ['missing']; },
        graph => { graph.nodes[0].sources = [{ ...source, path: '../secret' }]; },
        graph => { graph.nodes[0].sources = [{ ...source, line: 0 }]; },
        graph => { graph.inputs.push({ ...graph.inputs[0] }); },
    ]) {
        const invalid = fixture(); edit(invalid);
        assert.throws(() => lattice.createGraph(invalid, digest), { name: 'GraphInputError' });
    }
});

test('graph data is detached from caller mutations and returned immutable', () => {
    const input = fixture();
    const graph = lattice.createGraph(input, digest);
    input.nodes[0].attributes.steps.push(9);
    assert.deepEqual(graph.nodes.find(n => n.id === 'b').attributes.steps, [2, 1]);
    assert.throws(() => graph.nodes[0].attributes.steps.push(9), TypeError);
});

test('rebuilding a materialized graph does not hash its prior content hash', () => {
    const first = lattice.createGraph(fixture(), digest);
    const rebuilt = lattice.createGraph(first, digest);
    assert.equal(rebuilt.hash, first.hash);
    assert.deepEqual(rebuilt.nodes.map(node => node.contentHash), first.nodes.map(node => node.contentHash));
});
