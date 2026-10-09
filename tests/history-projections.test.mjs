import test from 'node:test';
import assert from 'node:assert/strict';
import { facetTrends, findingTransitions, nodeTimeline } from '../viewer/history-projections.js';
const node = (id, attributes = {}, path = 'data/items.json') => ({ id, name: 'Item', kind: 'thing', attributes: { layer: 'runtime', ...attributes }, sources: [{ path, line: 1, pointer: '', contentHash: 'source' }], contentHash: id });
const graph = (nodes, extra = {}) => ({ schemaVersion: 1, hash: 'hash', nodes, edges: [], facets: [], findings: [], views: [], repository: { name: 'test', dirty: false, sourceFingerprint: 'source' }, ...extra });
const entry = (id, graph) => ({ snapshot: { id, graphHash: id, lensHash: null, inputFingerprint: id, coverage: 'repository-lens', artifactPath: `snapshots/${id}.json` }, ...(graph ? { graph } : { error: 'Unavailable' }) });
const facet = (nodeId, value, ruleId = 'rule') => ({ id: nodeId + ruleId, nodeId, key: 'stage', value, ruleId, sources: [] });
const finding = (ruleId, status) => ({ id: ruleId, ruleId, severity: 'warning', targetIds: [], metrics: { layer: 'runtime' }, message: ruleId, basis: 'computed', sources: [], ...(status ? { gate: { metric: 'count', comparator: 'gte', threshold: 1, status } } : {}) });
test('facet trends keep typed categories, count each node once per value, and separate missing from null', () => {
    const nodes = [node('a'), node('b'), node('c'), node('d'), node('e'), node('design', { layer: 'design' }), { ...node('file'), kind: 'file' }];
    const first = graph(nodes, { facets: [facet('a', 1), facet('a', 1, 'duplicate'), facet('a', '1'), facet('b', null), facet('c', false), facet('d', ''), facet('design', 'excluded'), facet('file', 'excluded')] });
    const second = graph([node('a')], { facets: [] });
    const [trend] = facetTrends([entry('z', first), entry('a'), entry('b', second)], 'runtime', new Set(['file']));
    assert.equal(trend.key, 'stage');
    const counts = Object.fromEntries(trend.buckets.map(bucket => [bucket.valueKey, bucket.counts]));
    assert.deepEqual(counts, { '1': [1, null, 0], '"1"': [1, null, 0], null: [1, null, 0], false: [1, null, 0], '""': [1, null, 0], '@missing': [1, null, 1] });
    assert.equal(trend.buckets.find(bucket => bucket.valueKey === 'null').value, null);
    assert.equal(trend.buckets.find(bucket => bucket.valueKey === '@missing').value, undefined);
});
test('finding transitions resolve only observed fail to pass and preserve removed or unknown failures', () => {
    const cases = [['pass', 'fail', 'new-failure'], ['fail', 'pass', 'resolved-failure'], [undefined, 'fail', 'failure-observed'], ['unknown', 'fail', 'failure-observed'], ['fail', 'unknown', 'failure-unobserved'], ['fail', undefined, 'failure-unobserved']];
    for (const [beforeStatus, afterStatus, status] of cases) {
        const before = graph([], { findings: beforeStatus ? [finding('rule', beforeStatus)] : [] });
        const after = graph([], { findings: afterStatus ? [finding('rule', afterStatus)] : [] });
        const [transition] = findingTransitions(before, after, 'runtime');
        assert.equal(transition.status, status); assert.equal(transition.previous, before.findings[0]); assert.equal(transition.current, after.findings[0]);
    }
    const warning = finding('warning');
    assert.equal(findingTransitions(graph([]), graph([], { findings: [warning] }), 'runtime')[0].status, 'added');
    assert.equal(findingTransitions(graph([], { findings: [warning] }), graph([]), 'runtime')[0].status, 'removed');
    assert.deepEqual(findingTransitions(graph([], { findings: [warning] }), graph([], { findings: [warning] }), 'runtime'), []);
});
test('node history preserves source records and semantic identity through namespace changes and source moves', () => {
    const before = node('old:a', { originalId: 'a', identityNamespace: 'old', nested: { contentHash: 'meaning' } });
    const renamed = node('new:a', { originalId: 'a', identityNamespace: 'new', nested: { contentHash: 'meaning' } }, 'moved/items.json');
    const changed = { ...renamed, attributes: { ...renamed.attributes, nested: { contentHash: 'new meaning' } } };
    const timeline = nodeTimeline([entry('z', graph([before])), entry('a', graph([renamed])), entry('b', graph([changed])), entry('c', graph([])), entry('d', graph([changed]))], changed);
    assert.deepEqual(timeline.map(item => item.status), ['first-observed', 'present', 'changed', 'removed', 'added']);
    assert.deepEqual(timeline.map(item => item.snapshot.id), ['z', 'a', 'b', 'c', 'd']);
    assert.equal(timeline[1].sourceMoved, true); assert.equal(timeline[1].node, renamed); assert.equal(timeline[1].previous, before);
    assert.equal(timeline[2].sourceMoved, false);
    assert.equal(nodeTimeline([entry('a', graph([{ ...before, kind: 'other' }, node('a', { layer: 'design' })]))], changed)[0].status, 'absent');
});
test('unknown snapshot gaps do not create changes, removals, moves or additions across missing evidence', () => {
    const before = node('a', { value: 1 }), after = node('a', { value: 2 }, 'moved/items.json');
    const timeline = nodeTimeline([entry('1', graph([before])), entry('2'), entry('3', graph([after])), entry('4'), entry('5', graph([])), entry('6', graph([after]))], after);
    assert.deepEqual(timeline.map(item => item.status), ['first-observed', 'unknown', 'present', 'unknown', 'absent', 'added']);
    assert.equal(timeline[2].sourceMoved, false); assert.equal(timeline[2].previous, undefined); assert.equal(timeline[2].previousSnapshot, undefined);
    assert.equal(timeline[1].error, 'Unavailable');
});
test('first observation distinguishes known addition from unknown earlier existence', () => {
    const record = node('a');
    const added = nodeTimeline([entry('1', graph([])), entry('2', graph([record]))], record)[1];
    assert.equal(added.status, 'added'); assert.equal(added.firstObserved, true);
    const observed = nodeTimeline([entry('1'), entry('2', graph([record]))], record)[1];
    assert.equal(observed.status, 'first-observed'); assert.equal(observed.firstObserved, true);
});
