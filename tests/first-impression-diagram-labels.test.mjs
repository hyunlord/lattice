import test from 'node:test';
import assert from 'node:assert/strict';
import { placeDiagramLabels } from '../viewer/first-impression-diagram-labels.js';
class Label {
    attributes = new Map(); textContent = '4 files'; removed = false;
    getBBox() { return { width: 40, height: 12 }; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    remove() { this.removed = true; }
}
test('on-route label moves away from a box instead of overlapping its boundary', () => {
    const element = new Label();
    placeDiagramLabels([{ element, points: [{ x: 0, y: 40 }, { x: 200, y: 40 }] }], [{ x: 80, y: 30, width: 40, height: 20 }], { width: 200, height: 80 });
    assert.equal(element.removed, false);
    assert.equal(Number(element.attributes.get('y')), 40);
    const x = Number(element.attributes.get('x'));
    assert.ok(x + 24 <= 78 || x - 24 >= 122);
});
test('label without room is omitted while leaving its underlying route untouched', () => {
    const element = new Label(), points = [{ x: 0, y: 40 }, { x: 20, y: 40 }];
    placeDiagramLabels([{ element, points }], [], { width: 200, height: 80 });
    assert.equal(element.removed, true);
    assert.deepEqual(points, [{ x: 0, y: 40 }, { x: 20, y: 40 }]);
});
