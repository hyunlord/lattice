import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { prepareLogicParser, parseLogicFacts } from '../bin/logic-parser.mjs';
import { analyzeLogic } from '../dist/adapters/logic-analysis.js';
import { extractCode } from '../dist/adapters/code.js';

const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
async function analyze(entries, metadata = []) {
    const inputs = entries.map(([path, text]) => input(path, text));
    const modules = inputs.map(extractCode);
    await prepareLogicParser(modules.map(module => module.language));
    return analyzeLogic(inputs.map((source, index) => parseLogicFacts(source, modules[index].language)), modules, [], metadata.map(([path, text]) => input(path, text)));
}
const callNames = result => result.edges.filter(edge => edge.kind === 'calls').map(edge => {
    const names = new Map(result.nodes.map(node => [node.id, node.name]));
    return [names.get(edge.source), names.get(edge.target)];
});

test('AST resolves lexical calls and rejects parameter shadowing, unknown receivers and string/comment decoys', async () => {
    const result = await analyze([['app.ts', 'function helper() {}\nfunction main(){ helper(); obj.helper(); const text="helper()"; }\nfunction shadow(helper:()=>void){ helper(); }']]);
    assert.deepEqual(callNames(result), [['main', 'helper']]);
    const edge = result.edges.find(edge => edge.kind === 'calls');
    assert.equal(edge.sources[0].line, 2);
    assert.equal(edge.attributes.resolution, 'exact');
    assert.ok(result.diagnostics.some(item => item.code === 'unresolved-call'));
});

test('AST imports preserve aliases and resolve only exported local functions', async () => {
    const result = await analyze([['main.ts', "import { work as run } from './worker.js';\nfunction main(){run();}"], ['worker.ts', 'export function work(){}\nfunction privateWork(){}']]);
    assert.deepEqual(callNames(result), [['main', 'work']]);
});

test('AST tracks nested lexical scope and static methods without global same-name matching', async () => {
    const result = await analyze([['a.ts', 'function helper(){} function main(){ function helper(){} helper(); } class Engine { static run(){} } function launch(){ Engine.run(); }'], ['b.ts', 'function helper(){}']]);
    assert.deepEqual(callNames(result), [['main', 'helper'], ['launch', 'run']]);
    const edge = result.edges.find(edge => edge.kind === 'calls' && result.nodes.find(node => node.id === edge.source)?.name === 'main');
    assert.ok(result.nodes.find(node => node.id === edge.target).attributes.lexicalParent);
});

for (const [path, code] of [
    ['app.py', 'def helper():\n    return 1\ndef main():\n    return helper()\n'],
    ['main.go', 'package main\nfunc helper() {}\nfunc main(){ helper() }'],
    ['main.rs', 'fn helper() {}\nfn main(){helper();}'],
    ['App.java', 'class App { static void helper() {} public static void main(String[] args){helper();} }'],
    ['App.kt', 'fun helper(){}\nfun main(){helper()}'],
    ['App.cs', 'class App { static void Helper(){} static void Main(){Helper();} }'],
]) test(`AST definitions and exact calls use real grammar for ${path}`, async () => {
    const result = await analyze([[path, code]]);
    assert.equal(result.edges.filter(edge => edge.kind === 'calls').length, 1);
    assert.ok(result.nodes.some(node => Array.isArray(node.attributes.entrypoints) && node.attributes.entrypoints.length));
});

test('AST parse errors are disclosed and do not produce fabricated calls', async () => {
    const result = await analyze([['broken.ts', 'function bad( { return absent( }']]);
    assert.equal(result.edges.filter(edge => edge.kind === 'calls').length, 0);
    assert.ok(result.diagnostics.some(item => item.code === 'logic-parse-error'));
});

test('Python module execution and package exports are distinct entrypoint categories', async () => {
    const result = await analyze([['__main__.py', 'def launch():\n    pass\nif __name__ == "__main__":\n    launch()\n'], ['index.js', 'export function api() {}']], [['package.json', '{"name":"demo","exports":"./index.js"}']]);
    assert.ok(result.nodes.some(node => node.attributes.entrypoints?.some(entry => entry.category === 'module-execution')));
    assert.ok(result.nodes.some(node => node.name === 'api' && node.attributes.entrypoints?.some(entry => entry.category === 'public-api')));
});

test('AST cached facts round-trip and reject malformed records', async () => {
    const { decodeLogicFacts } = await import('../bin/logic-facts-decode.mjs');
    const source = input('main.ts', 'function main(){ helper() } function helper() {}');
    const fact = parseLogicFacts(source, 'typescript');
    assert.deepEqual(decodeLogicFacts(JSON.parse(JSON.stringify(fact))), fact);
    assert.throws(() => decodeLogicFacts({ ...fact, calls: [{ caller: 3 }] }), /cached logic/);
});

