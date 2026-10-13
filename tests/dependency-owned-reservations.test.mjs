import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const current = readFileSync(new URL('../viewer/dependency-layout.ts', import.meta.url), 'utf8');
const original = readFileSync(new URL('./fixtures/dependency-owned-original.txt', import.meta.url), 'utf8');
function load(source, typedArray = Uint8Array) {
    const file = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
    const names = ['orthogonalRoute', 'routeOwnedGrid', 'reserveDependencyRoute', 'visitReservedEdges', 'createOwnedDependencyRouter'];
    const declarations = file.statements.filter(n => ts.isFunctionDeclaration(n) && names.includes(n.name?.text)).map(n => n.getText(file));
    const code = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace(/export /g, '');
    return new Function('Uint8Array', code + '\nreturn {orthogonalRoute,reserveDependencyRoute,create:typeof createOwnedDependencyRouter === "function" ? createOwnedDependencyRouter : undefined};')(typedArray);
}
const baseline = load(original), actual = load(current);
function owned(width, height, api = actual) { assert.equal(typeof api.create, 'function', 'owned numeric router must exist'); return api.create(width, height); }

test('owned router keeps every two-by-two reservation subset and direction equal to original', () => {
    const points = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }];
    const pairs = [[0, 1], [0, 2], [1, 3], [2, 3]];
    for (let mask = 0; mask < 16; mask++) {
        const router = owned(8, 8), occupied = new Set();
        pairs.forEach(([a, b], bit) => { if (mask & (1 << bit)) { router.reserve([points[a], points[b]]); baseline.reserveDependencyRoute([points[a], points[b]], 8, occupied); } });
        for (const a of points) for (const b of points) assert.deepEqual(router.route(a, b, []), baseline.orthogonalRoute(a, b, { width: 8, height: 8, obstacles: [], occupied }));
    }
});

test('owned incremental accepted routes preserve decimals, duplicates, reverse and diagonal reservation order', () => {
    const router = owned(64, 64), occupied = new Set();
    const inputs = [[{ x: 8.25, y: 8.1 }, { x: 56.1, y: 56.25 }], [{ x: 56, y: 8 }, { x: 8, y: 56 }], [{ x: 8, y: 56 }, { x: 56, y: 8 }]];
    for (const [a, b] of inputs) {
        const obstacles = [{ x: 32, y: 16, width: 8, height: 24 }];
        const expected = baseline.orthogonalRoute(a, b, { width: 64, height: 64, obstacles, occupied });
        assert.deepEqual(router.route(a, b, obstacles), expected);
        for (const points of [expected, [...expected].reverse(), [{ x: 8, y: 8 }, { x: 16, y: 16 }]]) { router.reserve(points); baseline.reserveDependencyRoute(points, 64, occupied); }
    }
});

test('coordinate aliases invalidate numeric reservations without dropping prior or remaining Set edges', () => {
    const router = owned(16, 16), occupied = new Set();
    const paths = [[{ x: 0, y: 8 }, { x: 8, y: 8 }], [{ x: 24, y: 0 }, { x: 32, y: 0 }, { x: 8, y: 16 }], [{ x: 0, y: 0 }, { x: 8, y: 0 }]];
    for (const path of paths) { router.reserve(path); baseline.reserveDependencyRoute(path, 16, occupied); }
    for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) {
        const start = { x: a % 3 * 8, y: Math.floor(a / 3) * 8 }, end = { x: b % 3 * 8, y: Math.floor(b / 3) * 8 };
        assert.deepEqual(router.route(start, end, []), baseline.orthogonalRoute(start, end, { width: 16, height: 16, obstacles: [], occupied }));
    }
});

test('single-column reciprocal occupancy and out-of-range query fallback match the original', () => {
    for (const [width, height, path, start, end] of [[0, 32, [{ x: 0, y: 8 }, { x: 0, y: 16 }], { x: 0, y: 0 }, { x: 0, y: 32 }], [16, 16, [{ x: 0, y: 8 }, { x: 8, y: 8 }], { x: 24, y: 0 }, { x: 8, y: 8 }]]) {
        const router = owned(width, height), occupied = new Set(); router.reserve(path); baseline.reserveDependencyRoute(path, width, occupied);
        for (const [a, b] of [[start, end], [end, start]]) assert.deepEqual(router.route(a, b, []), baseline.orthogonalRoute(a, b, { width, height, obstacles: [], occupied }));
    }
});

