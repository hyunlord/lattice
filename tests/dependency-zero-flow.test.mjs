import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../viewer/dependency-package-arrows.ts', import.meta.url), 'utf8');
const file = ts.createSourceFile('arrows.ts', source, ts.ScriptTarget.Latest, true);
const helper = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'drawPackageDependencyArrows');
assert.ok(helper);

function fixture() {
    const calls = { measurements: 0, route: 0, uuid: 0, svg: 0 };
    function node(tag) {
        return {
            tag, children: [], dataset: {}, attributes: {}, classList: { add() { } },
            setAttribute(key, value) { this.attributes[key] = value; },
            removeAttribute(key) { delete this.attributes[key]; },
            append(...children) { for (const child of children) child.parent = this; this.children.push(...children); },
            replaceChildren(...children) { this.children = []; this.append(...children); },
            remove() { this.parent.children = this.parent.children.filter(child => child !== this); },
            getBBox() { calls.measurements++; return { width: 16 }; }
        };
    }
    const graph = node('svg');
    graph.setAttribute('aria-hidden', 'true');
    const rect = () => { calls.measurements++; return { left: 0, top: 0, width: 300, height: 200 }; };
    const context = createContext({
        svg: tag => { calls.svg++; return node(tag); },
        crypto: { randomUUID: () => { calls.uuid++; return 'fixture'; } },
        countText: () => '1', dependencyCountLabel: () => '1', mobileDependencyRouteOrder: flows => flows,
        routePackageDependencies: (flows, _boxes, _width, _height, measure) => {
            calls.route++;
            return flows.map(flow => { measure(flow); return { flow, points: [{ x: 0, y: 0 }, { x: 8, y: 8 }], label: { x: 4, y: 4 } }; });
        }
    });
    runInContext(ts.transpileModule(helper.getText(file).replace(/^export /, '') + '\nglobalThis.draw = drawPackageDependencyArrows;', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    return { graph, calls, draw: flows => context.draw({ host: { getBoundingClientRect: rect, querySelectorAll: () => [] }, graph, flows, boxes: new Map([['a', { getBoundingClientRect: rect }]]), names: new Map() }) };
}

test('initial zero-flow SVG zeroes dimensions and retains accessibility without measuring or routing', () => {
    const item = fixture();
    assert.equal(item.draw([]).length, 0);
    assert.deepEqual(item.calls, { measurements: 0, route: 0, uuid: 0, svg: 0 });
    assert.deepEqual(item.graph.attributes, { 'aria-hidden': 'true', width: '0', height: '0' });
    assert.equal(item.graph.children.length, 0);
    assert.deepEqual(item.graph.dataset, { unrouted: '0', unplacedLabels: '0', unroutedPairs: '[]' });
});

test('one→zero→one clears stale drawing and diagnostics, zeroes empty dimensions, and restores them when drawing again', () => {
    const item = fixture(), flow = { source: 'a', target: 'b', count: 1, weight: 1 };
    assert.equal(item.draw([flow])[0], flow);
    const attributes = { ...item.graph.attributes }, calls = { ...item.calls };
    item.graph.dataset.unrouted = '1'; item.graph.dataset.unplacedLabels = '2'; item.graph.dataset.unroutedPairs = '[["a","b"]]';
    item.draw([]);
    assert.deepEqual(item.calls, calls);
    assert.deepEqual(item.graph.attributes, { 'aria-hidden': 'true', width: '0', height: '0' });
    assert.equal(item.graph.children.length, 0);
    assert.deepEqual(item.graph.dataset, { unrouted: '0', unplacedLabels: '0', unroutedPairs: '[]' });
    assert.equal(item.draw([flow])[0], flow);
    assert.equal(item.calls.route, calls.route + 1);
    assert.deepEqual(item.graph.attributes, attributes);
    assert.ok(item.graph.children.some(child => child.tag === 'path'));
});
