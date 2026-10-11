import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLoopMap } from '../dist/query/loop-map-model.js';
const source = { path: 'src/main.ts', line: 1, pointer: '', contentHash: 's' };
const node = (id, kind = 'module', attributes = {}) => ({ id, kind, name: id, attributes, sources: [source], contentHash: id });
const config = { kinds: [], loop: { stages: [{ id: 'stage', title: 'Stage', summary: '', unit: 'items', kinds: ['record'], systemIds: [] }], relationGroups: [], summaryFields: [], flows: [] } };
test('high fanout adjacency construction traverses edge values linearly', () => {
    const count = 300, edges = Array.from({ length: count }, (_, i) => ({ id: 'fan' + i, kind: 'imports', source: 'a', target: 'b', directed: true, field: '', sources: [] }));
    const original = Array.prototype[Symbol.iterator]; let visits = 0;
    Array.prototype[Symbol.iterator] = function* () { for (let i = 0; i < this.length; i++) { const value = this[i]; if (value && typeof value === 'object' && typeof value.id === 'string' && value.id.startsWith('fan')) visits++; yield value; } };
    try { buildLoopMap([node('a', 'record'), node('b', 'record')], edges, [], config, 'fixture'); } finally { Array.prototype[Symbol.iterator] = original; }
    assert.ok(visits < count * 20, `edge value visits ${visits} should remain linear in ${count} edges`);
});
test('structural overview does not project callable attributes or remove callable source data', () => {
    let reads = 0;
    const symbols = Array.from({ length: 1000 }, (_, i) => ({ ...node('f' + i, 'function'), get attributes() { reads++; return { module: 'm' }; } }));
    const nodes = [node('m'), ...symbols];
    const model = buildLoopMap(nodes, [], [], { kinds: [] }, 'fixture', { projection: 'overview' });
    assert.deepEqual(model.nodes.map(item => item.id), ['m']); assert.equal(reads, 0); assert.equal(nodes.length, 1001);
});
test('facet node membership is indexed once for full catalog projection', () => {
    let reads = 0;
    const nodes = Array.from({ length: 100 }, (_, i) => node('r' + i, 'record'));
    const facets = nodes.map(n => ({ id: 'facet' + n.id, get nodeId() { reads++; return n.id; }, key: 'status', value: 'present', ruleId: 's', sources: [] }));
    const model = buildLoopMap(nodes, [], facets, { ...config, loop: { ...config.loop, statusFacet: 'status' } }, 'fixture');
    assert.equal(model.nodes.length, 100); assert.ok(reads <= facets.length * 3, `facet node reads ${reads}`);
});
test('overview projection retains configured domain catalogs and default full callable catalogs', () => {
    const nodes = [node('m'), node('fn', 'function')];
    assert.equal(buildLoopMap(nodes, [], [], { kinds: [] }, 'fixture').nodes.length, 2);
    const configured = { ...config, loop: { ...config.loop, stages: [{ ...config.loop.stages[0], kinds: ['function'] }], catalogKinds: ['function'] } };
    assert.deepEqual(buildLoopMap(nodes, [], [], configured, 'fixture', { projection: 'overview' }).nodes.map(node => node.id), ['fn']);
});
