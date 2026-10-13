import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../viewer/dependency-package-arrows.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('arrows.ts', source, ts.ScriptTarget.Latest, true);
function fixture() {
    const declarations = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === 'measurePackageDependencyGeometry' || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(file) === 'countText'));
    assert.ok(declarations.some(node => ts.isFunctionDeclaration(node)), 'actual shared routing measurement helper exists');
    const state = { font: '12px serif', scale: 7, height: 12, fail: false, measured: [], children: [], bounds: { left: 10, top: 20, width: 600, height: 400 }, a: { left: 20, top: 40, width: 120, height: 80 }, b: { left: 300, top: 220, width: 120, height: 80 }, caption: { left: 25, top: 25, width: 100, height: 15 } };
    const box = rect => ({ getBoundingClientRect: () => rect });
    const flows = [{ source: 'a', target: 'b', count: 3, weight: 3 }, { source: 'b', target: 'a', count: 4, weight: 4, projectSourceFiles: ['x'] }];
    const scene = { host: { getBoundingClientRect: () => state.bounds, querySelectorAll: () => [box(state.caption)] }, graph: { append(node) { state.children.push(node); } }, boxes: new Map([['a', box(state.a)], ['b', box(state.b)]]), flows, names: new Map() };
    const context = createContext({ getComputedStyle: () => ({ font: state.font }), svg: () => ({ textContent: '', classList: { add() { } }, getBBox() { if (state.fail) throw new Error('measurement failed'); state.measured.push(this.textContent); return { width: this.textContent.length * state.scale, height: state.height }; }, remove() { state.children.splice(state.children.indexOf(this), 1); } }) });
    runInContext(ts.transpileModule(declarations.map(node => node.getText(file)).join('\n').replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { state, scene, read: () => context.measurePackageDependencyGeometry(scene) };
}
test('shared snapshot preserves exact relative obstacles and measures every selected label including unrouted flows', () => {
    const item = fixture(), result = item.read();
    assert.deepEqual(JSON.parse(JSON.stringify(result.rectangles.get('a'))), { x: 10, y: 20, width: 120, height: 80 });
    assert.deepEqual(JSON.parse(JSON.stringify(result.rectangles.get('caption:0'))), { x: 15, y: 5, width: 100, height: 15 });
    assert.deepEqual(item.state.measured, ['3', '4']);
    assert.equal(result.labelWidths.get(item.scene.flows[0]), 7); assert.equal(result.labelWidths.get(item.scene.flows[1]), 7);
    assert.equal(item.state.children.length, 0); assert.equal(typeof result.key, 'string'); assert.equal(item.read().key, result.key);
});
for (const [name, change] of [
    ['internal box motion with unchanged outer bounds', item => { item.state.a.left += .125; }],
    ['caption bounds', item => { item.state.caption.width += .125; }],
    ['font face with unchanged label width', item => { item.state.font = '12px monospace'; }],
    ['font label width without box changes', item => { item.state.scale += .125; }],
    ['unplaced label count', item => { item.scene.flows[1].count = 123; }],
    ['flow weight', item => { item.scene.flows[0].weight++; }],
    ['ordered flows', item => { item.scene.flows.reverse(); }],
    ['host bounds', item => { item.state.bounds.width += .125; }],
]) test('geometry reuse invalidates on ' + name, () => { const item = fixture(), original = item.read().key; change(item); assert.notEqual(item.read().key, original); });
test('nonfinite measurements never certify a reusable geometry key', () => {
    const item = fixture(); item.state.scale = NaN; assert.equal(item.read().key, undefined); item.state.scale = 7; item.state.a.left = Infinity; assert.equal(item.read().key, undefined);
});
test('measurement failure removes temporary SVG measurement and propagates failure', () => {
    const item = fixture(); item.state.fail = true; assert.throws(item.read, /measurement failed/u); assert.equal(item.state.children.length, 0);
});
test('drawing consumes the prepared snapshot without a second DOM measurement', () => {
    const declaration = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'drawPackageDependencyArrows');
    const flow = { source: 'a', target: 'b', count: 3, weight: 3 }, rectangles = new Map(), labelWidths = new Map([[flow, 29]]);
    const graph = { dataset: {}, replaceChildren() { }, setAttribute() { }, append() { } };
    const scene = { host: { getBoundingClientRect() { throw new Error('duplicate measurement'); } }, graph, flows: [flow], boxes: new Map(), names: new Map() };
    let calls = 0;
    const context = createContext({ crypto: { randomUUID: () => 'fixture' }, svg: () => ({ classList: { add() { } }, setAttribute() { }, append() { } }), routePackageDependencies(flows, measured, width, height, labelWidth) { calls++; assert.equal(flows, scene.flows); assert.equal(measured, rectangles); assert.equal(width, 600); assert.equal(height, 400); assert.equal(labelWidth(flow), 29); return []; } });
    runInContext(ts.transpileModule(declaration.getText(file).replace('export function', 'function'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.drawPackageDependencyArrows(scene, { bounds: { width: 600, height: 400 }, rectangles, labelWidths, key: 'prepared' });
    assert.equal(calls, 1); assert.equal(graph.dataset.unrouted, '1');
});
test('native font completion redraws while mounted and is removed with the existing observer lifecycle', () => {
    const overview = readFileSync(new URL('../viewer/dependency-overview.ts', import.meta.url), 'utf8');
    const lifecycle = overview.slice(overview.indexOf('    const resize = (): void => redraw();'), overview.lastIndexOf('\n}'));
    assert.ok(lifecycle.includes('observer.disconnect()'), 'execute actual overview lifecycle tail');
    const fonts = new EventTarget(), window = new EventTarget(); let draws = 0, renders = 0, disconnected = 0;
    const context = createContext({ document: { fonts }, window, diagram: {}, disposed: false, redraw: () => { draws++; }, render: () => { renders++; }, ResizeObserver: class { observe() { } disconnect() { disconnected++; } } });
    const compiled = ts.transpileModule(`globalThis.dispose = (() => { ${lifecycle} })();`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    runInContext(compiled, context);
    assert.equal(renders, 1); fonts.dispatchEvent(new Event('loadingdone')); assert.equal(draws, 1);
    window.dispatchEvent(new Event('resize')); assert.equal(draws, 2);
    context.dispose(); assert.equal(disconnected, 1); assert.equal(context.disposed, true);
    fonts.dispatchEvent(new Event('loadingdone')); window.dispatchEvent(new Event('resize')); assert.equal(draws, 2);
});