test('CommonJS aliases resolve an exported function without interpreting a string as a callable', async () => {
    const result = await analyze([['app.js', "const {run: work} = require('./worker'); function main(){work()}"], ['worker.js', 'function run(){} module.exports = { run };']]);
    assert.deepEqual(callNames(result).filter(pair => pair[0] === 'main'), [['main', 'run']]);
});

test('same-package Go calls cross files but unknown receiver methods are not free functions', async () => {
    const result = await analyze([['main.go', 'package main\nfunc main(){ helper(); worker.Run() }'], ['other.go', 'package main\nfunc helper(){}\ntype Worker struct{}\nfunc (w Worker) Run(){}']]);
    assert.deepEqual(callNames(result), [['main', 'helper']]);
});

test('reassigned import bindings, Python methods, and Java overloads do not create confident calls', async () => {
    const result = await analyze([['app.ts', "import { run } from './other'; function main(){ run = replacement; run() }"], ['other.ts', 'export function run(){}'], ['app.py', 'class Worker:\n    def run(self):\n        pass\ndef main(worker):\n    worker.run()\n'], ['App.java', 'class App { static void work(int x){} static void work(String x){} static void main(){ work(1); } }']]);
    assert.deepEqual(callNames(result), []);
});

test('Python guard and framework annotations expose source-bound entrypoints', async () => {
    const result = await analyze([['app.py', 'def launch():\n    pass\nif __name__ == "__main__":\n    launch()\n'], ['Controller.java', '@RestController class Controller { @GetMapping("/hello") public String hello(){return "hello";} }'], ['App.kt', 'class App : Application() {\n override fun onCreate() { super.onCreate() }\n}\n']]);
    assert.ok(result.nodes.some(node => node.attributes.entrypoints?.some(entry => entry.rule === 'python-main-guard')));
    assert.ok(result.nodes.some(node => node.name === 'hello' && node.attributes.entrypoints?.some(entry => entry.rule === 'spring-route-annotation')));
    assert.ok(result.nodes.some(node => node.name === 'onCreate' && node.attributes.entrypoints?.some(entry => entry.rule === 'android-lifecycle-override')));
});

test('Rust module-qualified calls and Java/C# static imported owners cross source files', async () => {
    const entries = [['src/main.rs', 'mod worker;\nfn main(){worker::run();}'], ['src/worker.rs', 'pub fn run(){}'], ['App.java', 'package app; import service.Worker; class App { static void main(){Worker.run();} }'], ['Worker.java', 'package service; public class Worker { public static void run(){} }'], ['App.cs', 'namespace Demo; class App { static void Main(){Worker.Run();} }'], ['Worker.cs', 'namespace Demo; class Worker { public static void Run(){} }']];
    const inputs = entries.map(([path, text]) => input(path, text)), modules = inputs.map(extractCode);
    const result = analyzeLogic(inputs.map((source, index) => parseLogicFacts(source, modules[index].language)), modules, [{ id: 'pkg', kind: 'package', name: 'demo', attributes: { root: '', packageName: 'demo', memberIds: ['module:src/main.rs', 'module:src/worker.rs'] }, sources: [] }]);
    assert.deepEqual(callNames(result), [['main', 'run'], ['main', 'run'], ['Main', 'Run']]);
});

test('block-scoped declarations do not leak and reassigned CommonJS bindings are unresolved', async () => {
    const result = await analyze([['main.ts', 'function main(){ { const hidden = ()=>1; hidden(); } hidden(); }'], ['app.js', "const worker = require('./worker'); function main(){worker = replacement; worker.run()}"], ['worker.js', 'function run(){} exports.run = run;']]);
    assert.deepEqual(callNames(result), [['main', 'hidden']]);
});

test('named route handlers are source-bound entrypoints and nested callback bodies are not route roots', async () => {
    const result = await analyze([['routes.ts', 'function handler(){work()} function work(){}\napp.get("/hello", handler);\napp.post("/next", ()=>{ function nested(){} work(); });']]);
    const entries = result.nodes.filter(node => node.attributes.entrypoints?.some(entry => entry.category === 'route-handler'));
    assert.equal(entries.length, 2);
    assert.ok(entries.some(node => node.name === 'handler'));
    assert.equal(entries.some(node => node.name === 'nested'), false);
    assert.equal(entries.find(node => node.name === 'handler').attributes.entrypoints[0].source.line, 2);
});

