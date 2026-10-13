import test from 'node:test';
import assert from 'node:assert/strict';
import { mobileDependencyCandidates, chooseMobileDependencyFallback } from '../viewer/dependency-layout.js';

test('priority keeps exactly the original six geometries and their canonical ordinal', () => {
    assert.deepEqual(mobileDependencyCandidates.map(({ columns, gap }) => [columns, gap]), [[2, 56], [2, 48], [2, 32], [2, 24], [3, 24], [1, 24]]);
    assert.deepEqual([...mobileDependencyCandidates].sort((a, b) => a.order - b.order).map(({ columns, gap, memberGap }) => [columns, gap, memberGap]), [[3, 24, 48], [2, 24, 80], [2, 32, 80], [2, 48, 80], [2, 56, 80], [1, 24, 48]]);
});
const trial = (order, overrides = {}) => ({ ...mobileDependencyCandidates.find(candidate => candidate.order === order), height: 600, routed: 8, required: 12, contained: true, ...overrides });
test('all-failed partial ties keep canonical order rather than evaluation priority', () => {
    const values = mobileDependencyCandidates.map(candidate => trial(candidate.order));
    assert.equal(chooseMobileDependencyFallback(values, 400), values.find(candidate => candidate.order === 0));
    assert.deepEqual(values.map(candidate => candidate.order), [4, 3, 2, 1, 0, 5]);
});
test('short viewport rejects tall complete layout in favor of complete smaller gap', () => {
    const tall = trial(4, { routed: 12 }), fit = trial(1, { height: 300, routed: 12 });
    assert.equal(chooseMobileDependencyFallback([tall, fit], 400), fit);
});
test('dense partial fallback keeps coverage and impossible fit remains explicit', () => {
    const more = trial(3, { height: 800, routed: 11 }), short = trial(1, { height: 200, routed: 9 });
    assert.equal(chooseMobileDependencyFallback([more, short], 400), more);
    assert.notEqual(more.routed, more.required);
});
test('long unreadable labels cannot defeat contained routes and zero-flow ties stay canonical', () => {
    const unreadable = trial(4, { height: 100, routed: 12, contained: false }), readable = trial(2, { height: 500, routed: 10 });
    assert.equal(chooseMobileDependencyFallback([unreadable, readable], 400), readable);
    const zero = mobileDependencyCandidates.map(candidate => trial(candidate.order, { routed: 0, required: 0, height: 200 }));
    assert.equal(chooseMobileDependencyFallback(zero, 100), zero.find(candidate => candidate.order === 0));
    assert.equal(chooseMobileDependencyFallback([], 100), undefined);
});
