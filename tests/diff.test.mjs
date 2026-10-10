import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lattice from '../dist/index.js';

const digest = text => createHash('sha256').update(text).digest('hex');
const source = { path: 'records.json', line: 1, pointer: '/0', contentHash: digest('record') };
const node = id => ({ id, kind: 'record', name: id, attributes: {}, sources: [source] });
const fixture = () => ({
    repository: { name: 'example', dirty: false, sourceFingerprint: digest('input') },
    nodes: [node('stable'), node('edited'), node('removed')],
    edges: [{ id: 'edge', kind: 'reference', source: 'stable', target: 'edited', directed: true, field: '/target', sources: [source] }],
    facets: [{ id: 'facet', nodeId: 'edited', key: 'state', value: 'draft', ruleId: 'rule', sources: [source] }],
    findings: [{ id: 'finding', ruleId: 'rule', severity: 'info', targetIds: ['edited'], metrics: { count: 1 }, message: 'One', basis: 'computed', sources: [source] }],
    views: [{ id: 'view', type: 'table', label: 'Records', query: {}, sources: [source] }],
    snapshots: [], lensDigest: null, adapterVersions: { data: '1' }, inputs: [],
});

test('diff reports semantic edits and provenance while ignoring observation-only changes', () => {
    // Given: a graph and a later observation with content changes and source revisions.
    const earlier = fixture();
    const later = fixture();
    later.repository.commit = 'later';
    later.nodes = [node('z-added'), node('a-added'), node('stable'), { ...node('edited'), sources: [{ ...source, line: 2 }] }];
    later.edges[0].attributes = { weight: 2 };
    later.facets[0].value = 'ready';
    later.findings[0].metrics.count = 2;
    later.views[0].label = 'Inventory';
    for (const records of [later.nodes, later.edges, later.facets, later.findings, later.views]) {
        for (const record of records) record.sources = record.sources.map(value => ({ ...value, revision: 'later', url: 'https://example.com/later' }));
    }
    const before = lattice.createGraph(earlier, digest);
    const after = lattice.createGraph(later, digest);
    // When: comparing their semantic records.
    assert.equal(typeof lattice.diffGraphs, 'function');
    assert.ok(Object.values(lattice.diffGraphs(before, before)).every(change => change.added.length === 0 && change.removed.length === 0 && change.changed.length === 0));
    const colliding = () => '0'.repeat(64);
    assert.equal(lattice.diffGraphs(lattice.createGraph(earlier, colliding), lattice.createGraph(later, colliding)).nodes.changed.length, 1);
    const result = lattice.diffGraphs(before, after);
    // Then: sorted additions/removals and exact before/after edits omit the stable node.
    assert.deepEqual(result.nodes.added.map(value => value.id), ['a-added', 'z-added']);
    assert.deepEqual(result.nodes.removed.map(value => value.id), ['removed']);
    for (const [collection, id] of Object.entries({ nodes: 'edited', edges: 'edge', facets: 'facet', findings: 'finding', views: 'view' })) {
        assert.deepEqual(result[collection].changed, [{ id, before: before[collection].find(value => value.id === id), after: after[collection].find(value => value.id === id) }]);
    }
});
