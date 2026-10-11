import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('streamed JSON object reader preserves nested values and UTF-8 at every byte boundary', async () => {
    const { parseJsonObjectChunks, readJsonObject } = await import('../bin/json-stream.mjs');
    const text = JSON.stringify({ header: { label: '한글😀', quote: '\\"\n' }, nodes: [null, true, -1.2e20, ['x', { braces: '}][{' }], { escaped: '\\u1234', unicode: '😀' }], empty: [], end: 'done' });
    const bytes = Buffer.from(text);
    for (const size of [1, 2, 3, 7, 64, bytes.length]) {
        function* chunks() { for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size); }
        assert.deepEqual(parseJsonObjectChunks(chunks()), JSON.parse(text));
    }
    const directory = mkdtempSync(join(tmpdir(), 'lattice-json-stream-'));
    try { const path = join(directory, 'data.json'); writeFileSync(path, text); assert.deepEqual(readJsonObject(path), JSON.parse(text)); } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('streamed object reader rejects truncated, decorated and malformed JSON', async () => {
    const { parseJsonObjectChunks } = await import('../bin/json-stream.mjs');
    for (const text of ['', '[]', 'null', '{', '{"a":', '{"a":[1,]}', '{"a":1,}', '{"a":1 "b":2}', '{"a":1}x', '{"a":"unterminated}', '{"a":[{"b":1]}', '{"a":NaN}', '{"a":1,"a":2}', '{"a":01}']) {
        assert.throws(() => parseJsonObjectChunks([Buffer.from(text)]), SyntaxError, text);
    }
    assert.deepEqual(parseJsonObjectChunks([Buffer.from(' \n {"__proto__":{"x":1},"constructor":1} \t ')]), JSON.parse('{"__proto__":{"x":1},"constructor":1}'));
});
