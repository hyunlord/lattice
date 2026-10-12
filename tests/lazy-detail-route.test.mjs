import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../viewer/app.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('app.ts', source, ts.ScriptTarget.Latest, true);
const route = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'route');
assert.ok(route);
const routeSource = ts.transpileModule(route.getText(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }, transformers: {
        before: [context => root => {
            const visit = node => ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? context.factory.updateCallExpression(node, context.factory.createIdentifier('loadModule'), undefined, node.arguments) : ts.visitEachChild(node, visit, context);
            return ts.visitNode(root, visit);
        }]
    }
}).outputText;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fixture() {
    const events = [], imports = [], pending = deferred();
    const main = { replaceChildren() { events.push('clear'); }, append() { }, querySelector() { }, setAttribute() { }, removeAttribute() { } };
    const record = { graph: { nodes: [{ name: 'Selected' }] } };
    const loader = { async index() { events.push('index'); return {}; }, async node() { events.push('node'); return record; } };
    const context = createContext({
        URLSearchParams, location: { hash: '#/node/selected' }, routeRequest: 0, renderVersion: 0, main,
        firstOverview: { hash: 'hash', repository: { commit: 'commit' }, defaultLayer: 'layer', layers: [{ id: 'layer', deferred: false, model: { title: 'Home' } }] },
        fullGraphLoaded: false, nodeDetailLoader: undefined, suffix: '?generation=7', disposeScreen: undefined,
        document: { body: { classList: { add() { }, remove() { } } }, querySelectorAll: () => [], title: '' }, window: { scrollTo() { } },
        loadModule: async path => { imports.push(path); await pending.promise; return path === './node-detail-data.js' ? { createNodeDetailLoader: (overview, suffix) => { events.push(['loader', overview.hash, suffix]); return loader; } } : path === './node-history.js' ? { renderNodeHistory() { } } : path === './views-records.js' ? { humanValue() { } } : { renderNodeDetail: (_main, options) => { events.push(['detail', options.record.graph.nodes[0].name]); } }; },
        fetch: async url => { events.push(['fetch', url]); return { ok: true, json: async () => url.startsWith('./snapshots') ? [] : {} }; },
        parsePresentation: value => value, parseSnapshots: value => value, needsModel: () => false,
        home: model => events.push(['home', model.title]), render: () => events.push('full-render'), requireGraph: async () => events.push('full-graph'),
        loadFailure: error => events.push(['failure', error.message]), pageHeading() { }, link() { }, routeHref: value => value,
        nodeHref() { }, sources() { }, findingView() { }, kindLabel() { }, layerLabel() { }, display() { }, mountFunctionLogic() { }
    });
    runInContext(routeSource, context);
    return { context, events, imports, pending, run: () => context.route() };
}
test('detail modules are absent from app static runtime imports', () => {
    for (const statement of file.statements) if (ts.isImportDeclaration(statement) && ['./node-detail.js', './node-detail-data.js'].includes(statement.moduleSpecifier.text)) assert.equal(statement.importClause?.isTypeOnly, true);
});
test('direct detail waits for both modules and preserves generation', async () => {
    const item = fixture(), request = item.run();
    assert.deepEqual(item.imports.sort(), ['./node-detail-data.js', './node-detail.js']); assert.deepEqual(item.events, []);
    item.pending.resolve(); await request;
    assert.deepEqual(item.events.find(event => Array.isArray(event) && event[0] === 'loader'), ['loader', 'hash', '?generation=7']);
    assert.ok(item.events.some(event => Array.isArray(event) && event[0] === 'detail')); assert.deepEqual(item.imports.sort(), ['./node-detail-data.js', './node-detail.js']);
    assert.deepEqual(item.events.filter(event => Array.isArray(event) && event[0] === 'fetch').map(event => event[1]), ['./presentation.json?generation=7', './snapshots.json?generation=7']);
});
test('navigation to home while imports wait prevents stale loader or detail work', async () => {
    const item = fixture(), detail = item.run(); item.context.location.hash = '#/home'; await item.run();
    item.pending.resolve(); await detail;
    assert.deepEqual(item.events, ['clear', ['home', 'Home']]); assert.equal(item.context.nodeDetailLoader, undefined);
});
test('route retries a rejected importer; native browser fetch failures may require reload', async () => {
    const item = fixture(), request = item.run(); item.pending.reject(new Error('module unavailable')); await request;
    assert.deepEqual(item.events, [['failure', 'module unavailable']]);
    item.context.loadModule = async path => path === './node-detail-data.js' ? { createNodeDetailLoader: () => ({ index: async () => undefined }) } : { renderNodeDetail() { } };
    await item.run(); assert.deepEqual(item.events.slice(1), ['full-graph', 'full-render']);
});
test('home loads no helpers and full graph loads only legacy helpers', async () => {
    const home = fixture(); home.context.location.hash = '#/home'; await home.run(); assert.deepEqual(home.imports, []); assert.deepEqual(home.events, ['clear', ['home', 'Home']]);
    const full = fixture(); full.context.fullGraphLoaded = true; full.pending.resolve(); await full.run(); assert.deepEqual(full.imports, ['./node-history.js', './views-records.js']); assert.deepEqual(full.events, ['full-graph', 'full-render']);
});

test('missing packed detail index falls through to graph and legacy helpers', async () => {
    const item = fixture(); item.context.loadModule = async path => { item.imports.push(path); return path === './node-detail-data.js' ? { createNodeDetailLoader: () => ({ index: async () => undefined }) } : { renderNodeDetail() { }, renderNodeHistory() { }, humanValue() { } }; };
    await item.run(); assert.deepEqual(item.imports, ['./node-detail-data.js', './node-detail.js', './node-history.js', './views-records.js']);
    assert.deepEqual(item.events, ['full-graph', 'full-render']);
});
test('missing packed node record keeps not-found result without legacy imports', async () => {
    const item = fixture(); item.context.loadModule = async path => { item.imports.push(path); return path === './node-detail-data.js' ? { createNodeDetailLoader: () => ({ index: async () => ({}), node: async () => undefined }) } : { renderNodeDetail() { throw new Error('unexpected detail'); } }; };
    await item.run(); assert.deepEqual(item.imports, ['./node-detail-data.js', './node-detail.js']);
    assert.ok(!item.events.includes('full-graph')); assert.ok(!item.events.includes('full-render'));
});
