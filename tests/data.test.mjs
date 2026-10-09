import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lattice from '../dist/index.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('JSON records preserve source lines and escaped field pointers', () => {
    const source = input('records.json', '[\n {"id":"a","name":"Alpha","targetId":"b","a/b":{"~key":2}},\n {"id":"b","name":"Beta"}\n]');
    assert.equal(typeof lattice.extractJson, 'function');
    const result = lattice.extractJson(source);
    assert.deepEqual(result.map(record => record.node.id), ['a', 'b']);
    assert.equal(result[0].node.sources[0].line, 2);
    assert.equal(result[1].node.sources[0].line, 3);
    assert.equal(result[0].fields['/a~1b/~0key'].pointer, '/0/a~1b/~0key');
    assert.equal(result[0].fields['/targetId'].line, 2);
});

test('JSON rejects duplicate keys, invalid numbers, trailing input and unsafe keys', () => {
    for (const text of ['{"x":1,"x":2}', '{"x":1e999}', '{"__proto__":{}}', '[1,]', '{"x":01}', '{"x":1} true', '{"x":"bad\nstring"}']) {
        assert.throws(() => lattice.extractJson(input('invalid.json', text)), { name: 'DataInputError' });
    }
});

test('CSV supports BOM, multiline quotes, CRLF and escaped quotes without losing row locations', () => {
    const source = input('records.csv', '\ufeffid,name,targetId\r\na,"First, line\r\nsecond ""quoted""",b\r\nb,Beta,\r\n');
    assert.equal(typeof lattice.extractCsv, 'function');
    const result = lattice.extractCsv(source);
    assert.equal(result[0].node.attributes['name'], 'First, line\r\nsecond "quoted"');
    assert.equal(result[0].node.sources[0].line, 2);
    assert.equal(result[1].node.sources[0].line, 4);
    assert.equal(result[0].fields['/targetId'].line, 3);
});

test('CSV rejects duplicate headers and structurally malformed records', () => {
    for (const text of ['id,id\na,b', 'id,name\na', 'id,name\na,"unfinished', 'id,name\na,b"c', 'id,name\na,"b"x']) {
        assert.throws(() => lattice.extractCsv(input('bad.csv', text)), { name: 'DataInputError' });
    }
});

test('exact ID references create field-sourced edges and diagnose missing references', () => {
    const records = lattice.extractJson(input('items.json', '[{"id":"a","targetId":"b","missingId":"absent","note":"b plus","links":["b"]},{"id":"b"}]'));
    assert.equal(typeof lattice.resolveRecords, 'function');
    const graph = lattice.resolveRecords(records);
    assert.equal(graph.edges.length, 2);
    assert.deepEqual(graph.edges.map(edge => edge.field).sort(), ['/links/0', '/targetId']);
    assert.ok(graph.edges.every(edge => edge.source === 'a' && edge.target === 'b'));
    assert.equal(graph.diagnostics.filter(diagnostic => diagnostic.code === 'unresolved-reference').length, 1);
    assert.equal(graph.edges.find(edge => edge.field === '/targetId').sources[0].pointer, '/0/targetId');
});

test('duplicate aliases are disambiguated without choosing an arbitrary reference target', () => {
    const records = [
        ...lattice.extractJson(input('one.json', '{"id":"same"}')),
        ...lattice.extractJson(input('two.json', '{"id":"same"}')),
        ...lattice.extractJson(input('ref.json', '{"id":"ref","targetId":"same"}')),
    ];
    const result = lattice.resolveRecords(records);
    assert.equal(new Set(result.nodes.map(node => node.id)).size, 3);
    assert.equal(result.edges.length, 0);
    assert.equal(result.diagnostics.filter(d => d.code === 'ambiguous-reference').length, 1);
    assert.deepEqual(lattice.resolveRecords([...records].reverse()), result);
});

test('reference diagnostics distinguish explicit external locators after exact and ambiguous IDs', () => {
    const records = lattice.extractJson(input('references.json', JSON.stringify([
        {
            id: 'source', note: 'https://known.example/id', nested: {
                targetIds: [
                    'https://external.example/item', '//external.example/item', 'mailto:help@example.com', 'tel:+1234567',
                    'core:missing', 'missing', 'https:garbage', 'https://', 'https://duplicate.example/id',
                ]
            }
        },
        { id: 'https://known.example/id' },
        { id: 'https://duplicate.example/id' },
        { id: 'https://duplicate.example/id' },
    ])));
    const result = lattice.resolveRecords(records);
    assert.deepEqual(result.edges.map(({ source, target, field }) => ({ source, target, field })), [
        { source: 'source', target: 'https://known.example/id', field: '/note' },
    ]);
    const references = result.diagnostics.filter(({ code }) => code !== 'duplicate-id');
    assert.deepEqual(references.map(({ code, source }) => [source.pointer, code]).sort(), [
        ...[0, 1, 2, 3].map(index => [`/0/nested/targetIds/${index}`, 'external-reference']),
        ...[4, 5, 6, 7].map(index => [`/0/nested/targetIds/${index}`, 'unresolved-reference']),
        ['/0/nested/targetIds/8', 'ambiguous-reference'],
    ]);
    assert.ok(references.every(({ source }) => source.path === 'references.json' && source.line === 1));
    assert.deepEqual(lattice.resolveRecords([...records].reverse()), result);
    const disabled = lattice.resolveRecords(records.map(record => ({ ...record, references: false })));
    assert.equal(disabled.edges.length, 0);
    assert.ok(disabled.diagnostics.every(({ code }) => code === 'duplicate-id'));
});

test('source boundaries reject traversal, invalid digests and oversized UTF-8 text', () => {
    for (const extract of [lattice.extractJson, lattice.extractCsv]) {
        assert.throws(() => extract(input('../outside.json', '{}')), { name: 'DataInputError' });
        assert.throws(() => extract({ ...input('a.json', '{}'), contentHash: 'bad' }), { name: 'DataInputError' });
        assert.throws(() => extract(input('large.json', '界'.repeat(3_495_254))), { name: 'DataInputError' });
    }
});

test('disambiguated IDs cannot collide with an existing explicit ID', () => {
    const reserved = 'record:one.json#';
    const records = [
        ...lattice.extractJson(input('one.json', '{"id":"same"}')),
        ...lattice.extractJson(input('two.json', '{"id":"same"}')),
        ...lattice.extractJson(input('three.json', JSON.stringify({ id: reserved }))),
    ];
    const result = lattice.resolveRecords(records);
    assert.equal(new Set(result.nodes.map(node => node.id)).size, 3);
    assert.ok(result.nodes.some(node => node.id === reserved));
    assert.throws(() => lattice.resolveRecords([records[0], records[0]]), { name: 'DataInputError' });
});
