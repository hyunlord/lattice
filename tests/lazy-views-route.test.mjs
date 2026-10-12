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
function fixture(hash = '#/explore') {
    const events = [], imports = [], pending = deferred(), graph = deferred();
    const screen = () => events.push('dispose');
    const context = createContext({
        URLSearchParams, location: { hash }, routeRequest: 0, renderVersion: 4, disposeScreen: screen,
        firstOverview: undefined, fullGraphLoaded: true,
        main: { setAttribute() { }, removeAttribute() { } },
        requireGraph: async () => { events.push('graph'); await graph.promise; },
        loadModule: async path => { imports.push(path); await pending.promise; return { renderExplore: 'explore-renderer', renderViews: 'views-renderer' }; },
        render: renderer => { events.push(['render', renderer]); },
        loadFailure: error => events.push(['failure', error.message])
    });
    runInContext(routeSource, context);
    return { context, events, imports, pending, graph, screen, run: () => context.route() };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('explore and views are absent from static runtime imports', () => {
    for (const statement of file.statements) if (ts.isImportDeclaration(statement) && ['./explore.js', './views.js'].includes(statement.moduleSpecifier.text)) assert.equal(statement.importClause?.isTypeOnly, true);
});
for (const [hash, path, kind, renderer] of [['#/explore', './explore.js', 'explore', 'explore-renderer'], ['#/views/sample?layer=x', './views.js', 'views', 'views-renderer']]) {
    test(`selected ${kind} waits for graph and matching renderer`, async () => {
        const item = fixture(hash), request = item.run();
        assert.deepEqual(item.imports, []); item.graph.resolve(); await tick();
        assert.deepEqual(item.imports, [path]); assert.deepEqual(item.events, ['graph']);
        item.pending.resolve(); await request;
        const result = item.events[1]; assert.equal(result[0], 'render');
        assert.equal(result[1].kind, kind); assert.equal(result[1].render, renderer);
    });
}
test('other routes including explore prefixes do not import route modules', async () => {
    for (const hash of ['#/home', '#/overview', '#/list', '#/node/id', '#/explore-extra']) {
        const item = fixture(hash); item.graph.resolve(); await item.run();
        assert.deepEqual(item.imports, []); assert.equal(item.events[1][0], 'render');
    }
});
test('navigation during graph loading skips obsolete import and render', async () => {
    const item = fixture(), request = item.run(); item.context.location.hash = '#/home'; item.graph.resolve(); await request;
    assert.deepEqual(item.imports, []); assert.deepEqual(item.events, ['graph']);
});
for (const target of ['#/home', '#/node/id']) {
    test(`pending import cannot render after navigation to ${target}`, async () => {
        const item = fixture(), first = item.run(); item.graph.resolve(); await tick();
        item.context.location.hash = target; await item.run(); item.pending.resolve(); await first;
        assert.equal(item.events.filter(event => Array.isArray(event) && event[0] === 'render').length, 1);
    });
}
test('hash changes before hashchange dispatch also reject stale renderer', async () => {
    const item = fixture(), first = item.run(); item.graph.resolve(); await tick();
    item.context.location.hash = '#/views'; item.pending.resolve(); await first;
    assert.deepEqual(item.events, ['graph']);
});
test('failed import from active screen uses existing failure boundary and can retry control flow', async () => {
    const item = fixture(), first = item.run(); item.graph.resolve(); await tick();
    item.pending.reject(new Error('unavailable')); await first;
    assert.deepEqual(item.events, ['graph', ['failure', 'unavailable']]);
    assert.equal(item.context.disposeScreen, item.screen); assert.equal(item.context.renderVersion, 4);
    item.context.loadModule = async () => ({ renderExplore: 'recovered' }); await item.run();
    assert.equal(item.events.at(-1)[1].render, 'recovered');
});
test('stale import failure cannot clear a newer hash before dispatch', async () => {
    const item = fixture(), first = item.run(); item.graph.resolve(); await tick();
    item.context.location.hash = '#/home'; item.pending.reject(new Error('obsolete')); await first;
    assert.deepEqual(item.events, ['graph']);
});
