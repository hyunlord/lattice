import assert from 'node:assert/strict';
import test from 'node:test';
import { extractYaml, extractYamlDocument } from '../dist/adapters/yaml.js';
const input = text => ({ path: 'data/items.yaml', text, contentHash: 'a'.repeat(64) });

test('YAML named collection retains values and original field lines', () => {
    const source = input('items:\n  - id: item:a\n    name: "Quoted: name"\n    description: |\n      first\n      second\n    enabled: true\n    count: 2\n');
    const [record] = extractYaml(source, '/items');
    assert.equal(record.node.id, 'item:a');
    assert.equal(record.node.attributes.description, 'first\nsecond\n');
    assert.equal(record.node.attributes.enabled, true);
    assert.equal(record.fields['/description'].line, 4);
    assert.equal(record.fields['/description'].endLine, 6);
    assert.equal(record.node.sources[0].pointer, '/items/0');
});

test('YAML aliases attribute expanded fields to their use', () => {
    const source = input('base: &base\n  amount: 3\nitems:\n  - id: a\n    config: *base\n');
    const [record] = extractYaml(source, '/items');
    assert.deepEqual(record.node.attributes.config, { amount: 3 });
    assert.equal(record.fields['/config/amount'].line, 5);
});

test('YAML documents have distinct pointers and original lines', () => {
    const records = extractYaml(input('name: First\n---\nname: Second\n'));
    assert.deepEqual(records.map(record => record.node.sources[0].pointer), ['/documents/0', '/documents/1']);
    assert.deepEqual(records.map(record => record.node.sources[0].line), [1, 3]);
    assert.notEqual(records[0].node.id, records[1].node.id);
    assert.throws(() => extractYamlDocument(input('name: First\n---\nname: Second\n')), /single YAML document/);
});

test('YAML lens extraction keeps one mapping without flattening its collections', () => {
    const record = extractYamlDocument(input('name: Example\nkinds:\n  - id: item\n'));
    assert.equal(record.node.attributes.kinds[0].id, 'item');
    assert.equal(record.fields['/kinds/0/id'].line, 3);
});

test('YAML rejects ambiguous or non JSON data with source errors', () => {
    for (const text of ['a: 1\na: 2\n', 'a: !custom value\n', 'a: &a {nested: *a}\n', '? [a, b]\n: value\n', 'a: .inf\n', '__proto__: bad\n']) {
        assert.throws(() => extractYaml(input(text)), error => error.name === 'DataInputError' && error.path === 'data/items.yaml');
    }
});
