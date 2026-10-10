import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, parseLens } from '../dist/index.js';

const source = config => {
    const text = JSON.stringify({ schemaVersion: 1, name: 'Schema', kinds: [], ...config }, null, 2);
    return { path: '.lattice/lens.json', text, contentHash: createHash('sha256').update(text).digest('hex') };
};

test('lens declarations and expressions are validated before any records exist', () => {
    const scenarios = [
        [{ surprise: true }, '/surprise'],
        [{ kinds: [{ id: 'entry', label: 'Entries', files: [], hidden: 'yes' }] }, '/kinds/0/hidden'],
        [{ facets: [{ id: 'x', key: 'x', value: { op: 'count', vaule: 1 } }] }, '/facets/0/value/vaule'],
        [{ facets: [{ id: 'x', key: 'x', value: { op: 'mystery' } }] }, '/facets/0/value/op'],
        [{ facets: [{ id: 'x', key: 'x', value: { op: 'get', from: 'node', path: [-1] } }] }, '/facets/0/value/path/0'],
        [{ facets: [{ id: 'x', key: 'x' }, { id: 'x', key: 'y' }] }, '/facets/1/id'],
        [{ findings: [{ id: 'f', metrics: {}, template: '', gate: { metric: 'x', comparator: 'equals', threshold: 0 } }] }, '/findings/0/gate/comparator'],
        [{ views: [{ id: 'v', label: '', type: 'table', columns: [{ id: 'n', label: '', value: 1 }, { id: 'n', label: '', value: 2 }] }] }, '/views/0/columns/1/id'],
        [{ edges: [{ id: 'e', matrix: { ids: { op: 'literal', value: [] }, cells: { op: 'misspelled' } } }] }, '/edges/0/matrix/cells/op'],
        [{ facets: [{ id: 'x', key: 'x', value: { op: 'codeSupport', rule: 'absent' } }] }, '/facets/0/value/rule'],
        [{ presentation: { facets: { 'with/slash~': { labell: '' } } } }, '/presentation/facets/with~1slash~0/labell'],
    ];
    for (const [config, pointer] of scenarios) {
        assert.throws(() => parseLens(source(config)), error => error.name === 'DataInputError' && error.path === '.lattice/lens.json' && error.line > 1 && error.reason.startsWith(pointer + ':'));
    }
});

test('schema preserves open domain names, literal payloads, defaults and unknown gate metrics', () => {
    const input = source({
        kinds: [{ id: 'catalog', label: '', files: [], kindField: 'category', selections: [{ files: [], records: '' }] }],
        synthetics: [{ id: 'fixed', kind: 'undeclared-domain-kind', name: '', attributes: { op: 'not-an-expression', arbitrary: [] } }],
        facets: [{ id: 'f', key: 'arbitrary-key', kinds: ['structural-or-dynamic'], value: { op: 'let', bindings: { 'arbitrary/name': { op: 'literal', value: { op: 'not-an-expression' } } }, value: { op: 'case', cases: [] } } }],
        findings: [{ id: 'f', metrics: { 'arbitrary/metric': null }, template: '', gate: { metric: 'not-present', comparator: 'eq', threshold: 0 } }],
        presentation: { layers: { future: { label: '' } }, facets: { future: { values: { 'any/value': '' } } } },
    });
    const lens = parseLens(input);
    assert.equal(applyLens([], lens, input).findings[0].gate.status, 'unknown');
});

test('JSON lens is one root mapping rather than a projected record collection', () => {
    const input = source({});
    const text = `[${input.text}]`;
    assert.throws(() => parseLens({ ...input, text, contentHash: createHash('sha256').update(text).digest('hex') }), /Expected lens object/u);
});

test('operation glob matchers preserve repeated wildcard and literal matching', async () => {
    const { createGlobMatcher, matchesGlob } = await import('../dist/lens/index.js');
    const match = createGlobMatcher();
    for (const pattern of ['**/*.json', 'data/*?.json', '한글/😀.[x]', '', '**']) {
        for (const path of ['a.json', 'data/a.json', 'data/sub/a.json', '한글/😀.[x]', '']) {
            const expected = matchesGlob(path, pattern);
            assert.equal(match(path, pattern), expected);
            assert.equal(match(path, pattern), expected);
            assert.equal(createGlobMatcher()(path, pattern), expected);
        }
    }
});

test('human view declarations materialize generic roles and presentation controls', () => {
    const columns = [{ id: 'summary', label: 'Summary', role: 'summary', value: { op: 'literal', value: 'Text' } }];
    const views = [{ id: 'cards', type: 'gallery', label: 'Cards', columns, edgeKinds: ['uses'] }, { id: 'states', type: 'status', label: 'States', columns }, { id: 'links', type: 'graph', label: 'Links', edgeKinds: ['uses'] }, { id: 'matrix', type: 'matrix', label: 'Matrix', edgeKinds: ['uses'], cellDisplay: 'label' }];
    const presentation = { home: { viewIds: ['cards'], distributions: false }, detail: { summaryFields: [{ label: 'Summary', path: ['description'] }], relationships: [{ label: 'Uses', edgeKinds: ['uses'], direction: 'outgoing' }], rawAttributes: 'collapsed' } };
    const input = source({ views, presentation });
    const result = applyLens([], parseLens(input), input);
    assert.deepEqual(result.views.map(view => view.type), ['gallery', 'status', 'graph', 'matrix']);
    assert.equal(result.views[0].query.columns[0].role, 'summary');
    assert.deepEqual(result.views[0].query.edgeKinds, ['uses']);
    assert.equal(result.views[3].query.cellDisplay, 'label');
    assert.deepEqual(result.presentation, presentation);
    assert.throws(() => parseLens(source({ views: [{ ...views[0], columns: [{ ...columns[0], role: 'unknown' }] }] })), { name: 'DataInputError' });
});
