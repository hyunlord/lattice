import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createContext, runInContext } from 'node:vm';
function loadFunction(path, name, context = {}) {
    const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    const declaration = source.statements.find(node => (ts.isFunctionDeclaration(node) && node.name?.text === name) || (ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(source) === name)));
    assert.ok(declaration, `${name} exposes the actual interaction behavior`);
    const code = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText.replace('export ', '');
    return new Function(...Object.keys(context), `${code}; return ${name};`)(...Object.values(context));
}
const fixture = () => {
    const cards = ['a', 'b', 'c', 'd'].map(stage => ({ dataset: { stage }, matches: () => true, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }));
    const edges = [{ source: 'a', target: 'b' }, { source: 'c', target: 'a' }, { source: 'b', target: 'd' }].map(dataset => ({ dataset: { ...dataset }, style: { setProperty() { }, removeProperty() { } } }));
    const host = { dataset: {}, querySelectorAll(selector) { return selector.includes('lm-station') ? cards : edges; } };
    const flows = edges.map(item => item.dataset);
    return { cards, edges, host, flows };
};
test('bare overview has no selection, while an explicit stage restores one selected card', () => {
    const apply = loadFunction('../viewer/dependency-overview.ts', 'updateDependencyHighlight'); const item = fixture();
    apply(item.host, item.flows, undefined, undefined);
    assert.ok(item.cards.every(card => card.dataset.emphasis === 'normal' && card.attributes['aria-pressed'] === 'false'));
    apply(item.host, item.flows, 'a', undefined);
    assert.deepEqual(item.cards.map(card => card.dataset.emphasis), ['selected', 'outgoing', 'incoming', 'unrelated']);
    assert.deepEqual(item.edges.map(edge => edge.dataset.emphasis), ['outgoing', 'incoming', 'unrelated']);
    assert.equal(item.cards.filter(card => card.attributes['aria-pressed'] === 'true').length, 1);
});
test('hover previews directions without changing committed selection and leaving restores it', () => {
    const apply = loadFunction('../viewer/dependency-overview.ts', 'updateDependencyHighlight'); const item = fixture();
    apply(item.host, item.flows, 'a', 'b');
    assert.equal(item.cards[0].attributes['aria-pressed'], 'true');
    assert.equal(item.cards[1].attributes['aria-pressed'], 'false');
    assert.equal(item.cards[1].dataset.emphasis, 'preview');
    assert.equal(item.edges[0].dataset.emphasis, 'incoming');
    apply(item.host, item.flows, 'a', undefined);
    assert.equal(item.edges[0].dataset.emphasis, 'outgoing');
    apply(item.host, item.flows, undefined, undefined);
    assert.ok(item.edges.every(edge => edge.dataset.emphasis === 'normal'));
    assert.equal(item.edges.length, 3, 'emphasis preserves every existing arrow');
});
test('bidirectional neighbors stay connected and off-screen relations do not erase displayed context', () => {
    const apply = loadFunction('../viewer/dependency-overview.ts', 'updateDependencyHighlight'); const item = fixture();
    item.flows.push({ source: 'b', target: 'a' }, { source: 'a', target: 'd' });
    apply(item.host, item.flows, 'a', undefined);
    assert.equal(item.cards[1].dataset.emphasis, 'both');
    assert.equal(item.cards[3].dataset.emphasis, 'outgoing');
    assert.equal(item.edges[2].dataset.emphasis, 'unrelated');
});
test('short arrow counts avoid ambiguous arithmetic while full typed counts stay in SVG titles', () => {
    const count = loadFunction('../viewer/dependency-package-arrows.ts', 'countText');
    assert.equal(count({ count: 4 }), '4');
    assert.equal(count({ count: 2, projectCount: 2 }), '2');
    assert.equal(count({ count: 7, projectCount: 2 }), '7');
    assert.equal(count({ count: 0 }), '0');
});

test('actual selection callback toggles the same card and blank click clears panel and route without redraw', () => {
    const source = ts.createSourceFile('overview.ts', readFileSync(new URL('../viewer/dependency-overview.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let declaration; const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'selectStage') declaration = node; ts.forEachChild(node, visit); }; visit(source);
    assert.ok(declaration);
    const events = [], stage = { id: 'a' }, panel = { hidden: false, replaceChildren() { events.push('clear-panel'); } };
    const context = createContext({ selected: undefined, preview: 'a', byId: new Map([['a', stage]]), panel, roles: { querySelectorAll: () => [] }, renderPanel: value => { assert.equal(value, stage); panel.hidden = false; events.push('panel'); }, highlight: () => events.push('highlight'), saveRoute: () => events.push('route'), redraw() { throw new Error('selection must not reroute arrows'); }, render() { throw new Error('selection must not rebuild the map'); } });
    runInContext(ts.transpileModule('const ' + declaration.getText(source) + ';globalThis.select = selectStage;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.select('a'); assert.equal(context.selected, 'a'); assert.equal(context.preview, undefined);
    context.select('a'); assert.equal(context.selected, undefined); assert.equal(panel.hidden, true);
    context.select('a'); context.select(undefined); assert.equal(context.selected, undefined); assert.equal(panel.hidden, true);
    assert.equal(events.filter(event => event === 'route').length, 4);
});

test('file-preview article updates its real selector button and clears it without invalid article ARIA', () => {
    const apply = loadFunction('../viewer/dependency-overview.ts', 'updateDependencyHighlight'); const item = fixture();
    const button = { attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } };
    const article = item.cards[0]; article.matches = () => false; article.querySelector = () => button;
    apply(item.host, item.flows, 'a', undefined);
    assert.equal(button.attributes['aria-pressed'], 'true'); assert.equal(article.attributes['aria-pressed'], undefined);
    apply(item.host, item.flows, undefined, undefined);
    assert.equal(button.attributes['aria-pressed'], 'false');
    apply(item.host, item.flows, 'b', undefined);
    assert.equal(button.attributes['aria-pressed'], 'false'); assert.equal(item.cards[1].attributes['aria-pressed'], 'true');
});
test('leaving a card for the diagram gap restores committed highlight without waiting to leave diagram', () => {
    const source = ts.createSourceFile('overview.ts', readFileSync(new URL('../viewer/dependency-overview.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let handler; const visit = node => { if (ts.isCallExpression(node) && node.expression.getText(source) === 'box.addEventListener' && node.arguments[0]?.text === 'pointerleave') handler = node.arguments[1]; ts.forEachChild(node, visit); }; visit(source);
    assert.ok(handler, 'actual card pointerleave listener exists');
    let highlights = 0; const context = createContext({ preview: 'a', stage: { id: 'a' }, highlight: () => highlights++ });
    runInContext(ts.transpileModule('globalThis.leave = ' + handler.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    context.leave(); assert.equal(context.preview, undefined); assert.equal(highlights, 1);
    context.preview = 'b'; context.leave(); assert.equal(context.preview, 'b'); assert.equal(highlights, 1);
});
