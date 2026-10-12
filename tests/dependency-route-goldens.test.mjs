import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orthogonalRoute, reserveDependencyRoute } from '../viewer/dependency-layout.js';
import { routePackageDependencies } from '../viewer/dependency-package-arrows.js';

const goldens = JSON.parse(readFileSync(new URL('./fixtures/dependency-route-goldens.json', import.meta.url), 'utf8'));
for (const fixture of goldens.routes) {
    test(`orthogonal routing preserves frozen path: ${fixture.name}`, () => {
        const { start, end, space } = fixture.input;
        const actual = orthogonalRoute(start, end, { ...space, ...(space.occupied ? { occupied: new Set(space.occupied) } : {}) });
        assert.deepEqual(actual, fixture.expected);
    });
}
for (const fixture of goldens.packages) {
    test(`package routing preserves every frozen direction, path and label: ${fixture.name}`, () => {
        const { flows, boxes, width, height, labelWidth } = fixture.input;
        const actual = routePackageDependencies(flows, new Map(boxes), width, height, () => labelWidth);
        assert.equal(actual.length, flows.length);
        assert.deepEqual(actual, fixture.expected);
    });
}
test('reserved grid edge keys stay canonical in either direction', () => {
    const forward = new Set(), reverse = new Set();
    reserveDependencyRoute([{ x: 8, y: 8 }, { x: 24, y: 8 }, { x: 24, y: 24 }], 64, forward);
    reserveDependencyRoute([{ x: 24, y: 24 }, { x: 24, y: 8 }, { x: 8, y: 8 }], 64, reverse);
    assert.deepEqual([...forward].sort(), ['10:11', '11:12', '12:21', '21:30']);
    assert.deepEqual([...reverse].sort(), [...forward].sort());
});