test('manifest-registered Android lifecycle methods and console scripts have metadata line evidence', async () => {
    const result = await analyze([['App.kt', 'class App : CustomApplication() {\n override fun onCreate() {}\n}\n'], ['runner.py', 'def launch():\n    pass\n']], [['AndroidManifest.xml', '<manifest>\n<application android:name=".App"/>\n</manifest>'], ['pyproject.toml', '[project.scripts]\nrun = "runner:launch"\n']]);
    assert.ok(result.nodes.find(node => node.name === 'onCreate').attributes.entrypoints.some(entry => entry.source.path === 'AndroidManifest.xml' && entry.source.line === 2));
    assert.ok(result.nodes.find(node => node.name === 'launch').attributes.entrypoints.some(entry => entry.rule === 'python-console-script' && entry.source.line === 2));
});

test('imports inside one function cannot become global bindings in another function', async () => {
    const result = await analyze([['app.py', 'def load():\n    from worker import run\n    run()\ndef wrong():\n    run()\n'], ['worker.py', 'def run():\n    pass\n'], ['app.js', "function load(){ const worker = require('./worker'); worker.run(); } function wrong(){worker.run();}"], ['worker.js', 'function run(){} exports.run = run;']]);
    assert.deepEqual(callNames(result), [['load', 'run'], ['load', 'run']]);
});

test('default CommonJS and renamed namespace exports resolve declared exports only', async () => {
    const result = await analyze([['app.js', "const create = require('./factory'); function main(){create();}"], ['factory.js', 'function factory(){} module.exports = factory;'], ['index.ts', "import * as api from './api'; function main(){api.run();}"], ['api.ts', 'function internal(){} export {internal as run};']]);
    assert.deepEqual(callNames(result), [['main', 'factory'], ['main', 'internal']]);
});

test('a locally bound require never proves a repository import target', async () => {
    const result = await analyze([['app.js', "function main(require){ const worker = require('./worker'); worker.run(); }"], ['worker.js', 'function run(){} exports.run = run;']]);
    assert.deepEqual(callNames(result), []);
});

test('Spring application markers identify the static boot main with annotation evidence', async () => {
    const result = await analyze([['App.java', '@SpringBootApplication\npublic class App { public static void main(String[] args) { Boot.run(App.class,args); } }']]);
    const entry = result.nodes.find(node => node.name === 'main').attributes.entrypoints.find(entry => entry.rule === 'spring-application-main');
    assert.equal(entry.source.line, 1);
});

test('C# receiver resolution indexes namespaces once and preserves ambiguous targets', async () => {
    const { logicResolver } = await import('../dist/adapters/logic-resolve.js');
    let reads = 0;
    const facts = Array.from({ length: 80 }, (_, index) => ({ version: 1, path: `src/File${index}.cs`, language: 'csharp', contentHash: 'hash', definitions: [{ id: `f${index}`, name: 'Run', line: 1, endLine: 1, start: 0, end: 100, parent: '', scopeStart: 0, scopeEnd: 100, owner: `Type${index}`, static: true, exported: true, exportNames: [], bindings: [], annotations: [] }], imports: [], calls: [], topBindings: [], classes: [], diagnostics: [], supported: true }));
    const modules = facts.map(fact => ({ node: { sources: [{ path: fact.path }], attributes: { get namespaces() { reads++; return ['Shared', 'AlsoShared']; } } } }));
    const resolve = logicResolver(facts, modules, []);
    for (const fact of facts) {
        const call = { caller: fact.definitions[0].id, name: 'Run', receiver: 'Type0', line: 1, endLine: 1, start: 10, callbackIds: [], route: false };
        assert.equal(resolve(fact, call)?.definition.id, 'f0');
        assert.equal(resolve(fact, { ...call, receiver: 'Missing' }), undefined);
    }
    assert.ok(reads <= facts.length * 2, `namespace reads should be linear, received ${reads}`);
    const ambiguous = { ...facts[1], definitions: [{ ...facts[1].definitions[0], owner: 'Type0' }] };
    assert.equal(logicResolver([facts[0], ambiguous], modules, [])(facts[0], { caller: 'f0', name: 'Run', receiver: 'Type0', line: 1, endLine: 1, start: 10, callbackIds: [], route: false }), undefined);
});

