import assert from 'node:assert/strict';
import test from 'node:test';
import { filterGraph, shortestPath, neighborhood, groupGraph, rankHubs } from '../viewer/explore-model.js';

const node = (id, kind = 'record', path = 'data/records.json') => ({ id, kind, name: id, attributes: {}, sources: [{ path }], contentHash: id });
const edge = (id, source, target, directed = true, kind = 'reference') => ({ id, source, target, directed, kind, field: '', sources: [] });
const nodes = ['a', 'b', 'c', 'd', 'isolated'].map(id => node(id));
const edges = [edge('ab', 'a', 'b'), edge('ac', 'a', 'c'), edge('bd', 'b', 'd'), edge('cd', 'c', 'd'), edge('da', 'd', 'a'), edge('bc', 'b', 'c', false)];

test('shortest paths preserve direction and deterministic ties when input order changes', () => {
    assert.deepEqual(shortestPath(nodes, [...edges].reverse(), 'a', 'd'), { nodeIds: ['a', 'b', 'd'], edgeIds: ['ab', 'bd'] });
    assert.deepEqual(shortestPath(nodes, [edge('bc', 'b', 'c', false)], 'c', 'b'), { nodeIds: ['c', 'b'], edgeIds: ['bc'] });
    assert.equal(shortestPath(nodes, [edge('ab', 'a', 'b')], 'b', 'a'), undefined);
    assert.equal(shortestPath(nodes, edges, 'a', 'isolated'), undefined);
    assert.equal(shortestPath(nodes, edges, 'missing', 'missing'), undefined);
    assert.deepEqual(shortestPath(nodes, edges, 'a', 'a'), { nodeIds: ['a'], edgeIds: [] });
});

test('neighborhood follows requested direction and returns all induced edges without cycling', () => {
    const result = neighborhood(nodes, edges, 'a', 1, 'out');
    assert.deepEqual(result.nodes.map(n => n.id), ['a', 'b', 'c']);
    assert.deepEqual(result.edges.map(e => e.id), ['ab', 'ac', 'bc']);
    assert.deepEqual(neighborhood(nodes, edges, 'a', 1, 'in').nodes.map(n => n.id), ['a', 'd']);
    assert.equal(neighborhood(nodes, edges, 'a', 20, 'both').nodes.length, 4);
    assert.equal(neighborhood(nodes, edges, 'absent', 1, 'both').nodes.length, 0);
});

test('filters combine kind, facet value, text and edge kind with induced endpoints', () => {
    const records = [node('alpha'), { ...node('beta'), attributes: { tags: ['needle'] } }, node('gamma', 'other')];
    const facets = [{ nodeId: 'beta', key: 'phase', value: ['early'], id: 'f', ruleId: 'r', sources: [] }];
    const result = filterGraph(records, [edge('ab', 'alpha', 'beta'), edge('bg', 'beta', 'gamma')], facets, { kind: 'record', facet: 'phase', value: '["early"]', q: 'needle' });
    assert.deepEqual(result.nodes.map(n => n.id), ['beta']);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(filterGraph(records, [edge('ab', 'alpha', 'beta'), edge('bg', 'beta', 'gamma', true, 'call')], [], { edgeKind: 'call' }).edges.map(e => e.id), ['bg']);
});

test('grouping conserves all 5000 nodes and parallel, undirected, internal and loop edges', () => {
    const records = Array.from({ length: 5000 }, (_, i) => node(String(i), i < 2500 ? 'left' : 'right', i < 2500 ? 'a/x.json' : 'b/y.json'));
    const relations = Array.from({ length: 4999 }, (_, i) => edge(String(i), String(i), String(i + 1)));
    relations.push(edge('parallel', '2499', '2500'), edge('undirected', '2500', '2499', false), edge('loop', '0', '0'));
    const result = groupGraph(records, relations, 'kind');
    assert.equal(result.groups.reduce((sum, group) => sum + group.nodeIds.length, 0), 5000);
    assert.equal(result.groups.reduce((sum, group) => sum + group.internalEdges, 0) + result.links.reduce((sum, link) => sum + link.count, 0), relations.length);
    assert.deepEqual(result.links.map(link => link.count).sort(), [1, 2]);
    assert.deepEqual(groupGraph([...records].reverse(), [...relations].reverse(), 'kind'), result);
    assert.deepEqual(groupGraph(records, relations, 'folder').groups.map(group => group.label), ['a', 'b']);
});

test('hub ranking counts unique incident edges with self loops once', () => {
    const result = rankHubs(nodes, [edge('ab', 'a', 'b'), edge('ab2', 'a', 'b'), edge('loop', 'a', 'a'), edge('dangling', 'a', 'missing')]);
    assert.deepEqual(result, [{ id: 'a', degree: 3 }, { id: 'b', degree: 2 }, { id: 'c', degree: 0 }, { id: 'd', degree: 0 }, { id: 'isolated', degree: 0 }]);
});
