import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { bfsRoute } from './fixtures/dependency-bfs-oracle.mjs';
import { orthogonalRoute, reserveDependencyRoute, dependencyRouteIntersects, createOwnedDependencyRouter } from '../viewer/dependency-layout.js';

const source = readFileSync(new URL('../viewer/dependency-layout.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('routing.ts', source, ts.ScriptTarget.Latest, true);
const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'orthogonalRoute');
assert.ok(fn);
const compiled = ts.transpileModule(fn.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
function predecessorAllocations(start, end, space) {
    const allocations = { maps: 0, indexed: [] };
    class ObservedMap extends Map {
        constructor(...args) { super(...args); allocations.maps++; }
    }
    class ObservedInt32Array extends Int32Array {
        constructor(length) { super(length); allocations.indexed.push(length); }
    }
    const route = new Function('Map', 'Int32Array', compiled.replace('export ', '') + '\nreturn orthogonalRoute;')(ObservedMap, ObservedInt32Array);
    return { points: route(start, end, space), allocations };
}
test('failed probe uses bounded indexed predecessor storage without a Map', () => {
    const start = { x: 8, y: 8 }, end = { x: 56, y: 56 };
    const space = { width: 64, height: 64, obstacles: [{ x: 32, y: 0, width: 0, height: 64 }] };
    const actual = predecessorAllocations(start, end, space);
    assert.deepEqual(actual.points, bfsRoute(start, end, space));
    assert.deepEqual(actual.allocations, { maps: 0, indexed: [81] });
});
test('successful probes do not allocate indexed predecessor storage', () => {
    for (const end of [{ x: 56, y: 56 }, { x: 8, y: 8 }]) {
        const start = { x: 8, y: 8 }, space = { width: 64, height: 64, obstacles: [] };
        const actual = predecessorAllocations(start, end, space);
        assert.deepEqual(actual.points, bfsRoute(start, end, space));
        assert.deepEqual(actual.allocations.indexed, []);
    }
});
test('large grids and out-of-range endpoints retain Map predecessor behavior', () => {
    const cases = [
        { start: { x: 0, y: 0 }, end: { x: 8, y: 16 }, space: { width: 8, height: 4194304, obstacles: [{ x: 0, y: 8, width: 8, height: 0 }] } },
        { start: { x: -8, y: 0 }, end: { x: 16, y: 16 }, space: { width: 32, height: 32, obstacles: [{ x: 8, y: 0, width: 0, height: 32 }] } },
    ];
    for (const { start, end, space } of cases) {
        const actual = predecessorAllocations(start, end, space);
        assert.deepEqual(actual.points, bfsRoute(start, end, space));
        assert.deepEqual(actual.allocations, { maps: 1, indexed: [] });
    }
});
test('raw decimal endpoints retain exact 23f route goldens', () => {
    const frozen = JSON.parse(readFileSync(new URL('./fixtures/dependency-decimal-route-goldens.json', import.meta.url), 'utf8'));
    assert.equal(frozen.sourceCommit, '23f35764e0f31c03b3bd6966ed40d494f4bc1040');
    for (const { input, expected } of frozen.cases) assert.deepEqual(orthogonalRoute(input.start, input.end, input.space), expected);
});
function measured(start, end, space, stats) {
    const probeMarker = 'const probeNext =';
    const bfsMarker = 'const current = queue[index];';
    assert.ok(compiled.includes(probeMarker) && compiled.includes(bfsMarker), 'both bounded probe and frozen BFS must be instrumented');
    const instrumented = compiled.replace('export ', '').replace(probeMarker, 'stats.probe++; ' + probeMarker).replace(bfsMarker, bfsMarker + ' stats.bfs.push(current);');
    return new Function('start', 'end', 'space', 'stats', instrumented + '\nreturn orthogonalRoute(start, end, space);')(start, end, space, stats);
}
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/dependency-route-goldens.json', import.meta.url), 'utf8')).routes.map(item => ({ name: item.name, ...item.input, space: { ...item.input.space, occupied: new Set(item.input.space.occupied ?? []) } }));
fixtures.push(JSON.parse(readFileSync(new URL('./fixtures/dependency-merging-route.json', import.meta.url), 'utf8')));
let seed = 92831;
const next = limit => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % limit; };
for (let index = 0; index < 160; index++) {
    const width = 64 + next(12) * 8, height = 64 + next(12) * 8, columns = Math.ceil(width / 8) + 1;
    const obstacles = Array.from({ length: next(14) }, () => ({ x: next(width / 8) * 8 - 1, y: next(height / 8) * 8 - 1, width: 2 + next(3) * 8, height: 2 + next(3) * 8 }));
    const occupied = new Set(Array.from({ length: next(30) }, () => { const a = next(columns * (height / 8)), b = a + (next(2) ? 1 : columns); return `${a}:${b}`; }));
    const point = () => ({ x: next(width / 8 + 1) * 8 + (index % 3 ? 0 : .25), y: next(height / 8 + 1) * 8 + (index % 3 ? 0 : -.25) });
    fixtures.push({ name: `seeded-${index}`, start: point(), end: point(), space: { width, height, obstacles, occupied } });
}
for (const fixture of fixtures) test(`bounded routing matches frozen BFS: ${fixture.name}`, () => {
    const { start, end, space } = fixture;
    const expected = bfsRoute(start, end, space);
    assert.deepEqual(orthogonalRoute(start, end, space), expected);
    assert.deepEqual(orthogonalRoute(start, end, space), expected, 'repeat is deterministic');
});
test('open route uses only a bounded Manhattan probe and preserves the BFS path', () => {
    const start = { x: 8, y: 8 }, end = { x: 480, y: 480 }, space = { width: 512, height: 512, obstacles: [] };
    const stats = { probe: 0, bfs: [] };
    assert.deepEqual(measured(start, end, space, stats), bfsRoute(start, end, space));
    assert.equal(stats.probe, 118);
    assert.equal(stats.bfs.length, 0);
});
test('failed probes restart the identical BFS without sharing visited or reserved state', () => {
    let fast = 0, fallback = 0;
    for (const { start, end, space } of fixtures) {
        const stats = { probe: 0, bfs: [] }, baseline = [], reserved = [...space.occupied ?? []];
        assert.deepEqual(measured(start, end, space, stats), bfsRoute(start, end, space, baseline));
        const distance = Math.abs(Math.round(start.x / 8) - Math.round(end.x / 8)) + Math.abs(Math.round(start.y / 8) - Math.round(end.y / 8));
        assert.ok(stats.probe <= distance, 'speculation never exceeds the Manhattan lower bound');
        assert.deepEqual([...space.occupied ?? []], reserved, 'routing must not mutate reservations');
        if (stats.bfs.length) { fallback++; assert.deepEqual(stats.bfs, baseline, 'fallback expansion sequence must exactly equal frozen BFS'); }
        else fast++;
    }
    assert.ok(fast > 0 && fallback > 0, 'both execution paths are exercised');
});

test('dense geometry preserves all twelve frozen BFS routes with bounded speculation per attempt', () => {
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/dependency-dense-geometry.json', import.meta.url), 'utf8'));
    const packageSource = readFileSync(new URL('../viewer/dependency-package-arrows.js', import.meta.url), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '');
    let attempts = 0, fallbacks = 0;
    const checkedFactory = (width, height) => {
        const router = createOwnedDependencyRouter(width, height), occupied = new Set();
        return {
            reserve(points) { router.reserve(points); reserveDependencyRoute(points, width, occupied); }, route(start, end, obstacles) {
                const space = { width, height, obstacles, occupied };
                attempts++;
                const stats = { probe: 0, bfs: [] }, baseline = [];
                const actual = measured(start, end, space, stats);
                assert.deepEqual(actual, bfsRoute(start, end, space, baseline));
                const distance = Math.abs(Math.round(start.x / 8) - Math.round(end.x / 8)) + Math.abs(Math.round(start.y / 8) - Math.round(end.y / 8));
                assert.ok(stats.probe <= distance);
                if (stats.bfs.length) { fallbacks++; assert.deepEqual(stats.bfs, baseline); }
                assert.deepEqual(router.route(start, end, obstacles), actual, 'owned reservations preserve the instrumented public path');
                return actual;
            }
        };
    };
    const route = new Function('createOwnedDependencyRouter', 'dependencyRouteIntersects', packageSource + ';return routePackageDependencies;')(checkedFactory, dependencyRouteIntersects);
    const actual = route(fixture.flows, new Map(fixture.boxes), fixture.width, fixture.height, flow => flow.labelWidth);
    assert.equal(actual.length, 12);
    assert.deepEqual(actual, fixture.expected);
    assert.ok(attempts > 12 && fallbacks > 0, 'dense geometry must exercise rejected candidates and fallback');
});