test('owned scratch is allocated once, capped independently and isolated per invocation', () => {
    const sizes = []; class Counted extends Uint8Array { constructor(n) { super(n); sizes.push(n); } }
    const api = load(current, Counted), first = owned(64, 64, api); assert.deepEqual(sizes, [81]);
    first.reserve([{ x: 0, y: 0 }, { x: 8, y: 0 }]); first.reserve([{ x: 8, y: 0 }, { x: 0, y: 0 }]); assert.deepEqual(sizes, [81]);
    for (let i = 0; i < 3; i++) first.route({ x: 0, y: 0 }, { x: 16, y: 0 }, []);
    assert.deepEqual(sizes, [81, 81, 81, 81], 'only existing per-call blocked scratch is added');
    const second = owned(64, 64, api); assert.notDeepEqual(first.route({ x: 0, y: 0 }, { x: 8, y: 0 }, []), second.route({ x: 0, y: 0 }, { x: 8, y: 0 }, []));
    sizes.length = 0; owned(8184, 8184, api); assert.deepEqual(sizes, [1048576]);
    sizes.length = 0; owned(8192, 8184, api); assert.deepEqual(sizes, []);
});

test('public routing retains occupied getter and stateful has evaluation and thrown-object order', () => {
    function execute(api, shouldThrow) {
        const log = [], failure = { exact: true }, set = new Set(['malformed']);
        set.has = function (key) { log.push(['has', key]); if (log.filter(x => x[0] === 'has').length === 3) { if (shouldThrow) throw failure; this.add(key); } return Set.prototype.has.call(this, key); };
        const space = { width: 32, height: 32, obstacles: [], get occupied() { log.push(['get']); return set; } };
        try { return { log, result: api.orthogonalRoute({ x: 0, y: 0 }, { x: 24, y: 24 }, space) }; } catch (error) { assert.equal(error, failure); return { log, threw: true }; }
    }
    for (const throwing of [false, true]) assert.deepEqual(execute(actual, throwing), execute(baseline, throwing));
});

test('public reservations preserve point getters, add property lookup and thrown-object order', () => {
    function execute(api, shouldThrow) {
        const log = [], failure = { exact: true }, occupied = new Set(); let calls = 0;
        Object.defineProperty(occupied, 'add', { get() { log.push('add-get'); return key => { log.push(key); if (++calls === 2 && shouldThrow) throw failure; Set.prototype.add.call(occupied, key); }; } });
        const point = (x, y) => ({ get x() { log.push('x'); return x; }, get y() { log.push('y'); return y; } });
        try { api.reserveDependencyRoute([point(0, 0), point(16, 8), point(0, 0)], 32, occupied); return { log, values: [...occupied] }; } catch (error) { assert.equal(error, failure); return { log, threw: true }; }
    }
    for (const throwing of [false, true]) assert.deepEqual(execute(actual, throwing), execute(baseline, throwing));
});

test('public optional occupancy and method getter exceptions retain their precise evaluation order', () => {
    function execute(api, failureAt) {
        const log = [], failure = { failureAt }; let reads = 0;
        const membership = { get has() { log.push('method'); if (failureAt === 'method') throw failure; return key => { log.push(key); return false; }; } };
        const space = { get width() { log.push('width'); return 32; }, get height() { log.push('height'); return 32; }, get obstacles() { log.push('obstacles'); return []; }, get occupied() { log.push('occupied'); if (failureAt === 'occupied') throw failure; return ++reads % 2 ? undefined : membership; } };
        try { return { log, points: api.orthogonalRoute({ x: 0, y: 0 }, { x: 16, y: 16 }, space) }; } catch (error) { assert.equal(error, failure); return { log, threw: true }; }
    }
    for (const boundary of ['none', 'occupied', 'method']) assert.deepEqual(execute(actual, boundary), execute(baseline, boundary));
});
