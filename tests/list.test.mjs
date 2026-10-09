import test from 'node:test';
import assert from 'node:assert/strict';
import { projectList, cellValue, valueKey } from '../viewer/list-model.js';
const source = { path: 'records.json', line: 1, pointer: '', contentHash: 'hash' };
const node = (id, attributes = {}, kind = 'thing') => ({ id, name: id, kind, attributes, sources: [source], contentHash: id });
const project = (nodes, query = '', kinds = [], facets = []) => projectList(nodes, facets, kinds, new URLSearchParams(query));
test('automatic columns stay stable while text filtering and honor explicit empty configuration', () => {
    const nodes = [node('a', { cost: 10, weight: 2, rare: 1 }), node('b', { cost: 2, weight: 3 })];
    assert.deepEqual(project(nodes, 'q=b').columns.map(c => c.id), ['attribute:cost', 'attribute:weight']);
    assert.deepEqual(project(nodes, '', [{ id: 'thing', columns: [] }]).columns, []);
    assert.deepEqual(project(nodes, '', [{ id: 'absent', columns: ['irrelevant'] }]).columns.map(c => c.id), ['attribute:cost', 'attribute:weight']);
});
test('numeric sorting keeps null and missing last in both directions and separates builtin from attribute name', () => {
    const nodes = [node('b', { cost: 2, name: 'z' }), node('a', { cost: 10, name: 'a' }), node('c', { cost: null }), node('d')];
    assert.deepEqual(project(nodes, 'sort=attribute:cost').nodes.map(n => n.id), ['b', 'a', 'c', 'd']);
    assert.deepEqual(project(nodes, 'sort=attribute:cost&dir=desc').nodes.map(n => n.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(project(nodes, 'sort=name-desc').nodes.map(n => n.id), ['d', 'c', 'b', 'a']);
    assert.deepEqual(project(nodes, 'sort=attribute:name').nodes.map(n => n.id), ['a', 'b', 'c', 'd']);
});
test('typed source values keep number string null and missing distinct and compose with other filters', () => {
    const nodes = [node('a', { cost: 1 }), node('b', { cost: '1' }), node('c', { cost: null }), node('d')];
    for (const [value, id] of [[1, 'a'], ['1', 'b'], [null, 'c'], [undefined, 'd']]) {
        const params = new URLSearchParams({ field: 'attribute:cost', fieldValue: valueKey(value), kind: 'thing', q: id });
        assert.deepEqual(project(nodes, params.toString()).nodes.map(n => n.id), [id]);
    }
    assert.equal(project(nodes, 'field=attribute:absent').unsupported !== undefined, true);
});
test('facet columns retain all values and provenance and support typed and legacy filters', () => {
    const nodes = [node('a'), node('b')], evidence = { ...source, path: 'lens.json' };
    const facets = [{ id: 'f1', nodeId: 'a', key: 'rank', value: 2, sources: [evidence], ruleId: 'derive' }, { id: 'f2', nodeId: 'a', key: 'rank', value: 1, sources: [evidence], ruleId: 'derive' }, { id: 'f3', nodeId: 'b', key: 'rank', value: '1', sources: [evidence], ruleId: 'derive' }];
    const kinds = [{ id: 'thing', columns: ['facet:rank'] }], result = project(nodes, '', kinds, facets);
    assert.deepEqual(cellValue(nodes[0], result.columns[0], facets), { value: [1, 2], sources: [evidence] });
    assert.deepEqual(project(nodes, 'facet=rank&value=1&valueType=json', kinds, facets).nodes.map(n => n.id), ['a']);
    assert.deepEqual(project(nodes, 'facet=rank&value=1', kinds, facets).nodes.map(n => n.id), ['a', 'b']);
    assert.deepEqual(project(nodes, 'q=2', kinds, facets).nodes.map(n => n.id), ['a']);
});
test('canonical object identity ignores source property order', () => {
    assert.equal(valueKey({ b: 2, a: 1 }), valueKey({ a: 1, b: 2 }));
    assert.notEqual(valueKey('@missing'), valueKey(undefined));
});
test('kind and layer scope determine columns before combined filtering, and empty values mean any present facet', () => {
    const nodes = [node('a', { score: 1 }, 'a'), node('b', { other: 2 }, 'b'), node('c', { score: 2 }, 'a')];
    const facets = [{ id: 'f', nodeId: 'a', key: 'tag', value: 'x', sources: [source], ruleId: 'tag' }];
    const kinds = [{ id: 'a', columns: ['score'] }, { id: 'b', columns: ['other'] }, { id: 'outside', columns: ['secret'] }];
    const result = project(nodes, 'kind=a&q=a&field=attribute:score&fieldValue=1&facet=tag&value=%22x%22&valueType=json', kinds, facets);
    assert.deepEqual(result.columns.map(c => c.id), ['attribute:score']);
    assert.deepEqual(result.nodes.map(n => n.id), ['a']);
    assert.deepEqual(project(nodes, 'facet=tag&value=&field=attribute:score&fieldValue=', kinds, facets).nodes.map(n => n.id), ['a']);
    assert.deepEqual(project(nodes.slice(0, 1), '', kinds, facets).columns.map(c => c.id), ['attribute:score']);
});
test('automatic columns have a global two-field budget across unconfigured kinds', () => {
    const nodes = [node('a', { first: 1, shared: 2 }, 'a'), node('b', { second: 3, shared: 4 }, 'b'), node('c', { third: 5 }, 'c')];
    assert.deepEqual(project(nodes).columns.map(c => c.id), ['attribute:shared', 'attribute:first']);
    const configured = [{ id: 'a', columns: ['first'] }, { id: 'c', columns: [] }];
    assert.deepEqual(project(nodes, '', configured).columns.map(c => c.id), ['attribute:first', 'attribute:second', 'attribute:shared']);
});
test('legacy homepage facet links retain JSON array and object display encoding', () => {
    const nodes = [node('array'), node('object'), node('string')];
    const values = [[1, 'two'], { state: 'ready', count: 2 }, '[1,"two"]'];
    const facets = values.map((value, index) => ({ id: `legacy-${index}`, nodeId: nodes[index].id, key: 'detail', value, sources: [source], ruleId: 'detail' }));
    for (const [value, ids] of [[values[0], ['array', 'string']], [values[1], ['object']]]) {
        const params = new URLSearchParams({ facet: 'detail', value: JSON.stringify(value) });
        assert.deepEqual(project(nodes, params.toString(), [], facets).nodes.map(n => n.id), ids);
    }
    const typed = new URLSearchParams({ facet: 'detail', value: valueKey(values[0]), valueType: 'json' });
    assert.deepEqual(project(nodes, typed.toString(), [], facets).nodes.map(n => n.id), ['array']);
});
test('legacy builtin column selectors do not duplicate fixed columns while explicit attributes remain available', () => {
    const nodes = [node('a', { id: 'source-id', name: 'source-name', kind: 'source-kind', cost: 2 })];
    const kinds = [{ id: 'thing', columns: ['id', 'name', 'kind', 'cost', 'attribute:id', 'attribute:name', 'attribute:kind'] }];
    const result = project(nodes, '', kinds);
    assert.deepEqual(result.columns.map(column => column.id), ['attribute:cost', 'attribute:id', 'attribute:name', 'attribute:kind']);
    assert.deepEqual(result.columns.map(column => cellValue(nodes[0], column, []).value), [2, 'source-id', 'source-name', 'source-kind']);
});
