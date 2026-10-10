import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
import { codeStructure } from '../dist/adapters/code-structure.js';
const module = (path, text = '') => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('Go module roots resolve local packages without inventing standard-library dependencies', () => {
    const modules = [module('go.mod', 'module example.org/app\n'), module('main.go', 'package main\nimport ("example.org/app/model"; "fmt")\nfunc main() {}'), module('model/model.go', 'package model\ntype Model struct {}\nfunc (m Model) Run() {}')];
    const graph = resolveModuleLinks(modules);
    assert.deepEqual(graph.edges.map(edge => edge.target), ['package:go:model']);
    assert.deepEqual(graph.diagnostics.map(value => value.specifier), ['fmt']);
    assert.deepEqual(codeStructure(modules).nodes.map(node => node.name), ['main', 'Model', 'Run']);
});

test('Java and Kotlin package/type imports support aliases and explicit package wildcard targets', () => {
    const modules = [module('App.java', 'package app;\nimport demo.Model;\nclass App { public void run() { consume(); } }'), module('Model.kt', 'package demo\ndata class Model(val x: Int)\nfun build(): Model { return Model(1) }'), module('Use.kt', 'package app\nimport demo.build as make\nimport demo.*\nfun launch() {}')];
    const graph = resolveModuleLinks(modules);
    assert.deepEqual(graph.diagnostics, []);
    assert.deepEqual(graph.edges.map(edge => edge.target), ['module:Model.kt', 'module:Model.kt', 'package:jvm:demo']);
    assert.deepEqual(codeStructure(modules).nodes.map(node => node.name), ['App', 'run', 'Model', 'build', 'launch']);
});

test('Swift conventional source modules and GDScript resource references remain static links', () => {
    const modules = [module('Sources/App/App.swift', 'import Domain\nstruct App { func run() {} }'), module('Sources/Domain/Model.swift', 'public struct Model {}'), module('main.gd', 'extends "res://base.gd"\nconst Thing = preload("res://thing.gd")\nfunc run():\n    print("func fake():")'), module('base.gd', 'class_name Base\nextends Node\nfunc start():\n    pass'), module('thing.gd', 'class_name Thing\nextends Base')];
    const graph = resolveModuleLinks(modules);
    assert.deepEqual(graph.edges.map(edge => edge.target), ['package:swift:Sources/Domain', 'module:base.gd', 'module:thing.gd', 'module:base.gd']);
    assert.deepEqual(graph.diagnostics.map(value => value.specifier), ['Node']);
    const definitions = codeStructure(modules);
    assert.deepEqual(definitions.nodes.map(node => node.name), ['App', 'run', 'Model', 'run', 'Base', 'start', 'Thing']);
    assert.equal(definitions.edges.every(edge => edge.kind === 'contains'), true);
    assert.equal(definitions.nodes.find(node => node.name === 'start').sources[0].line, 3);
});

test('C# Rust JS TS Python major definitions ignore comments, strings and function-local calls', () => {
    const modules = [module('A.cs', 'namespace Demo; class A { public void Run() { Fake(); } }'), module('src/lib.rs', 'pub struct Model {}\npub fn run() { fake(); }'), module('x.ts', '// class Fake {}\nexport interface Model {}\nexport function run() { call(); }'), module('x.py', '"""def fake(): pass"""\nclass Model:\n    def run(self):\n        print("class Fake:")')];
    assert.deepEqual(codeStructure(modules).nodes.map(node => node.name), ['A', 'Run', 'Model', 'run', 'Model', 'run', 'Model', 'run']);
});

test('language literals and comments cannot inject imports or major declarations', () => {
    const fixtures = [
        module('fake.go', 'package fake\nvar s = `import "fake/path"; type Fake struct {}; func fake(){}`\n// import "bad"\nfunc actual() {}'),
        module('fake.kt', '/* outer /* inner */ import fake.Type */\nval s = """import fake.Type\nclass Fake {}"""\nenum class Actual {}'),
        module('fake.swift', 'let s = #" quote " import Fake; struct Fake {} "#\n/* outer /* inner */ import Fake */\nstruct Actual {}'),
        module('fake.java', 'class Actual { String s = """\nimport fake.Type; class Fake {}\n"""; void run() { call(); } }'),
        module('fake.gd', '# extends "res://bad.gd"\nvar s = """func fake():\n preload("res://bad.gd")"""\nfunc actual():\n    pass'),
    ];
    assert.deepEqual(fixtures.flatMap(item => item.imports), []);
    assert.deepEqual(codeStructure(fixtures).nodes.map(node => node.name), ['actual', 'Actual', 'Actual', 'Actual', 'run', 'actual']);
});

test('ambiguous symbols and missing Go module manifests remain unresolved', () => {
    const result = resolveModuleLinks([
        module('main.go', 'package main\nimport "example.org/model"'), module('model/model.go', 'package model'),
        module('Use.java', 'import demo.Model;'), module('one/Model.java', 'package demo; class Model {}'), module('two/Model.java', 'package demo; class Model {}'),
        module('Use.swift', 'import Missing'), module('Use.gd', 'extends "res://absent.gd"'),
    ]);
    assert.deepEqual(result.edges, []);
    assert.equal(result.diagnostics.length, 4);
    assert.equal(result.diagnostics.find(item => item.specifier === 'demo.Model').code, 'ambiguous-module');
});

