import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../viewer/dependency-overview.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('overview.ts', source, ts.ScriptTarget.Latest, true);
function fixture({ width = 390, selected = undefined, flat = false } = {}) {
    let declaration;
    const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'renderMode') declaration = node; ts.forEachChild(node, visit); }; visit(file);
    assert.ok(declaration, 'mode content can be populated before routing and corrected afterward');
    const events = [], mode = { children: [], replaceChildren() { this.children = []; }, append(node) { this.children.push(node); } };
    const flows = Array.from({ length: 12 }, (_, index) => ({ source: String(index), target: 'sink', count: 1 }));
    const context = createContext({
        mode, flows, selected, flat, flatStage: flat ? { nodeCount: 64, filePreviews: [1, 2, 3] } : undefined, packageOverview: true, expandedMap: false, view: { stages: [1, 2, 3], flows: [...flows, {}, {}] }, window: { innerWidth: width }, packageDependencyLimit: 12, autoOpenedConnections: true,
        connections: { open: false, scrollIntoView: value => events.push(value.block) }, render: () => events.push('render'), saveRoute: () => events.push('save'), displayedDependencyFlows: () => Array(14),
        element: (tag, text) => ({ tag, text, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } })
    });
    runInContext(ts.transpileModule('const ' + declaration.getText(file) + '; globalThis.updateMode = renderMode;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { context, mode, events, flows, update: shown => context.updateMode(shown) };
}
test('mode builds all compact controls before routing and keeps their callbacks', () => {
    const item = fixture({ selected: 'current' }); item.update(item.flows);
    assert.deepEqual(item.mode.children.map(node => node.text), ['의존 방향 12/14개 · 파일 수 순', '전체 3개 펼치기', '전체 구조', '나머지 2개 연결']);
    item.mode.children[1].onclick(); assert.equal(item.context.expandedMap, true);
    item.mode.children[2].onclick(); assert.equal(item.context.selected, undefined);
    item.mode.children[3].onclick(); assert.equal(item.context.connections.open, true); assert.equal(item.context.autoOpenedConnections, false);
    assert.deepEqual(item.events, ['render', 'render', 'save', 'start']);
});
test('actual missing routes correct counts and keep remaining-connections semantics', () => {
    const item = fixture(); item.update(item.flows); item.update(item.flows.slice(0, 4));
    assert.equal(item.mode.children[0].text, '의존 방향 4/14개 · 파일 수 순 · 경로 미표시 8개');
    assert.equal(item.mode.children.at(-1).text, '나머지 10개 연결');
});
test('desktop and flat modes preserve their distinct controls and status', () => {
    const desktop = fixture({ width: 1440 }); desktop.update(desktop.flows);
    assert.deepEqual(desktop.mode.children.map(node => node.text), ['의존 방향 12/14개 · 파일 수 순', '나머지 2개 연결']);
    const flat = fixture({ flat: true }); flat.update([]);
    assert.equal(flat.mode.children[0].text, '한 폴더의 파일 구성 · 파일 64개 중 3개 미리보기');
    assert.ok(!flat.mode.children.some(node => node.text.includes('펼치기')));
});
