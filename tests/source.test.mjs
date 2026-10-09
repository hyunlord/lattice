import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const source = value => ({ op: 'source', value });
const literal = value => ({ op: 'literal', value });
const map = (input, value) => ({ op: 'map', input, value });
const pointers = sources => sources.map(source => source.pointer);

test('source retains exact fields across derived scopes, lexical bindings, nested items and findings without leaking other variables', () => {
    const data = input('records.json', [{ id: 'a', budget: 5, unrelated: 99, steps: [{ id: 'b', cost: 2 }, { cost: 3 }] }, { id: 'b', budget: 8, unrelated: 88, steps: [] }]);
    const lensInput = input('.lattice/lens.json', {
        schemaVersion: 1, name: 'Sources', kinds: [],
        derived: [
            { id: 'allBudget', scope: 'graph', value: get('graph', 'nodes', '*', 'budget') },
            { id: 'unrelated', scope: 'node', value: get('node', 'unrelated') },
            { id: 'chosen', scope: 'node', value: get('node', 'budget') },
            { id: 'transitive', scope: 'node', value: get('vars', 'chosen') },
        ],
        facets: Object.entries({
            direct: source(get('node', 'budget')),
            derived: source(get('vars', 'transitive')),
            repeated: source(get('node', 'budget')),
            graph: source(get('vars', 'allBudget')),
            graphCount: source({ op: 'count', value: get('graph', 'nodes') }),
            lexical: { op: 'let', bindings: { other: get('node', 'unrelated'), chosen: get('vars', 'transitive') }, value: source(get('vars', 'chosen')) },
            wildcard: source(get('node', 'steps', '*', 'cost')),
            nested: map(get('node', 'steps'), source(get('item', 'cost'))),
            scalar: map(get('node', 'steps', '*', 'cost'), source(get('item'))),
            missing: source(get('node', 'missing')),
            constant: source(literal({ id: 'b', cost: 20 })),
        }).map(([id, value]) => ({ id, key: id, value })),
        findings: [{ id: 'evidence', severity: 'warning', query: {}, metrics: { chosen: map(get('vars', 'targetValues'), source(get('item', 'derived', 'chosen'))), targets: source({ op: 'count', value: get('vars', 'targets') }), targetValues: source({ op: 'count', value: get('vars', 'targetValues') }) }, template: 'Evidence' }],
    });
    const result = applyLens(extractJson(data), parseLens(lensInput), lensInput);
    const facets = Object.fromEntries(result.facets.filter(facet => facet.nodeId === 'a').map(facet => [facet.key, facet.value]));
    for (const key of ['direct', 'derived', 'repeated', 'lexical']) assert.deepEqual(pointers(facets[key]), ['/0/budget']);
    assert.deepEqual(pointers(facets.graph), ['/0/budget', '/1/budget']);
    assert.deepEqual(pointers(facets.graphCount), ['/0', '/1']);
    assert.deepEqual(pointers(result.findings[0].metrics.targets), ['/0', '/1']);
    assert.ok(pointers(result.findings[0].metrics.targetValues).includes('/0/budget'));
    assert.ok(pointers(result.findings[0].metrics.targetValues).includes('/1'));
    assert.deepEqual(pointers(facets.wildcard), ['/0/steps/0/cost', '/0/steps/1/cost']);
    for (const key of ['nested', 'scalar']) assert.deepEqual(facets[key].map(pointers), [['/0/steps/0/cost'], ['/0/steps/1/cost']]);
    assert.deepEqual(facets.missing, []);
    assert.deepEqual(facets.constant, []);
    assert.deepEqual(result.findings[0].metrics.chosen.map(pointers), [['/0/budget'], ['/1/budget']]);
    assert.equal(facets.direct[0].contentHash, data.contentHash);
    assert.equal(facets.direct[0].path, 'records.json');
});

test('source follows scalar collection membership through filter, unique, flatten and concat', () => {
    const data = input('records.json', [{ id: 'a', values: [2, 3, 2], nested: [[4], [5]] }]);
    const selected = { op: 'filter', input: get('node', 'values'), where: { op: 'eq', left: get('item'), right: 2 } };
    const expressions = {
        filtered: map(selected, source(get('item'))),
        unique: map({ op: 'unique', value: selected }, source(get('item'))),
        flattened: map({ op: 'flatten', value: get('node', 'nested') }, source(get('item'))),
        concatenated: map({ op: 'concat', values: [selected, literal([0])] }, source(get('item'))),
    };
    const lensInput = input('.lattice/lens.json', { schemaVersion: 1, name: 'Collections', kinds: [], facets: Object.entries(expressions).map(([id, value]) => ({ id, key: id, value })) });
    const values = Object.fromEntries(applyLens(extractJson(data), parseLens(lensInput), lensInput).facets.map(facet => [facet.key, facet.value.map(pointers)]));
    assert.deepEqual(values.filtered, [['/0/values/0'], ['/0/values/2']]);
    assert.deepEqual(values.unique, [['/0/values/0', '/0/values/2']]);
    assert.deepEqual(values.flattened, [['/0/nested/0/0'], ['/0/nested/1/0']]);
    assert.deepEqual(values.concatenated, [['/0/values/0'], ['/0/values/2'], []]);
});
