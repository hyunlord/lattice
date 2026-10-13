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

test('dependency ranks place consumers above foundations and retain cycles at one semantic rank', () => {
    const ids = ['foundation', 'middle', 'start', 'side'];
    const edges = [{ source: 'start', target: 'middle' }, { source: 'middle', target: 'foundation' }, { source: 'side', target: 'foundation' }];
    const layout = structureLayout(ids, edges, 1392, ['start']);
    const byId = new Map(layout.boxes.map(box => [box.id, box]));
    for (const edge of edges) assert.ok(byId.get(edge.source).y < byId.get(edge.target).y);
    assert.equal(byId.get('start').y, Math.min(...layout.boxes.map(box => box.y)));
});

test('distinct directions never share a nonzero collinear corridor', () => {
    const ids = Array.from({ length: 9 }, (_, index) => String(index));
    const edges = ids.flatMap(source => ids.filter(target => source !== target).map(target => ({ source, target })));
    for (const width of [334, 1392]) {
        const layout = structureLayout(ids, edges, width);
        const segments = layout.routes.flatMap(route => route.points.slice(1).map((b, index) => ({ edge: route.edgeIndex, a: route.points[index], b })));
        for (let i = 0; i < segments.length; i++) for (const b of segments.slice(i + 1)) {
            const a = segments[i];
            if (a.edge === b.edge) continue;
            const vertical = a.a.x === a.b.x && b.a.x === b.b.x && a.a.x === b.a.x && Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y)) > Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y));
            const horizontal = a.a.y === a.b.y && b.a.y === b.b.y && a.a.y === b.a.y && Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x)) > Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x));
            assert.equal(vertical || horizontal, false, `shared corridor ${a.edge}/${b.edge} at ${width}`);
        }
    }
});

test('cycles share a dependency rank while a six-direction map stays compact with clear arrow approaches', () => {
    const edges = [{ source: 'entry', target: 'a' }, { source: 'entry', target: 'b' }, { source: 'a', target: 'b' }, { source: 'b', target: 'a' }, { source: 'a', target: 'base' }, { source: 'b', target: 'base' }];
    for (const width of [334, 1392]) {
        const layout = structureLayout(['base', 'b', 'a', 'entry'], edges, width, ['entry']);
        assert.equal(layout.routes.length, edges.length);
        assert.ok(layout.height < 850);
        assert.equal(layout.boxes.find(box => box.id === 'a').y, layout.boxes.find(box => box.id === 'b').y);
        for (const route of layout.routes) {
            const before = route.points.at(-2), end = route.points.at(-1);
            assert.equal(before.x, end.x);
            assert.ok(end.y - before.y >= 12);
        }
    }
});

test('isolated non-start parts do not add a row above the connected dependency layers', () => {
    const edges = [{ source: 'entry', target: 'middle' }, { source: 'middle', target: 'base' }];
    const layout = structureLayout(['unconnected', 'entry', 'middle', 'base'], edges, 1392, ['entry']);
    const byId = new Map(layout.boxes.map(box => [box.id, box]));
    assert.equal(byId.get('unconnected').y, byId.get('base').y);
    assert.ok(Math.max(...layout.boxes.map(box => box.y + box.height)) <= 570);
});
