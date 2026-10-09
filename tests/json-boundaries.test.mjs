import assert from 'node:assert/strict';
import test from 'node:test';
import { extractJson } from '../dist/adapters/json.js';
const source = (text) => ({ path: 'nested.json', text, contentHash: 'a'.repeat(64) });

test('JSON named collection selection retains absolute sources and relative fields', () => {
    const input = source('{\n "a/b": {"~items": [\n {"id":"a","nested":{"id":"b"}}\n ]}}');
    const result = extractJson(input, '/a~1b/~0items');
    assert.equal(result.length, 1);
    assert.equal(result[0].node.id, 'a');
    assert.equal(result[0].node.sources[0].pointer, '/a~1b/~0items/0');
    assert.equal(result[0].node.sources[0].line, 3);
    assert.equal(result[0].fields['/nested/id'].pointer, '/a~1b/~0items/0/nested/id');
    assert.equal(extractJson(input, '/a~1b/~0items/0/nested')[0].node.id, 'b');
});

test('JSON rejects missing, noncanonical or scalar record selectors', () => {
    const input = source('{"rows":[{"id":"a"}],"none":null}');
    for (const pointer of ['rows', '/rows/00', '/rows/-', '/rows/1', '/rows/0/id', '/none', '/missing', '/rows/~2']) {
        assert.throws(() => extractJson(input, pointer), { name: 'DataInputError' });
    }
});

test('JSON rejects excessive nesting, duplicate decoded keys and invalid strings', () => {
    for (const text of [
        '{"x":' + '['.repeat(129) + '0' + ']'.repeat(129) + '}',
        '{"x":1,"\\u0078":2}',
        '{"x":"\\uZZZZ"}',
        '{"x":"unterminated}',
        '{"constructor":0}',
    ]) assert.throws(() => extractJson(source(text)), { name: 'DataInputError' });
    assert.equal(extractJson(source('\ufeff{\r\n"id":"a"\r\n}'))[0].fields['/id'].line, 2);
});

test('JSON extraction preserves every source when processing a large collection', () => {
    const count = 10000;
    const result = extractJson(source(JSON.stringify(Array.from({ length: count }, (_, index) => ({ id: `item:${index}`, n: index })))));
    assert.equal(result.length, count);
    assert.equal(result.at(-1).fields['/n'].pointer, '/9999/n');
    assert.throws(() => extractJson(source('[' + Array(100001).fill('{}').join(',') + ']')), { name: 'DataInputError' });
});

test('JSON stops at the selected collection limit before parsing an invalid excess item', () => {
    const oversized = '[' + Array(100000).fill('{}').join(',') + ',INVALID]';
    for (const [text, pointer] of [[oversized, ''], ['{"rows":' + oversized + '}', '/rows']]) {
        assert.throws(() => extractJson(source(text), pointer), {
            name: 'DataInputError',
            reason: 'collection exceeds the 100000 record limit',
        });
    }
});
