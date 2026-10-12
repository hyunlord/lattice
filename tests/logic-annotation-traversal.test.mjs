import assert from 'node:assert/strict';
import test from 'node:test';
import { annotations } from '../bin/logic-facts-ast.mjs';

function syntaxNode(type, startIndex, options = {}) {
    const node = { type, startIndex, endIndex: options.endIndex ?? startIndex + 1, text: options.text ?? type, parent: null, childForFieldName: name => options.fields?.[name] ?? null, get namedChildren() { options.onChildren?.(); return options.children ?? []; } };
    for (const child of options.children ?? []) child.parent = node;
    return node;
}
const marker = (startIndex, text) => syntaxNode('marker_annotation', startIndex, { text });

test('annotation traversal never enters the subtree starting exactly at bodyStart', () => {
    // Given a body that fails on traversal, when reading annotations, then only the header is inspected.
    const first = marker(1, 'First'), second = marker(5, 'Second');
    const body = syntaxNode('block', 10, { onChildren() { throw new Error('body subtree traversed'); } });
    const method = syntaxNode('method_declaration', 0, { fields: { body }, children: [first, second, body], endIndex: 50 });
    assert.deepEqual(annotations(method), ['First', 'Second']);
});

test('annotation traversal preserves header ancestors that cross the body boundary', () => {
    // Given a header ancestor extending across the cutoff, when pruning, then its earlier annotation survives.
    const header = syntaxNode('modifiers', 1, { endIndex: 30, children: [marker(9, 'Header')] });
    const body = syntaxNode('block', 10, { children: [marker(11, 'BodyOnly')] });
    const method = syntaxNode('method_declaration', 0, { fields: { body }, children: [header, body], endIndex: 40 });
    assert.deepEqual(annotations(method), ['Header']);
});

test('annotation traversal retains decorated parents, preorder and original name selection', () => {
    // Given two decorators and a named annotation, when extracting, then source order and selected text are unchanged.
    const name = syntaxNode('identifier', 7, { text: 'Named' });
    const named = syntaxNode('annotation', 6, { fields: { name }, children: [name], text: '@Ignored' });
    const body = syntaxNode('block', 20);
    const definition = syntaxNode('function_definition', 10, { fields: { body }, children: [body], endIndex: 50 });
    const decorator = syntaxNode('decorator', 1, { children: [syntaxNode('identifier', 2, { text: 'Outer' })] });
    syntaxNode('decorated_definition', 0, { children: [decorator, named, definition], endIndex: 50 });
    assert.deepEqual(annotations(definition), ['Outer', 'Named']);
});

test('annotation traversal keeps unsupported callable subtrees excluded within headers', () => {
    // Given a callable boundary before the body, when walking the header, then its annotations never leak.
    const closure = syntaxNode('lambda_expression', 3, { onChildren() { throw new Error('unsupported callable traversed'); } });
    const body = syntaxNode('block', 20);
    const method = syntaxNode('method_declaration', 0, { fields: { body }, children: [marker(1, 'Visible'), closure, body], endIndex: 50 });
    assert.deepEqual(annotations(method), ['Visible']);
});

test('annotation traversal preserves endIndex fallback when the native body field is absent', () => {
    // Given a Kotlin-style function_body without a body field, when extracting, then existing fallback semantics remain.
    const body = syntaxNode('function_body', 10, { children: [marker(11, 'ExistingFallback')] });
    const method = syntaxNode('function_declaration', 0, { children: [marker(1, 'Header'), body], endIndex: 50 });
    assert.deepEqual(annotations(method), ['Header', 'ExistingFallback']);
});

test('annotation traversal preserves existing exclusion of C# attributes and Rust attributes', () => {
    // Given attribute node kinds outside the accepted set, when extracting, then no new annotation semantics appear.
    const method = syntaxNode('method_declaration', 0, { children: [syntaxNode('attribute_list', 1, { text: '[First]' }), syntaxNode('attribute_item', 2, { text: '#[second]' }), marker(3, 'Recognized')], endIndex: 10 });
    assert.deepEqual(annotations(method), ['Recognized']);
});
