import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
import { codeStructure } from '../dist/adapters/code-structure.js';
import { structuralFilePreviews } from '../dist/query/structural-file-previews.js';
const module = (path, text) => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const references = modules => codeStructure(modules).edges.filter(edge => edge.kind === 'references');

test('Go declaration types connect only their actual unique defining files with both anchors', () => {
    // Given one package whose API fields and signatures use three types.
    const modules = [module('command.go', 'package cli\ntype Command struct {\n Args PositionalArgs\n Options CompletionOptions\n}'), module('args.go', 'package cli\ntype PositionalArgs func(cmd *Command, args []string) error'), module('completion.go', 'package cli\ntype CompletionOptions struct {}\nfunc Complete(cmd *Command) {}')];
    // When declarations become graph evidence.
    const edges = references(modules);
    // Then reciprocal type references retain exact names and source locations, without imports.
    assert.deepEqual(edges.map(edge => [edge.source, edge.target, edge.attributes.name, edge.sources.map(source => [source.path, source.line])]), [
        ['module:command.go', 'module:args.go', 'PositionalArgs', [['command.go', 3], ['args.go', 2]]],
        ['module:command.go', 'module:completion.go', 'CompletionOptions', [['command.go', 4], ['completion.go', 2]]],
        ['module:args.go', 'module:command.go', 'Command', [['args.go', 2], ['command.go', 2]]],
        ['module:completion.go', 'module:command.go', 'Command', [['completion.go', 3], ['command.go', 2]]],
    ]);
    assert.deepEqual(resolveModuleLinks(modules).edges, []);
    const previews = structuralFilePreviews(modules.map(item => item.node), edges);
    assert.equal(previews.find(item => item.id === 'module:command.go').references.length, 2);
});

test('Go type reference evidence excludes selectors, names, shadows, bodies and ambiguous definitions', () => {
    // Given lookalike identifiers that do not prove use of the package type.
    const types = module('types.go', 'package p\ntype Command struct {}\ntype Repeated struct {}');
    const files = [types, module('variant.go', 'package p\ntype Repeated struct {}'), module('other/type.go', 'package p\ntype Foreign struct {}'), module('use.go', `package p
import remote "example/remote"
type Fields struct { Command string; Remote remote.Command; Sized [2 * Command]int }
func Generic[Command any](x Command) {}
func Local() { type Command int; var x Command; _ = x }
func Other(x Foreign, y Repeated) {}
// Command is not a reference here.
var text = "Command"
var keyword = "type"
var another = "func"
`), module('external_test.go', 'package p_test\nfunc Test(x Command) {}')];
    // When static type uses are resolved.
    const edges = references(files);
    // Then no fabricated file relationship is admitted.
    assert.deepEqual(edges, []);
});

test('Go grouped parameters, receiver types and results preserve type positions', () => {
    // Given named groups and unnamed types, with a field name matching a package type.
    const files = [module('types.go', 'package p\ntype A struct {}\ntype B struct {}'), module('use.go', 'package p\nfunc Group(A, b *B) *A { return nil }\nfunc (b *B) Result(x A) (A, *B) { return A{}, nil }')];
    // When declaration type evidence is collected.
    const edges = references(files);
    // Then a grouped parameter name is not counted, and repeated uses on one line are deduplicated.
    assert.deepEqual(edges.map(edge => [edge.attributes.name, edge.sources[0].line]), [['B', 2], ['A', 2], ['B', 3], ['A', 3]]);
});


test('Go grouped names and dot imports do not masquerade as type references', () => {
    // Given a type whose spelling also appears as parameter and field names.
    const target = module('type.go', 'package p\ntype Command struct {}');
    const names = module('names.go', 'package p\nfunc Names(Command, other string) {}\ntype Fields struct { Command, Other string }\nfunc Actual(Command) {}');
    const dot = module('dot.go', 'package p\nimport . "example/p"\nfunc F(Command) {}');
    const alias = module('alias.go', 'package p\nimport Command "example/p"\nfunc F(x Command.T) {}');
    // When declaration evidence resolves each file scope.
    const edges = references([target, names, dot, alias]);
    // Then only the genuine unnamed parameter type resolves.
    assert.deepEqual(edges.map(edge => [edge.source, edge.attributes.name, edge.sources[0].line]), [['module:names.go', 'Command', 4]]);
});

test('Go closure-local type declarations cannot own references from another file', () => {
    // Given local names inside package-level function literals, including a builtin shadow.
    const modules = [module('local.go', 'package p\nvar f = func() { _ = \"}\"; _ = `)`; type string struct {}; type Command struct {} }'), module('use.go', 'package p\nfunc Use(c string) {}\nfunc Unknown(c Command) {}')];
    // When cross-file ownership is resolved.
    const edges = references(modules);
    // Then closure-local definitions do not become package types.
    assert.deepEqual(edges, []);
});


test('Go grouped package declarations participate in ownership and ambiguity checks', () => {
    // Given grouped definitions, including a name duplicated by a build variant.
    const grouped = module('types.go', 'package p\ntype (\n First struct {}\n Command struct {}\n Repeated struct {}\n)');
    const variant = module('variant.go', 'package p\ntype Repeated struct {}');
    const use = module('use.go', 'package p\nfunc Use(c Command, r Repeated) {}');
    // When package ownership resolves named type uses.
    const edges = references([grouped, variant, use]);
    // Then the later grouped name resolves but the duplicate cannot select one definition.
    assert.deepEqual(edges.map(edge => [edge.attributes.name, edge.sources[1].line]), [['Command', 4]]);
});


test('Go literal keywords and delimiters never enter the declaration grammar', () => {
    // Given punctuation and keywords inside a closure that also declares a local type.
    const literals = ['type', 'func', 'import', '*', '[', ']', '{', '}', '(', ')', ';', ',', '.'];
    const body = literals.map(value => `_ = ${JSON.stringify(value)}`).join('; ');
    const local = module('local.go', `package p\nvar f = func() { ${body}; type string struct {} }`);
    const use = module('use.go', 'package p\nfunc Use(c string) {}');
    const target = module('target.go', 'package p\ntype T struct {}');
    const tagged = module('tagged.go', 'package p\ntype X struct { Field T "[" }');
    // When package ownership and declaration type references are extracted.
    const edges = references([local, use, target, tagged]);
    // Then literals neither expose local declarations nor hide the real field type.
    assert.deepEqual(edges.map(edge => [edge.source, edge.target, edge.attributes.name]), [['module:tagged.go', 'module:target.go', 'T']]);
});
