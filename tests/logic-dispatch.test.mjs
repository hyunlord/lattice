import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseLogicFacts } from '../bin/logic-parser.mjs';
import { analyzeLogic } from '../dist/adapters/logic-analysis.js';
import { extractCode } from '../dist/adapters/code.js';
import { logicCalls } from '../dist/query/logic-model.js';

for (const [language, path, text] of [
    ['java', 'App.java', 'class Base { void run(){ hook(); direct(); } void hook(){} static void direct(){} } class Child extends Base { @Override void hook(){} }'],
    ['csharp', 'App.cs', 'class Base { void Run(){ Hook(); Direct(); void Local(){} Local(); } public virtual void Hook(){} static void Direct(){} } class Child : Base { public override void Hook(){} }'],
    ['kotlin', 'App.kt', 'open class Base {\n fun run(){\n hook()\n fun local(){}\n local()\n }\n open fun hook(){}\n}\nclass Child : Base() {\n override fun hook(){}\n}'],
]) test(`${language} instance dispatch is an estimated declaration candidate, not an exact execution target`, () => {
    const source = { path, text, contentHash: createHash('sha256').update(text).digest('hex') };
    const fact = parseLogicFacts(source, language);
    assert.deepEqual(fact.diagnostics, []);
    const result = analyzeLogic([fact], [extractCode(source)]);
    const byId = new Map(result.nodes.map(node => [node.id, node]));
    const calls = result.edges.filter(edge => edge.kind === 'calls');
    const virtual = calls.find(edge => byId.get(edge.target).name.toLowerCase() === 'hook');
    assert.equal(virtual.attributes.resolution, 'estimated');
    assert.equal(byId.get(virtual.target).attributes.owner, 'Base');
    for (const edge of calls.filter(edge => edge !== virtual)) assert.equal(edge.attributes.resolution, 'exact');
    assert.ok(calls.length >= 2);
    const graph = { nodes: result.nodes, edges: result.edges };
    assert.equal(logicCalls(graph, { id: virtual.source, direction: 'out' }).outgoing.items.some(edge => edge.id === virtual.id), false);
    assert.equal(logicCalls(graph, { id: virtual.source, direction: 'out', includeEstimated: true }).outgoing.items.some(edge => edge.id === virtual.id), true);
});

test('Java local class methods do not become exact merely because their class is inside a function', () => {
    const text = 'class Factory { static void build() { class Base { void run(){hook();} void hook(){} } class Child extends Base { @Override void hook(){} } } }';
    const source = { path: 'Factory.java', text, contentHash: createHash('sha256').update(text).digest('hex') };
    const fact = parseLogicFacts(source, 'java');
    assert.deepEqual(fact.diagnostics, []);
    const result = analyzeLogic([fact], [extractCode(source)]);
    const calls = result.edges.filter(edge => edge.kind === 'calls');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].attributes.resolution, 'estimated');
    assert.equal(result.nodes.find(node => node.id === calls[0].target).attributes.owner, 'Base');
});