test('CommonJS require shadowing is lexical and does not suppress unrelated top-level imports', async () => {
    for (const shadow of ['function unrelated(require) { const hidden = require("./worker"); hidden.run(); }', '{ const require = fake; const hidden = require("./worker"); hidden.run(); }', 'function unrelated() { function require() {} const hidden = require("./worker"); hidden.run(); }', 'function unrelated() { var require = fake; const hidden = require("./worker"); hidden.run(); }']) {
        const result = await analyze([['main.js', `const worker = require('./worker'); function main(){worker.run();} ${shadow}`], ['worker.js', 'function run() {} exports.run = run;']]);
        assert.deepEqual(callNames(result).filter(([, target]) => target === 'run'), [['main', 'run']]);
    }
    for (const shadow of ['const require = fake;', 'var require = fake;', 'function require() {}', 'const require = () => fake;', '{ var require = fake; }']) {
        const result = await analyze([['main.js', `${shadow} const worker = require('./worker'); function main(){worker.run();}`], ['worker.js', 'function run() {} exports.run = run;']]);
        assert.deepEqual(callNames(result).filter(([, target]) => target === 'run'), []);
    }
});

test('malformed files retain first syntax error evidence without collecting unusable partial facts', () => {
    const source = input('bad.ts', 'function valid() {}\n\nconst broken = ;\nfunction later(){ valid(); }');
    const fact = parseLogicFacts(source, 'typescript');
    assert.equal(fact.supported, true);
    assert.equal(fact.diagnostics[0].code, 'logic-parse-error');
    assert.equal(fact.diagnostics[0].line, 3);
    assert.deepEqual(fact.definitions, []);
    assert.deepEqual(fact.calls, []);
    assert.deepEqual(fact.imports, []);
    assert.deepEqual(fact.classes, []);
    assert.deepEqual(fact.topBindings, []);
    const result = analyzeLogic([fact], [extractCode(source)]);
    assert.deepEqual(result.nodes, []);
    assert.deepEqual(result.coveredModuleIds, []);
    assert.deepEqual(result.diagnostics, fact.diagnostics);
});

test('callback references are collected only for route entrypoints and ordinary calls remain intact', async () => {
    const source = input('routes.ts', 'function handler() {} function invoke(callback){} function main(){invoke(handler); app.get("/", handler);}');
    const fact = parseLogicFacts(source, 'typescript');
    assert.deepEqual(fact.calls.find(call => call.name === 'invoke').callbackIds, []);
    assert.equal(fact.calls.find(call => call.name === 'get').callbackIds.length, 1);
    const result = analyzeLogic([fact], [extractCode(source)]);
    assert.deepEqual(callNames(result), [['main', 'invoke']]);
    assert.ok(result.nodes.find(node => node.name === 'handler').attributes.entrypoints.some(entry => entry.category === 'route-handler'));
});

test('Kotlin resolves same-owner methods and imported object functions without treating instances as objects', async () => {
    const result = await analyze([
        ['App.kt', 'package app\nimport service.Service\nclass App {\n fun onCreate() { setup(); Service.initialize(); unknown.initialize() }\n private fun setup() {}\n}\n'],
        ['Service.kt', 'package service\nobject Service {\n fun initialize() {}\n}\nclass Other {\n fun initialize() {}\n}\n'],
    ]);
    assert.deepEqual(callNames(result), [['onCreate', 'setup'], ['onCreate', 'initialize']]);
    const falseStatic = await analyze([['App.kt', 'package app\nimport service.Service\nfun main() { Service.initialize() }\n'], ['Service.kt', 'package service\nclass Service {\n fun initialize() {}\n}\n']]);
    assert.deepEqual(callNames(falseStatic), []);
});

test('Rust grouped public reexports resolve aliases at explicit crate roots and stop at private or cyclic imports', async () => {
    const inputs = [['engine/main.rs', 'mod commands; fn main(){ commands::launch(); commands::hidden(); commands::looped(); }'], ['engine/commands/mod.rs', 'mod parser; pub(crate) use crate::commands::{parser::{parse as launch}, cycle::looped}; use self::parser::secret as hidden; mod cycle;'], ['engine/commands/parser.rs', 'pub(crate) fn parse(){} pub(crate) fn secret(){}'], ['engine/commands/cycle.rs', 'pub use super::looped;']].map(([path, text]) => input(path, text));
    const modules = inputs.map(extractCode), facts = inputs.map(source => parseLogicFacts(source, 'rust'));
    const packages = [{ id: 'build-package:Cargo.toml', kind: 'package', name: 'engine', attributes: { root: '', packageName: 'engine', memberIds: modules.map(module => module.node.id), entryTargets: ['engine/main.rs'] }, sources: [] }];
    assert.deepEqual(callNames(analyzeLogic(facts, modules, packages)), [['main', 'parse']]);
    const { decodeLogicFacts } = await import('../bin/logic-facts-decode.mjs');
    assert.deepEqual(decodeLogicFacts(JSON.parse(JSON.stringify(facts[1]))), facts[1]);
});
