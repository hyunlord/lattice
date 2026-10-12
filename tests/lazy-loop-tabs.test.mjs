import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../viewer/loop-map.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('loop-map.ts', source, ts.ScriptTarget.Latest, true);
const render = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'renderLoopMap');
assert.ok(render);
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); };

function fixture({ view = 'loop', missing = () => { }, routeWritten = () => { }, construct = () => { }, select = () => { } } = {}) {
    let capturedUI;
    const nodes = [], loads = [], selected = [], counts = { focus: 0, catalog: 0, cleaned: 0, loopCleaned: 0 };
    function element(tag, text = '', className = '') {
        const value = {
            tag, textContent: text, className, children: [], attributes: {}, hidden: false,
            append(...items) { this.children.push(...items); for (const item of items) item.parentElement = this; },
            replaceChildren(...items) { this.children = []; this.append(...items); },
            setAttribute(key, content) { this.attributes[key] = content; },
            removeAttribute(key) { delete this.attributes[key]; },
            focus() { this.focused = true; }, scrollIntoView() { }, querySelector() { return null; },
            get firstElementChild() { return this.children[0]; }
        }; nodes.push(value); return value;
    }
    const modules = {
        './loop-map-focus.js': { createFocusView() { counts.focus++; construct(); return { select(id) { selected.push(id); select(id); }, cleanup() { counts.cleaned++; } }; } },
        './loop-map-catalog.js': { renderLoopCatalog() { counts.catalog++; } }
    };
    const pending = new Map();
    const load = path => { loads.push(path); return new Promise((resolve, reject) => pending.set(path, { resolve: () => resolve(modules[path]), reject })); };
    const context = createContext({
        element, glyph: () => element('i'), label: node => node.kind, document: { createTextNode: text => ({ textContent: text }) }, crypto: { randomUUID: () => 'fixture' },
        readLoopRoute: () => ({ view }), writeLoopRoute: routeWritten, structuralScopeModel: model => model,
        renderLoopOverview: (_host, ui) => { capturedUI = ui; return () => { counts.loopCleaned++; }; }, createFocusView: modules['./loop-map-focus.js'].createFocusView, renderLoopCatalog: modules['./loop-map-catalog.js'].renderLoopCatalog,
        __load: load, console
    });
    const code = ts.transpileModule(render.getText(file).replace(/^export /, '').replace(/import\((['"])(\.\/loop-map-(?:focus|catalog)\.js)\1\)/g, '__load("$2")') + '\nglobalThis.renderTabs = renderLoopMap;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    runInContext(code, context);
    const host = element('main'), model = { title: 'Fixture', nodes: [{ id: 'a', kind: 'file', status: 'unknown' }, { id: 'b', kind: 'file', status: 'unknown' }], stages: [], flows: [], statusLabels: { present: 'present' }, defaultFocus: 'a' };
    const dispose = context.renderTabs(host, model, { onMissingNode: missing });
    const tab = name => nodes.find(node => node.attributes.role === 'tab' && node.textContent === name);
    return { nodes, loads, counts, selected, dispose, tab, ui: capturedUI, resolve: path => pending.get(path)?.resolve(), reject: path => pending.get(path)?.reject(new Error('fixture failure')) };
}

test('initial loop excludes focus/catalog runtime imports and construction', () => {
    const imports = file.statements.filter(ts.isImportDeclaration).filter(node => !node.importClause?.isTypeOnly).map(node => node.moduleSpecifier.text);
    assert.ok(!imports.includes('./loop-map-focus.js'));
    assert.ok(!imports.includes('./loop-map-catalog.js'));
    const f = fixture(); assert.deepEqual(f.loads, []); assert.equal(f.counts.focus, 0); assert.equal(f.counts.catalog, 0); f.dispose();
});

test('focus activation is immediate but construction waits for its module', async () => {
    const f = fixture(); f.tab('하나씩 보기').onclick();
    assert.equal(f.tab('하나씩 보기').attributes['aria-selected'], 'true');
    assert.equal(f.counts.focus, 0); assert.deepEqual(f.loads, ['./loop-map-focus.js']);
    f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 1); assert.deepEqual(f.selected, ['a']); f.dispose(); assert.equal(f.counts.cleaned, 1);
});

test('dispose while import is pending cannot construct or install an observer', async () => {
    const f = fixture(); f.tab('하나씩 보기').onclick(); f.dispose(); f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 0); assert.equal(f.counts.cleaned, 0);
});

test('tab supersession does not construct a stale focus panel', async () => {
    const f = fixture(); f.tab('하나씩 보기').onclick(); f.tab('도감').onclick();
    f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 0);
    f.resolve('./loop-map-catalog.js'); await tick(); assert.equal(f.counts.catalog, 1); f.dispose();
});

test('synchronous route-write disposal invalidates pending focus', async () => {
    let dispose = () => { }; const f = fixture({ routeWritten: () => dispose() }); dispose = f.dispose;
    f.tab('하나씩 보기').onclick(); f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 0);
});

test('synchronous disposal during focus construction cleans the new handle once', async () => {
    let dispose = () => { }; const f = fixture({ construct: () => dispose() }); dispose = f.dispose;
    f.tab('하나씩 보기').onclick(); f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 1); assert.equal(f.counts.cleaned, 1); assert.deepEqual(f.selected, []);
});

