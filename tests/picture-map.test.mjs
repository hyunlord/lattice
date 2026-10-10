import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPictureMap, pictureMapConfig } from '../dist/query/picture-map-model.js';
const node = (id, kind, attributes = {}, path = id) => ({ id, kind, name: id, attributes, contentHash: 'hash', sources: [{ path, line: 1, pointer: '', contentHash: 'hash' }] });
const edge = (id, kind, source, target, label = id) => ({ id, kind, source, target, directed: true, field: '', sources: [], attributes: { label } });
test('picture map preserves empty hubs, one primary point, secondary membership and directional explanation', () => {
    const config = pictureMapConfig({ hubKinds: ['system'], membershipEdgeKinds: ['member'], influenceEdgeKinds: ['influence'], primaryFacet: 'primary', statusFacet: 'status', summaryFields: ['cardText'], hubOrder: ['empty', 'b', 'a'] });
    const nodes = [node('a', 'system'), node('b', 'system'), node('empty', 'system'), node('item', 'item', { cardText: 'A real card' })];
    const facets = [{ nodeId: 'item', key: 'primary', value: 'b' }, { nodeId: 'item', key: 'status', value: 'present' }];
    const map = buildPictureMap(nodes, [edge('m1', 'member', 'item', 'a'), edge('m2', 'member', 'item', 'b'), edge('e1', 'influence', 'a', 'empty', 'feeds growth'), edge('e2', 'influence', 'a', 'empty', 'returns growth')], facets, config);
    assert.deepEqual(map.hubs.map(hub => hub.id), ['empty', 'b', 'a']);
    assert.equal(map.hubs.flatMap(hub => hub.nodes).length, 1);
    const item = map.hubs[1].nodes[0];
    assert.deepEqual(item.memberships.map(hub => hub.id), ['b', 'a']);
    assert.equal(item.status, 'present'); assert.equal(item.summary, 'A real card');
    assert.deepEqual(map.edges, [{ source: 'a', target: 'empty', count: 2, descriptions: ['feeds growth', 'returns growth'] }]);
});
test('zero configuration uses folders and resolved imports without claiming runtime status', () => {
    const map = buildPictureMap([node('a', 'module', {}, 'src/main.py'), node('duplicate', 'file', {}, 'src/main.py'), node('b', 'module', {}, 'src/util/helper.py')], [edge('import', 'imports', 'a', 'b'), edge('other', 'ref', 'a', 'b')], []);
    assert.equal(map.hubs.length, 2); assert.equal(map.hubs.flatMap(hub => hub.nodes).length, 2);
    assert.equal(map.edges.length, 1); assert.equal(map.edges[0].count, 1);
    assert(map.hubs.flatMap(hub => hub.nodes).every(node => node.status === 'unknown'));
    assert.equal(pictureMapConfig({ hubKinds: 'invalid' }), undefined);
});

test('hub configuration falls back for a layer without those hubs and raw relationship codes stay hidden', () => {
    const config = pictureMapConfig({ hubKinds: ['system'], membershipEdgeKinds: ['member'], influenceEdgeKinds: ['influence'] });
    const map = buildPictureMap([node('a', 'tool'), node('b', 'item')], [edge('link', 'item-tool', 'b', 'a', 'item-tool')], [], config, { 'item-tool': '연결 물품' });
    assert.equal(map.hubs.length, 2);
    assert.equal(map.hubs.flatMap(hub => hub.nodes)[0].relations[0].label, '연결 물품');
});
