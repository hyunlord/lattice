import assert from 'node:assert/strict';
import test from 'node:test';
import * as lattice from '../dist/index.js';

test('canonical JSON sorts object keys without sorting meaningful arrays', () => {
    const input = { z: [2, 1], a: { y: true, x: null } };
    assert.equal(typeof lattice.canonicalJson, 'function');
    const result = lattice.canonicalJson(input);
    assert.equal(result, '{"a":{"x":null,"y":true},"z":[2,1]}');
});

test('canonical JSON rejects values that would silently lose information', () => {
    const cyclic = {}; cyclic.self = cyclic;
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { throw new Error('must not run'); } });
    for (const input of [undefined, NaN, Infinity, 1n, () => 1, new Date(), [undefined], Array(2), cyclic, getter, JSON.parse('{"__proto__":{}}')]) {
        assert.throws(() => lattice.canonicalJson(input), { name: 'GraphInputError' });
    }
});

test('canonical JSON preserves numeric-looking property lexicographic order', () => {
    assert.equal(lattice.canonicalJson({ 2: 'b', 10: 'a' }), '{"10":"a","2":"b"}');
});

test('oversized sparse arrays fail before allocating their missing entries', () => {
    assert.throws(() => lattice.canonicalJson(Array(2 ** 32 - 1)), { name: 'GraphInputError' });
});

test('shared JSON subobjects remain legal without being mistaken for cycles', () => {
    const shared = { label: 'shared' };
    assert.equal(lattice.canonicalJson({ a: shared, b: shared }), '{"a":{"label":"shared"},"b":{"label":"shared"}}');
});
