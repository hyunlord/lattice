import assert from 'node:assert/strict';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text) => extractCode({ path, text, contentHash: 'a'.repeat(64) });

test('repeated namespace imports read declarations and package evidence linearly', () => {
    let declarations = 0, evidence = 0;
    const count = 120;
    const members = Array.from({ length: count }, (_, index) => {
        const value = module(`base/T${index}.cs`, `namespace Domain; class T${index} {}`);
        const namespaces = value.node.attributes.namespaces, sources = value.node.sources;
        return { ...value, node: { ...value.node, attributes: { ...value.node.attributes, get namespaces() { declarations++; return namespaces; } }, get sources() { evidence++; return sources; } } };
    });
    const importers = Array.from({ length: count }, (_, index) => module(`app/A${index}.cs`, 'using Domain;'));
    const result = resolveModuleLinks([...members, ...importers]);
    assert.equal(result.edges.length, count);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.membershipEdges.length, count);
    assert(result.edges.every(edge => edge.target === 'package:csharp:Domain'));
    assert(declarations < count * 10, `declaration reads ${declarations}`);
    assert(evidence < count * 20, `evidence reads ${evidence}`);
});

test('namespace/type collisions preserve module order, scope fallback and ambiguity', () => {
    const result = resolveModuleLinks([
        module('types/T.cs', 'namespace Outer; class Inner {}'),
        module('inner/I.cs', 'namespace Outer.Inner; class Item {}'),
        module('app/A.cs', 'namespace Outer.App; using Inner; using Alias = Outer.Inner;'),
    ]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['package:csharp:Outer.Inner']);
    assert.equal(result.diagnostics.length, 1);
    assert(result.diagnostics.every(d => d.code === 'ambiguous-module'));
});
