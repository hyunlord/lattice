import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { bfsRoute } from './fixtures/dependency-bfs-oracle.mjs';
import { orthogonalRoute } from '../viewer/dependency-layout.js';

const source = readFileSync(new URL('../viewer/dependency-layout.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('routing.ts', source, ts.ScriptTarget.Latest, true);
const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'orthogonalRoute');
assert.ok(fn);
const compiled = ts.transpileModule(fn.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText;
const marker = 'const x = current.cell % columns';
function measured(start, end, space, expanded) {
    assert.ok(compiled.includes(marker), 'test instrumentation must count settled non-goal cells');
    return new Function('start', 'end', 'space', 'expanded', compiled.replace('export ', '').replace(marker, 'expanded.push(current.cell); ' + marker) + '\nreturn orthogonalRoute(start, end, space);')(start, end, space, expanded);
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
for (const fixture of fixtures) test(`A* matches frozen BFS: ${fixture.name}`, () => {
    const { start, end, space } = fixture;
    const expected = bfsRoute(start, end, space);
    assert.deepEqual(orthogonalRoute(start, end, space), expected);
    assert.deepEqual(orthogonalRoute(start, end, space), expected, 'repeat is deterministic');
});
test('A* reduces settled cells in an open directional route without changing its path', () => {
    const start = { x: 8, y: 8 }, end = { x: 480, y: 480 }, space = { width: 512, height: 512, obstacles: [] };
    const baseline = [], candidate = [];
    assert.deepEqual(measured(start, end, space, candidate), bfsRoute(start, end, space, baseline));
    assert.ok(candidate.length < baseline.length / 4, `${candidate.length} candidate vs ${baseline.length} BFS`);
});
test('merging routes exercise equal-cost lexicographic improvements and stale queue entries', () => {
    const instrumented = compiled.replace('export ', '')
        .replace('const known = best.get(current.cell);', 'const known = best.get(current.cell); if (known && (current.g !== known.g || current.code !== known.code)) stats.stale++;')
        .replace('best.set(next, label);', 'if (previous && previous.g === g && code < previous.code) stats.equalCost++; best.set(next, label);');
    assert.notEqual(instrumented, compiled.replace('export ', ''));
    const run = new Function('start', 'end', 'space', 'stats', instrumented + '\nreturn orthogonalRoute(start, end, space);');
    const stats = { stale: 0, equalCost: 0 };
    for (const { start, end, space } of fixtures) assert.deepEqual(run(start, end, space, stats), bfsRoute(start, end, space));
    assert.ok(stats.equalCost > 0, 'fixtures must exercise replacing a longer lexicographic equal-cost path');
    assert.ok(stats.stale > 0, 'fixtures must exercise ignoring outdated queued labels');
});
