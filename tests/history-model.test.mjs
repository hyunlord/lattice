import test from 'node:test';
import assert from 'node:assert/strict';
import { semantic, nodeIdentity, snapshotComparisons, compareRecords, changedAreas, sourceInventory } from '../viewer/history-model.js';
const source = path => ({ path, line: 1, pointer: '', contentHash: 'source' });
const node = (id, attributes = {}, paths = ['data/items.json']) => ({ id, name: 'Item', kind: 'thing', attributes: { layer: 'runtime', ...attributes }, sources: paths.map(source), contentHash: id });
const graph = (nodes, extra = {}) => ({ schemaVersion: 1, hash: 'hash', nodes, edges: [], facets: [], findings: [], views: [], repository: { name: 'test', dirty: false, sourceFingerprint: 'source' }, ...extra });
const changes = (before, after) => compareRecords(snapshotComparisons(before, before.nodes, 'runtime').nodes, snapshotComparisons(after, after.nodes, 'runtime').nodes);
test('history identity ignores namespace and source-only changes while retaining nested semantic fields', () => {
    const before = graph([node('old:a', { originalId: 'a', identityNamespace: 'old', nested: { contentHash: 'meaningful' } })]);
    const after = graph([node('new:a', { originalId: 'a', identityNamespace: 'new', nested: { contentHash: 'meaningful' } }, ['other/items.json'])]);
    assert.equal(nodeIdentity(before.nodes[0]), nodeIdentity(after.nodes[0]));
    assert.deepEqual(changes(before, after), []);
    assert.deepEqual(changedAreas(before, after, 'runtime').map(area => area.directory), ['data', 'other']);
    const namespaceOnly = graph([{ ...after.nodes[0], sources: before.nodes[0].sources }]);
    assert.deepEqual(changedAreas(before, namespaceOnly, 'runtime'), []);
    after.nodes[0].attributes.nested.contentHash = 'changed';
    assert.equal(changes(before, after)[0].status, '변경');
    assert.deepEqual(semantic({ sources: [1], contentHash: 'x', attributes: { sources: [1] } }), { attributes: { sources: [1] } });
});
test('changed areas preserve original add/change/remove records and union changed node source directories', () => {
    const old = node('a', { value: 1 }, ['old/a.json', 'old/second.json', 'shared/a.json']);
    const updated = node('a', { value: 2 }, ['new/a.json', 'shared/a.json']);
    const removed = node('b', {}, ['old/b.json']);
    const added = node('c', {}, []);
    const areas = changedAreas(graph([old, removed]), graph([updated, added]), 'runtime');
    assert.deepEqual(areas.map(({ directory, count }) => ({ directory, count })), [
        { directory: 'old', count: 2 }, { directory: '(출처 없음)', count: 1 }, { directory: 'new', count: 1 }, { directory: 'shared', count: 1 },
    ]);
    const changed = areas.find(area => area.directory === 'new').changes[0];
    assert.equal(changed.previous, old); assert.equal(changed.current, updated); assert.equal(changed.status, '변경');
    assert.equal(areas[0].changes.find(change => change.previous === removed).status, '삭제');
    assert.equal(areas[1].changes[0].current, added); assert.equal(areas[1].changes[0].status, '추가');
});
test('areas respect layers and hidden kinds and retain every directory without truncation', () => {
    const nodes = Array.from({ length: 30 }, (_, index) => node('a' + index, {}, ['area-' + index + '/item.json']));
    nodes.push(node('design', { layer: 'designed' }, ['design/item.json']));
    nodes.push({ ...node('hidden', {}, ['hidden/item.json']), kind: 'file' });
    const areas = changedAreas(graph([]), graph(nodes), 'runtime', new Set(['file']));
    assert.equal(areas.length, 30); assert.ok(areas.every(area => area.count === 1));
    assert.deepEqual(areas.map(area => area.directory), nodes.slice(0, 30).map(node => node.sources[0].path.split('/')[0]).sort());
});
test('source inventory counts distinct current nodes per immediate directory without claiming change', () => {
    const nodes = [node('old:a', { originalId: 'a' }, ['data/a.json', 'data/b.json']), node('new:a', { originalId: 'a' }, ['data/c.json']), node('b', {}, ['root.json']), node('c', {}, [])];
    assert.deepEqual(sourceInventory(nodes), [{ directory: 'data', count: 2 }, { directory: '(출처 없음)', count: 1 }, { directory: '.', count: 1 }]);
});
test('edge facet and finding comparisons normalize endpoints but preserve real semantic changes', () => {
    const make = prefix => {
        const nodes = [node(prefix + ':a', { originalId: 'a', identityNamespace: prefix }), node(prefix + ':b', { originalId: 'b', identityNamespace: prefix })];
        return graph(nodes, {
            edges: [{ id: prefix, source: nodes[0].id, target: nodes[1].id, kind: 'uses', field: 'ref', directed: true, sources: [source(prefix + '.json')] }],
            facets: [{ id: prefix, nodeId: nodes[0].id, key: 'state', ruleId: 'state-rule', value: 'ready', sources: [] }],
            findings: [{ id: prefix, ruleId: 'warn-rule', targetIds: [nodes[0].id], severity: 'warning', message: 'Warning', metrics: {}, basis: 'computed', sources: [] }, { id: 'other', ruleId: 'other-layer', targetIds: [], metrics: { layer: 'designed' }, sources: [] }],
        });
    };
    const before = make('old'), after = make('new');
    const left = snapshotComparisons(before, before.nodes, 'runtime'), right = snapshotComparisons(after, after.nodes, 'runtime');
    assert.equal(left.findings.length, 1);
    for (const key of ['edges', 'facets', 'findings']) assert.deepEqual(compareRecords(left[key], right[key]), []);
    after.facets[0].value = 'done';
    assert.equal(compareRecords(left.facets, snapshotComparisons(after, after.nodes, 'runtime').facets).length, 1);
});
test('automatic hub references ignore namespace renames but retain real degree changes and original records', () => {
    const make = prefix => {
        const nodes = [node(prefix + ':a', { originalId: 'a', identityNamespace: prefix }), node(prefix + ':b', { originalId: 'b', identityNamespace: prefix })];
        const edges = [{ id: prefix + ':edge', source: nodes[0].id, target: nodes[1].id, kind: 'uses', field: 'ref', directed: true, sources: [] }];
        const finding = { id: prefix + ':hub', ruleId: 'auto:highest-degree-hubs', basis: 'computed', severity: 'info', message: 'Hubs', sources: [], targetIds: nodes.map(node => node.id), metrics: { layer: 'runtime', count: 2, degrees: nodes.map(node => ({ nodeId: node.id, degree: 1 })), edgeIds: edges.map(edge => edge.id) } };
        return graph(nodes, { edges, findings: [finding] });
    };
    const before = make('old'), after = make('new');
    after.findings[0].metrics.degrees.reverse();
    const compare = () => compareRecords(snapshotComparisons(before, before.nodes, 'runtime').findings, snapshotComparisons(after, after.nodes, 'runtime').findings);
    assert.deepEqual(compare(), []);
    after.findings[0].metrics.degrees[0].degree = 2;
    const result = compare(); assert.equal(result.length, 1);
    assert.equal(result[0].previous, before.findings[0]); assert.equal(result[0].current, after.findings[0]);
    assert.equal(result[0].current.metrics.degrees[0].nodeId, 'new:b');
    after.findings[0].metrics.degrees[0].degree = 1;
    before.findings[0].ruleId = after.findings[0].ruleId = 'custom:hubs';
    assert.equal(compare().length, 1, 'custom metric identifiers retain their declared meaning');
});
test('area history includes pure source path moves but ignores source line hash and revision updates', () => {
    const original = node('a', {}, ['legacy/item.json']);
    const moved = node('a', {}, ['moved/item.json']);
    const before = graph([original]), after = graph([moved]);
    assert.deepEqual(changes(before, after), [], 'existing semantic content comparison stays unchanged');
    const areas = changedAreas(before, after, 'runtime');
    assert.deepEqual(areas.map(({ directory, count }) => ({ directory, count })), [{ directory: 'legacy', count: 1 }, { directory: 'moved', count: 1 }]);
    for (const area of areas) {
        assert.equal(area.changes[0].status, '출처 이동');
        assert.equal(area.changes[0].previous, original); assert.equal(area.changes[0].current, moved);
    }
    const relocatedLines = { ...original, sources: [{ ...original.sources[0], line: 99, contentHash: 'new', revision: 'new-revision' }] };
    assert.deepEqual(changedAreas(before, graph([relocatedLines]), 'runtime'), []);
    const duplicatedSource = { ...original, sources: [...original.sources, ...original.sources] };
    assert.deepEqual(changedAreas(before, graph([duplicatedSource]), 'runtime'), []);
});
