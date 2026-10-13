import test from 'node:test';
import assert from 'node:assert/strict';
import { structureLayout } from '../viewer/first-impression-diagram-layout.js';

test('structure layout preserves directed dependencies and keeps mobile boxes in bounds', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const edges = [{ source: 'a', target: 'b' }, { source: 'a', target: 'c' }, { source: 'c', target: 'a' }, { source: 'd', target: 'e' }];
    for (const width of [358, 1392]) {
        const result = structureLayout(ids, edges, width);
        assert.equal(result.boxes.length, 5);
        assert.equal(result.routes.length, 4);
        for (const box of result.boxes) assert.ok(box.x >= 0 && box.x + box.width <= width);
        for (const route of result.routes) {
            const source = result.boxes.find(box => box.id === route.source);
            const target = result.boxes.find(box => box.id === route.target);
            const onBoundary = (p, box) => (p.x === box.x || p.x === box.x + box.width) && p.y >= box.y && p.y <= box.y + box.height || (p.y === box.y || p.y === box.y + box.height) && p.x >= box.x && p.x <= box.x + box.width;
            assert.ok(onBoundary(route.points[0], source));
            assert.ok(onBoundary(route.points.at(-1), target));
            for (let i = 1; i < route.points.length; i++) {
                const a = route.points[i - 1], b = route.points[i];
                for (const box of result.boxes) {
                    const crosses = a.x === b.x ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height : a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;
                    assert.equal(crosses, false, `${route.source}→${route.target} crosses ${box.id}`);
                }
            }
        }
    }
});

test('dense component directions remain routable and reciprocal counts use separate ports', () => {
    const ids = Array.from({ length: 9 }, (_, index) => String(index));
    const edges = ids.flatMap(source => ids.filter(target => source !== target).map(target => ({ source, target })));
    for (const width of [334, 1392]) {
        const layout = structureLayout(ids, edges, width);
        assert.equal(layout.routes.length, edges.length);
        const forward = layout.routes.find(route => route.source === '0' && route.target === '1');
        const reverse = layout.routes.find(route => route.source === '1' && route.target === '0');
        assert.notDeepEqual(forward.points, [...reverse.points].reverse());
    }
});