test('synchronous disposal during first selection cleans the handle once', async () => {
    let dispose = () => { }; const f = fixture({ select: () => dispose() }); dispose = f.dispose;
    f.tab('하나씩 보기').onclick(); f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 1); assert.equal(f.counts.cleaned, 1);
});

test('direct catalog initializes only its module and keyboard preserves active focus', async () => {
    const f = fixture({ view: 'catalog' }); assert.deepEqual(f.loads, ['./loop-map-catalog.js']); f.resolve('./loop-map-catalog.js'); await tick(); assert.equal(f.counts.catalog, 1);
    f.tab('도감').onkeydown({ key: 'Home', preventDefault() { } });
    assert.equal(f.tab('한눈에 보는 순환').attributes['aria-selected'], 'true'); assert.equal(f.tab('한눈에 보는 순환').focused, true); f.dispose();
});

test('latest selection wins and repeated activation coalesces import and construction', async () => {
    const f = fixture(); f.ui.openFocus('a'); f.ui.openFocus('b');
    assert.deepEqual(f.loads, ['./loop-map-focus.js']); f.resolve('./loop-map-focus.js'); await tick();
    assert.equal(f.counts.focus, 1); assert.deepEqual(f.selected, ['b']);
    f.tab('도감').onclick(); f.tab('하나씩 보기').onclick(); assert.equal(f.counts.focus, 1); f.dispose();
});

test('missing nodes do not load focus and active failure exposes retry', async () => {
    const missing = []; const f = fixture({ missing: id => missing.push(id) }); f.ui.openFocus('absent'); assert.deepEqual(missing, ['absent']); assert.deepEqual(f.loads, []);
    f.tab('하나씩 보기').onclick(); f.reject('./loop-map-focus.js'); await tick();
    const retry = f.nodes.find(node => node.tag === 'button' && node.textContent === '다시 시도'); assert.ok(retry); retry.onclick(); f.resolve('./loop-map-focus.js'); await tick(); assert.equal(f.counts.focus, 1); f.dispose();
});

test('stale rejection cannot clear active catalog busy state or add errors', async () => {
    const f = fixture(); f.tab('하나씩 보기').onclick(); f.tab('도감').onclick(); const catalog = f.nodes.find(node => node.id === 'loop-map-fixture-panel-catalog');
    f.reject('./loop-map-focus.js'); await tick(); assert.equal(catalog.attributes['aria-busy'], 'true'); assert.ok(!f.nodes.some(node => node.attributes.role === 'alert'));
    f.resolve('./loop-map-catalog.js'); await tick(); assert.equal(catalog.attributes['aria-busy'], undefined); f.dispose();
});