test('Go excludes external test package files and Swift does not cross separate Sources roots', () => {
    const modules = [module('go.mod', 'module example.org/app'), module('app.go', 'package app\nimport "example.org/app/model"'), module('model/a.go', 'package model'), module('model/a_test.go', 'package model_test'), module('Sources/App/A.swift', 'import Domain'), module('Sources/Domain/D.swift', 'struct D {}'), module('examples/Other/Sources/Domain/D.swift', 'struct Other {}')];
    assert.deepEqual(resolveModuleLinks(modules).edges.map(edge => edge.target), ['package:go:model', 'package:swift:Sources/Domain']);
});

test('definition provenance links point at the declaration rather than the containing file start', () => {
    const value = module('Model.java', 'package demo;\nclass Model {}');
    const linked = { ...value, node: { ...value.node, sources: value.node.sources.map(source => ({ ...source, url: 'https://example.org/blob/revision/Model.java#L1', revision: 'revision' })) } };
    const node = codeStructure([linked]).nodes[0];
    assert.equal(node.sources[0].line, 2);
    assert.equal(node.sources[0].url, 'https://example.org/blob/revision/Model.java#L2');
    assert.equal(node.sources[0].contentHash, value.node.sources[0].contentHash);
});


test('same-line overloads retain distinct deterministic definition and containment identities', () => {
    const modules = [module('A.cs', 'class A { void Run() {} void Run(int x) {} }')];
    const first = codeStructure(modules), second = codeStructure(modules);
    assert.deepEqual(first.nodes.map(node => node.name), ['A', 'Run', 'Run']);
    assert.equal(new Set(first.nodes.map(node => node.id)).size, 3);
    assert.equal(new Set(first.edges.map(edge => edge.id)).size, 3);
    assert.deepEqual(first, second);
});

test('Kotlin extension functions use the callable name rather than the receiver type', () => {
    const nodes = codeStructure([module('Extensions.kt', 'fun String.greet(): String { return this }\nfun List<String>.names() {}')]).nodes;
    assert.deepEqual(nodes.map(node => node.name), ['greet', 'names']);
});

test('literal dynamic imports are resolved inside functions without inventing expression or property-call targets', () => {
    // Given nested literal imports plus syntactically similar non-import expressions.
    const input = module('app.ts', `async function load() {
        await import('./model.js');
        await import(
          './other.js', { with: { type: 'json' } }
        );
        await import('./unknown' + suffix);
        await import(dynamicPath);
        obj.import('./fake.js');
        obj?.import('./fake.js');
        // import('./fake.js')
        const text = "import('./fake.js')";
        const template = \`import('./fake.js')\`;
    }`);
    // When references are extracted and resolved against real selected modules.
    const result = resolveModuleLinks([input, module('model.ts'), module('other.ts'), module('fake.ts')]);
    // Then only literal language imports are present with original statement provenance.
    assert.deepEqual(input.imports.map(item => [item.specifier, item.source.line]), [['./model.js', 2], ['./other.js', 3]]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:model.ts', 'module:other.ts']);
});

test('Java method names cannot masquerade as type or package prefixes', () => {
    // Given a method named like the target package and its real public type.
    const modules = [module('Use.java', 'package client; import demo.parser.Parser; class Use {}'), module('Connection.java', 'package demo; interface Connection { Object parser(); }'), module('Parser.java', 'package demo.parser; public class Parser {}')];
    // When the explicit type import is resolved.
    const result = resolveModuleLinks(modules);
    // Then the method owner is not a competing import destination.
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:Parser.java']);
});

test('Java nested static wildcard imports require their actual qualified nested type', () => {
    // Given two distinct enclosing types, only one declaring Inner.
    const modules = [module('Use.java', 'import static demo.Outer.Inner.*; import static demo.Other.Inner.*;'), module('Outer.java', 'package demo; class Outer { static class Inner { static int VALUE; } }'), module('Other.java', 'package demo; class Other {}')];
    // When wildcard imports resolve.
    const result = resolveModuleLinks(modules);
    // Then the declared nesting resolves and the absent nested owner remains unresolved.
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:Outer.java']);
    assert.deepEqual(result.diagnostics.map(item => item.specifier), ['demo.Other.Inner.*']);
});

test('Java nested type qualification stops at the enclosing declaration boundary', () => {
    // Given sibling top-level types and nested owner declarations on one line.
    const value = module('Types.java', 'package demo; class Outer { class Inner {} } class Peer { class Nested {} }');
    // When declaration metadata is extracted.
    const types = value.node.attributes.definitions.filter(definition => definition.kind === 'type');
    // Then nested owners remain exact and never leak into the next top-level declaration.
    assert.deepEqual(types.map(definition => definition.qualifiedName), ['Outer', 'Outer.Inner', 'Peer', 'Peer.Nested']);
});
