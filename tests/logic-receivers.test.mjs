import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { parseLogicFacts, prepareLogicParser } from '../bin/logic-parser.mjs';
import { analyzeLogic } from '../dist/adapters/logic-analysis.js';
import { extractCode } from '../dist/adapters/code.js';

async function calls(entries) {
    const inputs = entries.map(([path, text]) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') }));
    const modules = inputs.map(extractCode);
    await prepareLogicParser(modules.map(item => item.language));
    const facts = inputs.map((input, index) => parseLogicFacts(input, modules[index].language));
    for (const fact of facts) assert.deepEqual(fact.diagnostics, []);
    const result = analyzeLogic(facts, modules);
    const byId = new Map(result.nodes.map(node => [node.id, node]));
    return result.edges.filter(edge => edge.kind === 'calls').map(edge => ({ caller: byId.get(edge.source).name, target: byId.get(edge.target).name, resolution: edge.attributes.resolution, path: byId.get(edge.target).sources[0].path }));
}

for (const [path, text, expected] of [
    ['App.java', 'class App { void run(){ helper(); } private void helper(){} }', 'helper'],
    ['App.kt', 'class App {\n fun run(){ helper() }\n private fun helper(){}\n}', 'helper'],
    ['App.cs', 'class App { void Run(){ Helper(); } private void Helper(){} }', 'Helper'],
]) test(`private methods resolve exactly in ${path}`, async () => {
    const result = await calls([[path, text]]);
    assert.deepEqual(result.map(call => [call.target, call.resolution]), [[expected, 'exact']]);
});

test('same-owner overload resolves only the unique compatible positional arity', async () => {
    const result = await calls([['App.cs', 'class App { void Run(){ Send(1,2,3); Ambiguous(1); } void Send(int a){} void Send(int a,int b,int c){} void Ambiguous(int a){} void Ambiguous(string a){} }']]);
    assert.deepEqual(result.map(call => [call.target, call.resolution]), [['Send', 'exact']]);
});

test('cross-package Java declared receiver preserves virtual uncertainty and constructor identity', async () => {
    const result = await calls([['app/App.java', 'package app; import lib.Engine; class App { void run(Engine parameter){ Engine local = new Engine(); local.safe(); local.hook(); parameter.hook(); } }'], ['lib/Engine.java', 'package lib; public class Engine { public final void safe(){} public void hook(){} }']]);
    assert.deepEqual(result.map(call => [call.target, call.resolution, call.path]), [['safe', 'exact', 'lib/Engine.java'], ['hook', 'exact', 'lib/Engine.java'], ['hook', 'estimated', 'lib/Engine.java']]);
});

test('C# typed local and self calls are exact while virtual parameter dispatch stays estimated', async () => {
    const result = await calls([['App.cs', 'class Engine { public void Safe(){} public virtual void Hook(){} void Run(Engine input){ var local = new Engine(); local.Safe(); input.Hook(); this.Safe(); } }']]);
    assert.deepEqual(result.map(call => [call.target, call.resolution]), [['Safe', 'exact'], ['Hook', 'estimated'], ['Safe', 'exact']]);
});

test('reassigned and shadowed receiver bindings do not produce constructor certainty', async () => {
    const result = await calls([['app.ts', 'class Engine { run(){} } function launch(other: Engine){ const item = new Engine(); item.run(); } function unsafe(other: Engine){ let item = new Engine(); item = other; item.run(); } function shadow(){ const item = new Engine(); { const item = unknownFactory(); item.run(); } }']]);
    assert.deepEqual(result.map(call => [call.caller, call.target, call.resolution]), [['launch', 'run', 'exact']]);
});

test('virtual self and interface receiver calls never become exact concrete targets', async () => {
    const result = await calls([['App.cs', 'interface IEngine { void Run(); } class App { public virtual void Hook(){} void Run(IEngine engine){ engine.Run(); this.Hook(); } }']]);
    assert.ok(result.every(call => call.resolution === 'estimated'));
    assert.equal(result.length, 2);
});

test('explicit JavaScript constructors that may replace the instance remain unresolved', async () => {
    const result = await calls([['app.ts', 'class Engine { constructor(){ return unknownFactory(); } run(){} } function launch(){ const item = new Engine(); item.run(); }']]);
    assert.deepEqual(result, []);
});

test('anonymous Java construction does not prove the named base implementation', async () => {
    const result = await calls([['App.java', 'class Engine { void hook(){} } class App { void run(){ Engine item = new Engine(){ void hook(){} }; item.hook(); } }']]);
    assert.ok(result.every(call => call.resolution !== 'exact'));
});

test('typed receiver metadata and arity survive the validated cache boundary', async () => {
    const { decodeLogicFacts } = await import('../bin/logic-facts-decode.mjs');
    const text = 'class Engine { void Safe(int value){} void Run(){ var item = new Engine(); item.Safe(1); } }';
    const source = { path: 'App.cs', text, contentHash: createHash('sha256').update(text).digest('hex') };
    await prepareLogicParser(['csharp']);
    const facts = parseLogicFacts(source, 'csharp');
    assert.deepEqual(decodeLogicFacts(JSON.parse(JSON.stringify(facts))), facts);
    assert.throws(() => decodeLogicFacts({ ...facts, definitions: [{ ...facts.definitions[0], receivers: [{ name: 'x' }] }] }), /cached logic/);
});

test('a typed C# receiver resolves through its imported namespace without guessing unrelated types', async () => {
    const result = await calls([['app/App.cs', 'using Widgets; namespace Product { class App { void Run(Engine input){ input.Safe(); } } }'], ['widgets/Engine.cs', 'namespace Widgets { public class Engine { public void Safe(){} } }'], ['other/Engine.cs', 'namespace Other { public class Engine { public void Safe(){} } }']]);
    assert.deepEqual(result.map(call => [call.target, call.resolution, call.path]), [['Safe', 'exact', 'widgets/Engine.cs']]);
});

test('nested dynamic this does not inherit a JavaScript class receiver', async () => {
    const result = await calls([['app.ts', 'class Engine { private safe(){} run(){ function callback(){ this.safe(); } } }']]);
    assert.deepEqual(result, []);
});

test('Kotlin interface default methods remain estimated', async () => {
    const result = await calls([['App.kt', 'interface Runner {\n fun run() {}\n}\nclass App {\n fun launch(input: Runner){input.run()}\n}']]);
    assert.deepEqual(result.map(call => call.resolution), ['estimated']);
});

test('declared base types do not prove signature overrides in newly constructed subtypes', async () => {
    const result = await calls([['App.java', 'class Base { void hook(){} } class Derived extends Base { @Override void hook(){} } class App { void run(Base input){ Base local = new Derived(); input.hook(); local.hook(); } }']]);
    assert.deepEqual(result.map(call => [call.target, call.resolution]), [['hook', 'estimated'], ['hook', 'estimated']]);
});

test('ref writes and catch shadowing cannot retain constructor certainty', async () => {
    const csharp = await calls([['App.cs', 'class Engine { public virtual void Hook(){} void Run(){ var item = new Engine(); Replace(ref item); item.Hook(); } }']]);
    const script = await calls([['app.ts', 'class Engine { run(){} } function launch(){ const item = new Engine(); try {} catch(item) { item.run(); } }']]);
    assert.deepEqual([...csharp, ...script], []);
});

test('qualified Rust receiver types follow public extern crate aliases and type reexports', async () => {
    const entries = [['app/src/main.rs', 'fn launch(engine: &facade::motors::Engine){ engine.run(); }'], ['facade/src/lib.rs', 'pub extern crate machinery as motors;'], ['machinery/src/lib.rs', 'mod worker; pub use crate::worker::Engine;'], ['machinery/src/worker.rs', 'pub struct Engine; impl Engine { pub fn run(&self){} }']];
    const sources = entries.map(([path, text]) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') }));
    await prepareLogicParser(['rust']);
    const facts = sources.map(source => parseLogicFacts(source, 'rust')), modules = sources.map(extractCode);
    const packages = ['app', 'facade', 'machinery'].map(name => ({ id: 'package:' + name, kind: 'package', name, attributes: { root: name, packageName: name, importNames: [name], entryTargets: [name + '/src/' + (name === 'app' ? 'main' : 'lib') + '.rs'], memberIds: modules.filter(module => module.node.sources[0].path.startsWith(name + '/')).map(module => module.node.id) }, sources: [] }));
    const graph = analyzeLogic(facts, modules, packages), nodes = new Map(graph.nodes.map(node => [node.id, node]));
    const edges = graph.edges.filter(edge => edge.kind === 'calls');
    assert.deepEqual(edges.map(edge => [nodes.get(edge.source).name, nodes.get(edge.target).name, edge.attributes.resolution]), [['launch', 'run', 'exact']]);
});

test('static Python export lists survive cache decoding and dynamic export mutations stay conservative', async () => {
    const { decodeLogicFacts } = await import('../bin/logic-facts-decode.mjs');
    await prepareLogicParser(['python']);
    for (const [text, expected] of [["__all__ = ['launch']\ndef launch(): pass\ndef helper(): pass\n", ['launch']], ["__all__ = ('launch',)\n", ['launch']], ["__all__ = discover()\n", []], ["__all__ = ['launch']\n__all__.append('helper')\n", []]]) {
        const facts = parseLogicFacts({ path: 'app.py', text, contentHash: 'export-fixture' }, 'python');
        assert.deepEqual(facts.namespaceExports, expected);
        assert.deepEqual(decodeLogicFacts(JSON.parse(JSON.stringify(facts))).namespaceExports, expected);
    }
});

test('C# hidden nonvirtual methods bind to the declared local type', async () => {
    const { logicResolver } = await import('../dist/adapters/logic-resolve.js');
    const text = 'class Base { public void Hook(){} } class Derived : Base { public new void Hook(){} } class App { void Run(){ Base item = new Derived(); item.Hook(); } }';
    const source = { path: 'App.cs', text, contentHash: createHash('sha256').update(text).digest('hex') };
    await prepareLogicParser(['csharp']);
    const fact = parseLogicFacts(source, 'csharp'), call = fact.calls.find(item => item.receiver === 'item');
    const target = logicResolver([fact], [extractCode(source)], [])(fact, call);
    assert.equal(target?.definition.owner, 'Base');
    assert.notEqual(target?.resolution, 'estimated');
});

for (const [path, text, name] of [
    ['app.ts', 'class Engine { run(){} } class Other { run(){} } function launch(){ let item = new Engine(); function replace(){ item = new Other(); } replace(); item.run(); }', 'run'],
    ['App.cs', 'class Engine { public virtual void Hook(){} } class Other : Engine { public override void Hook(){} } class App { void Run(){ Engine item = new Engine(); void Replace(){ item = new Other(); } Replace(); item.Hook(); } }', 'Hook'],
]) test(`nested callable reassignment cannot retain receiver certainty in ${path}`, async () => {
    const result = await calls([[path, text]]);
    assert.ok(result.filter(call => call.target === name).every(call => call.resolution !== 'exact'));
});

test('prototype writes cannot retain original constructor-method certainty', async () => {
    const result = await calls([['app.ts', 'class Engine { run(){} } function other(){} function launch(){ const item = new Engine(); Engine.prototype.run = other; item.run(); }']]);
    assert.ok(result.filter(call => call.target === 'run').every(call => call.resolution !== 'exact'));
});

test('inherited JavaScript constructors cannot prove the resulting instance type', async () => {
    const result = await calls([['app.ts', 'class Other { run(){} } class Base { constructor(){ return new Other(); } } class Engine extends Base { run(){} } function launch(){ const item = new Engine(); item.run(); }']]);
    assert.ok(result.filter(call => call.target === 'run').every(call => call.resolution !== 'exact'));
});

test('Java overload selection preserves the declared receiver type', async () => {
    const { logicResolver } = await import('../dist/adapters/logic-resolve.js');
    const text = 'class Base { void hook(Object value){} } class Derived extends Base { void hook(String value){} } class App { void run(){ Base item = new Derived(); item.hook("x"); } }';
    const source = { path: 'App.java', text, contentHash: createHash('sha256').update(text).digest('hex') };
    await prepareLogicParser(['java']);
    const fact = parseLogicFacts(source, 'java'), call = fact.calls.find(item => item.receiver === 'item');
    const target = logicResolver([fact], [extractCode(source)], [])(fact, call);
    assert.equal(target?.definition.owner, 'Base');
    assert.equal(target?.resolution, 'estimated');
});

test('Kotlin overload selection preserves the declared receiver type', async () => {
    const { logicResolver } = await import('../dist/adapters/logic-resolve.js');
    const text = 'open class Base {\n open fun hook(value: Any) {}\n}\nclass Derived : Base() {\n fun hook(value: String) {}\n}\nclass App {\n fun run(){\n val item: Base = Derived()\n item.hook("x")\n }\n}\n';
    const source = { path: 'App.kt', text, contentHash: createHash('sha256').update(text).digest('hex') };
    await prepareLogicParser(['kotlin']);
    const fact = parseLogicFacts(source, 'kotlin'), call = fact.calls.find(item => item.receiver === 'item');
    assert.deepEqual(fact.diagnostics, []);
    const target = logicResolver([fact], [extractCode(source)], [])(fact, call);
    assert.equal(target?.definition.owner, 'Base');
    assert.equal(target?.resolution, 'estimated');
});
