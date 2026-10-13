import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const current = readFileSync(new URL('../viewer/dependency-layout.ts', import.meta.url), 'utf8');
const original = readFileSync(new URL('./fixtures/dependency-owned-original.txt', import.meta.url), 'utf8');

function load(source) {
    const file = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
    const names = new Set(['orthogonalRoute', 'routeWithOccupancy', 'routeOwnedGrid', 'reserveDependencyRoute', 'visitReservedEdges', 'createOwnedDependencyRouter']);
    const declarations = file.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text)).map(node => node.getText(file));
    const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
    const parents = [];
    class Parents extends Int32Array {
        constructor(size) {
            super(size);
            return new Proxy(this, {
                get(target, key) { return Reflect.get(target, key, target); },
                set(target, key, value) {
                    if (/^\d+$/.test(String(key))) parents.push([Number(key), value - 1]);
                    return Reflect.set(target, key, value, target);
                },
            });
        }
    }
    class ParentMap extends Map {
        set(key, value) { parents.push([key, value]); return super.set(key, value); }
    }
    const context = vm.createContext({ Int32Array: Parents, Map: ParentMap });
    vm.runInContext('globalThis.sortCalls = 0; const nativeSort = Array.prototype.sort; Array.prototype.sort = function (...args) { globalThis.sortCalls++; return nativeSort.apply(this, args); };', context);
    const api = vm.runInContext(code + '\n({ orthogonalRoute, reserveDependencyRoute, create: typeof createOwnedDependencyRouter === "function" ? createOwnedDependencyRouter : undefined })', context);
    return { ...api, parents, reset() { parents.length = 0; context.sortCalls = 0; }, sorts() { return context.sortCalls; } };
}

const baseline = load(original), actual = load(current);
const plain = value => JSON.parse(JSON.stringify(value));

function compare(width, height, obstacles, paths, start, end) {
    const router = actual.create(width, height), occupied = new Set();
    for (const path of paths) {
        router.reserve(path);
        baseline.reserveDependencyRoute(path, width, occupied);
    }
    baseline.reset(); actual.reset();
    const expected = baseline.orthogonalRoute(start, end, { width, height, obstacles, occupied });
    const result = router.route(start, end, obstacles);
    assert.deepEqual(plain(result), plain(expected));
    assert.deepEqual(actual.parents, baseline.parents, 'every parent write and discovery tie must match');
    return actual.sorts();
}

test('bounded owned routing removes neighbor sorting on greedy and forward BFS paths', () => {
    const start = { x: 0, y: 8 }, end = { x: 32, y: 8 };
    for (const obstacles of [[], [{ x: 16, y: 0, width: 0, height: 16 }], [{ x: 16, y: 0, width: 0, height: 32 }]]) {
        assert.equal(compare(32, 32, obstacles, [], start, end), 0, 'owned integer-grid path must not sort neighbor arrays');
    }
});

test('all three-by-two obstacle subsets preserve routes and parent discovery for every endpoint pair', () => {
    const points = Array.from({ length: 6 }, (_, index) => ({ x: index % 3 * 8, y: Math.floor(index / 3) * 8 }));
    for (let mask = 0; mask < 64; mask++) {
        const obstacles = points.filter((_, bit) => mask & (1 << bit)).map(point => ({ ...point, width: 0, height: 0 }));
        for (const start of points) for (const end of points) compare(16, 8, obstacles, [], start, end);
    }
});

test('all three-by-two reservation subsets preserve routes and parent discovery for every endpoint pair', () => {
    const points = Array.from({ length: 6 }, (_, index) => ({ x: index % 3 * 8, y: Math.floor(index / 3) * 8 }));
    const edges = [[0, 1], [1, 2], [3, 4], [4, 5], [0, 3], [1, 4], [2, 5]];
    for (let mask = 0; mask < 128; mask++) {
        const paths = edges.filter((_, bit) => mask & (1 << bit)).map(([a, b]) => [points[a], points[b]]);
        for (const start of points) for (const end of points) compare(16, 8, [], paths, start, end);
    }
});

test('one-row, one-column, coincident endpoints and mixed blockers preserve the original route and discovery', () => {
    for (const [width, height] of [[32, 0], [0, 32], [32, 32]]) {
        const start = { x: 0, y: 0 }, end = { x: width, y: height };
        const paths = [[{ x: 0, y: 0 }, { x: Math.min(8, width), y: Math.min(8, height) }]];
        for (const [a, b] of [[start, end], [end, start], [start, start]]) compare(width, height, [{ x: 16, y: 8, width: 0, height: 16 }], paths, a, b);
    }
});

test('fractional targets, coordinate aliases and invalidated occupancy preserve fallback routes and discovery', () => {
    for (const [start, end, paths] of [
        [{ x: 0.25, y: 8.1 }, { x: 24.5, y: 16.25 }, []],
        [{ x: 40, y: 0 }, { x: 16, y: 16 }, []],
        [{ x: 0, y: 0 }, { x: 32, y: 32 }, [[{ x: 40, y: 0 }, { x: 48, y: 0 }]]],
    ]) compare(32, 32, [{ x: 16, y: 8, width: 0, height: 16 }], paths, start, end);
});
