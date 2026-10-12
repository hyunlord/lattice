import assert from 'node:assert/strict';
import test from 'node:test';
import { extractLogicFacts } from '../bin/logic-facts.mjs';
import { definitionTypes } from '../bin/logic-facts-types.mjs';

function syntaxNode(type, children = []) {
    let reads = 0;
    const node = { get type() { reads++; return type; }, id: 1, startIndex: 0, endIndex: 1, startPosition: { row: 0, column: 0 }, endPosition: { row: 0, column: 1 }, text: '', parent: null, hasError: false, isMissing: false, children, namedChildren: children, childForFieldName: () => null };
    for (const child of children) child.parent = node;
    return { node, reads: () => reads };
}

test('main extraction reuses each visited node type within its two passes', () => {
    // Given an empty valid tree, when extracting facts, then the two main passes add only one type read each.
    const root = syntaxNode('compilation_unit');
    const facts = extractLogicFacts({ path: 'empty.cs', text: '', contentHash: 'empty' }, 'csharp', root.node);
    assert.deepEqual(facts, { version: 1, path: 'empty.cs', language: 'csharp', contentHash: 'empty', definitions: [], calls: [], imports: [], classes: [], topBindings: [], diagnostics: [], supported: true });
    // Existing export and import helpers account for the remaining five reads.
    assert.ok(root.reads() <= 7, `expected at most 7 native type reads, received ${root.reads()}`);
});

test('receiver scan reuses a nonbinding node type across its classification checks', () => {
    // Given a nonbinding body node, when collecting definition types, then receiver classification reads its type once.
    const body = syntaxNode('block');
    const method = syntaxNode('method_declaration', [body.node]);
    assert.deepEqual(definitionTypes(method.node, 'csharp'), { nonVirtual: true, receivers: [] });
    // Modifier and parameter selection each retain their independent single read.
    assert.ok(body.reads() <= 3, `expected at most 3 native type reads, received ${body.reads()}`);
});
