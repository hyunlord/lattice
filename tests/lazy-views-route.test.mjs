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
        loadModule: async path => { imports.push(path); await pending.promise; return { renderExplore: 'explore-renderer', renderViews: 'views-renderer', renderList: 'list-renderer', renderChanges: 'changes-renderer', renderHome: 'overview-renderer', renderNodeHistory: 'history-renderer', humanValue: 'human-value' }; },
        render: renderer => { events.push(['render', renderer]); },
        loadFailure: error => events.push(['failure', error.message])
    });
    runInContext(routeSource, context);
    return { context, events, imports, pending, graph, screen, run: () => context.route() };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('non-home route renderers are absent from static runtime imports', () => {
    for (const statement of file.statements) if (ts.isImportDeclaration(statement) && ['./explore.js', './views.js', './list.js', './changes.js', './home.js', './node-history.js', './views-records.js'].includes(statement.moduleSpecifier.text)) assert.equal(statement.importClause?.isTypeOnly, true);
});
for (const [hash, path, kind, renderer] of [['#/explore', './explore.js', 'explore', 'explore-renderer'], ['#/views/sample?layer=x', './views.js', 'views', 'views-renderer'], ['#/list?kind=function&q=main&sort=name', './list.js', 'list', 'list-renderer'], ['#/changes?base=old&head=new&layer=x', './changes.js', 'changes', 'changes-renderer'], ['#/changes/history', './changes.js', 'changes', 'changes-renderer']]) {
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
    for (const hash of ['#/home', '#/overview-extra', '#/list-extra', '#/explore-extra']) {
        const item = fixture(hash); item.graph.resolve(); await item.run();
        assert.deepEqual(item.imports, []); assert.equal(item.events[1][0], 'render');
    }
});
for (const [hash, name] of [['#/list', 'renderList'], ['#/changes', 'renderChanges']]) {
    test(`${hash} skips renderer when navigation supersedes graph loading`, async () => {
        const item = fixture(hash), pending = item.run(); item.context.location.hash = '#/home'; item.graph.resolve(); await pending;
        assert.deepEqual(item.imports, []); assert.deepEqual(item.events, ['graph']);
    });
    test(`${hash} pending renderer cannot replace or dispose newer home`, async () => {
        const item = fixture(hash), pending = item.run(); item.graph.resolve(); await tick();
        item.context.location.hash = '#/home'; await item.run(); item.pending.resolve(); await pending;
        assert.equal(item.events.filter(event => Array.isArray(event) && event[0] === 'render').length, 1);
        assert.equal(item.context.disposeScreen, item.screen); assert.equal(item.context.renderVersion, 4);
    });
    test(`${hash} active import failure preserves existing control-flow retry`, async () => {
        const item = fixture(hash), pending = item.run(); item.graph.resolve(); await tick(); item.pending.reject(new Error('unavailable')); await pending;
        assert.deepEqual(item.events, ['graph', ['failure', 'unavailable']]);
        item.context.loadModule = async () => ({ [name]: 'recovered' }); await item.run();
        assert.equal(item.events.at(-1)[1].render, 'recovered');
    });
    test(`${hash} stale import failure does not clear a newer hash before dispatch`, async () => {
        const item = fixture(hash), pending = item.run(); item.graph.resolve(); await tick();
        item.context.location.hash = '#/home'; item.pending.reject(new Error('obsolete')); await pending;
        assert.deepEqual(item.events, ['graph']);
    });
}
test('navigation during graph loading skips obsolete import and render', async () => {
    const item = fixture(), request = item.run(); item.context.location.hash = '#/home'; item.graph.resolve(); await request;
    assert.deepEqual(item.imports, []); assert.deepEqual(item.events, ['graph']);
});
for (const target of ['#/home', '#/node/id']) {
    test(`pending import cannot render after navigation to ${target}`, async () => {
        const item = fixture(), first = item.run(); item.graph.resolve(); await tick();
        item.context.location.hash = target; const next = item.run(); item.pending.resolve(); await next; await first;
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

test('active list import failure invalidates an unfinished changes screen before replacing it', async () => {
    const item = fixture('#/list'), snapshot = deferred(), children = [];
    item.context.main.replaceChildren = (...nodes) => { children.splice(0, children.length, ...nodes); };
    item.context.main.append = node => children.push(node);
    item.context.el = (tag, text) => ({ tag, text });
    item.context.element = () => ({ setAttribute() { }, remove() { item.events.push('old-loading-removed'); } });
    item.context.errorMessage = error => error.message;
    item.context.button = (text, callback) => ({ text, callback });
    item.context.selectors = () => { };
    for (const name of ['renderEvidence', 'renderTrends', 'manifest']) item.context[name] = container => container.append({ stale: name });
    const failure = file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'loadFailure');
    const changesFile = ts.createSourceFile('changes.ts', readFileSync(new URL('../viewer/changes.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const changes = changesFile.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'renderChanges');
    runInContext(ts.transpileModule(failure.getText(file) + '\n' + changes.getText(changesFile).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, item.context);
    const previous = item.context.renderVersion;
    const pendingChanges = item.context.renderChanges(item.context.main, { heading() { }, snapshots: [{ id: 'snapshot' }], params: new URLSearchParams(), readSnapshot: () => snapshot.promise, isCurrent: () => previous === item.context.renderVersion });
    const pendingRoute = item.run(); item.graph.resolve(); await tick(); item.pending.reject(new Error('unavailable')); await pendingRoute;
    const failureChildren = [...children];
    snapshot.resolve({}); await pendingChanges;
    assert.equal(item.context.renderVersion, previous + 1);
    assert.equal(item.context.disposeScreen, undefined);
    assert.equal(item.events.filter(event => event === 'dispose').length, 1);
    assert.deepEqual(children, failureChildren);
    assert.ok(!item.events.includes('old-loading-removed'));
    assert.equal(children[0].text, '지도를 불러오지 못했습니다');
});

for (const hash of ['#/overview', '#/node/selected']) {
    const overview = hash === '#/overview';
    const paths = overview ? ['./home.js'] : ['./node-history.js', './views-records.js'];
    test(`${hash} loads only selected helpers after graph and forwards exact functions`, async () => {
        const item = fixture(hash), pending = item.run();
        assert.deepEqual(item.imports, []); item.graph.resolve(); await tick();
        assert.deepEqual(item.imports, paths); assert.deepEqual(item.events, ['graph']);
        item.pending.resolve(); await pending;
        const selected = item.events.at(-1)[1]; assert.equal(selected.kind, overview ? 'overview' : 'node');
        if (overview) assert.equal(selected.render, 'overview-renderer');
        else { assert.equal(selected.renderNodeHistory, 'history-renderer'); assert.equal(selected.humanValue, 'human-value'); }
    });
    test(`${hash} does not import after superseded graph load`, async () => {
        const item = fixture(hash), pending = item.run(); item.context.location.hash = '#/home'; item.graph.resolve(); await pending;
        assert.deepEqual(item.imports, []); assert.deepEqual(item.events, ['graph']);
    });
    for (const fail of [false, true]) test(`${hash} stale helper ${fail ? 'rejection' : 'resolution'} cannot mutate the newer screen`, async () => {
        const item = fixture(hash), pending = item.run(); item.graph.resolve(); await tick();
        item.context.location.hash = '#/home'; if (fail) item.pending.reject(new Error('obsolete')); else item.pending.resolve(); await pending;
        assert.deepEqual(item.events, ['graph']); assert.equal(item.context.disposeScreen, item.screen); assert.equal(item.context.renderVersion, 4);
    });
    test(`${hash} newer same-hash request supersedes earlier helper resolution`, async () => {
        const item = fixture(hash), first = item.run(); item.graph.resolve(); await tick(); const second = item.run(); await tick();
        item.pending.resolve(); await Promise.all([first, second]);
        assert.equal(item.events.filter(event => Array.isArray(event) && event[0] === 'render').length, 1);
    });
    for (const rejectedPath of paths) test(`${hash} ${rejectedPath} failure reaches active retry boundary`, async () => {
        const item = fixture(hash); item.graph.resolve();
        item.context.loadModule = async path => { if (path === rejectedPath) throw new Error('unavailable'); return { renderNodeHistory: 'history', humanValue: 'value' }; };
        await item.run(); assert.deepEqual(item.events, ['graph', ['failure', 'unavailable']]);
        item.context.loadModule = async () => ({ renderHome: 'recovered', renderNodeHistory: 'history', humanValue: 'value' });
        await item.run(); assert.equal(item.events.at(-1)[0], 'render');
    });
}
function appFunctions(names, context) {
    const text = names.map(name => file.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name).getText(file)).join('\n');
    runInContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
}
test('actual overview passes existing context and invalidates its current callback', () => {
    let received; const main = {}, graph = {}, nodes = [], snapshots = [];
    const context = createContext({ main, graph, visibleNodes: nodes, snapshots, renderVersion: 4, kinds: [], presentation: {}, activeLayer: 'code', layerFindings: () => [], readSnapshot() { }, pageHeading() { }, kindLabel() { }, facetLabel() { }, valueLabel() { }, sources() { }, findingView() { }, nodeHref() { }, listHref() { }, routeHref: (path, params) => [path, params] });
    appFunctions(['overview'], context);
    context.overview(4, (host, options) => { assert.equal(host, main); received = options; });
    assert.equal(received.graph, graph); assert.equal(received.nodes, nodes); assert.equal(received.snapshots, snapshots); assert.equal(received.readSnapshot, context.readSnapshot);
    assert.equal(received.isCurrent(), true); context.renderVersion++; assert.equal(received.isCurrent(), false);
    assert.equal(received.changesHref('old', 'new')[0], '/changes');
});
test('actual legacy detail forwards human values and history context without changing lifetime', () => {
    const element = () => ({ append() { }, replaceChildren() { }, setAttribute() { }, focus() { } });
    const node = { id: 'selected', name: 'Selected', kind: 'file', attributes: { title: 'Human title' }, sources: [] };
    const graph = { nodes: [node], edges: [], findings: [] }, snapshots = [], calls = [];
    const context = createContext({
        main: element(), nodes: new Map([[node.id, node]]), graph, snapshots, facets: new Map(), renderVersion: 9,
        presentation: { detail: { summaryFields: [{ path: ['title'], label: 'Title' }], relationships: [] } },
        el: element, link: element, button: element, section: element, empty: element, sources: element, pageHeading() { }, listHref() { }, kindLabel: value => value, layerOf: () => '', layerLabel() { }, nodeHref: id => '#/node/' + id, routeHref: (path, params) => [path, params], readSnapshot() { }, display: String
    });
    appFunctions(['detail'], context);
    context.detail('selected', 9, { humanValue: (value, options) => { calls.push(['human', value, options]); return element(); }, renderNodeHistory: (host, options) => { calls.push(['history', host, options]); } });
    assert.equal(calls[0][1], 'Human title'); assert.equal(calls[0][2].nodes, graph.nodes); assert.equal(calls[0][2].nodeHref, context.nodeHref);
    const history = calls[1][2]; assert.equal(calls[1][1], context.main); assert.equal(history.node, node); assert.equal(history.snapshots, snapshots); assert.equal(history.readSnapshot, context.readSnapshot); assert.equal(history.sources, context.sources);
    assert.equal(history.isCurrent(), true); context.renderVersion++; assert.equal(history.isCurrent(), false);
    assert.equal(history.changesHref('old', 'new', 'identity')[1].node, 'identity');
});

test('actual render dispatch forwards helpers and distinguishes missing helpers from malformed node IDs', () => {
    const calls = [], main = { replaceChildren() { }, append() { }, querySelector: () => null };
    const context = createContext({
        URLSearchParams, location: { hash: '#/overview' }, renderVersion: 0, disposeScreen: undefined, main,
        firstOverview: undefined, allVisibleNodes: [], nodes: new Map(), presentation: { defaultLayer: '' }, layerOf: () => '', activeLayer: '', visibleNodes: [],
        document: { querySelectorAll: () => [], body: { classList: { toggle() { } } } }, window: { scrollTo() { } },
        overview: (...args) => calls.push(['overview', ...args]), detail: (...args) => calls.push(['detail', ...args]), pageHeading: title => calls.push(['heading', title]), link() { }, listHref() { }
    });
    appFunctions(['render'], context);
    const renderer = () => { }; context.render({ kind: 'overview', render: renderer });
    assert.equal(calls[0][0], 'overview'); assert.equal(calls[0][2], renderer);
    const helpers = { kind: 'node', humanValue() { }, renderNodeHistory() { } };
    context.location.hash = '#/node/encoded%2Fid'; context.render(helpers);
    assert.equal(calls[1][0], 'detail'); assert.equal(calls[1][1], 'encoded/id'); assert.equal(calls[1][3], helpers);
    context.location.hash = '#/node/%'; context.render(helpers);
    assert.deepEqual(calls.at(-1), ['heading', '잘못된 노드 주소']);
    const count = calls.length; assert.throws(() => context.render(), /Node helpers are not loaded/u); assert.equal(calls.length, count);
    context.location.hash = '#/overview'; assert.throws(() => context.render(), /Overview renderer is not loaded/u);
});
