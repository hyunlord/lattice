import test from 'node:test';
import assert from 'node:assert/strict';
import * as integration from '../dist/adapters/logic-graft.js';
const source = (path, line, endLine = line) => ({ path, line, endLine, pointer: '', contentHash: path });
const node = (id, name, path, line, extra = {}) => ({ id, name, kind: 'function', attributes: extra, sources: [source(path, line)] });
const edge = (id, kind, from, to, sources = [], attributes = {}) => ({ id, kind, source: from, target: to, directed: true, field: '', sources, attributes });
const a = node('logic:a', 'start', 'a.ts', 2, { module: 'module:a.ts', entrypoints: [{ category: 'public-api', rule: 'export', source: source('a.ts', 2) }] });
const b = node('logic:b', 'work', 'b.ts', 1, { module: 'module:b.ts' });
const ga = { ...node('graft:a', 'start', 'a.ts', 2, { extraction: 'graft', signature: 'function start()', evidence: 'static' }), sources: [source('a.ts', 2), source('graft/.graph/wiring.json', 4)] };
const gb = node('graft:b', 'work', 'b.ts', 1, { extraction: 'graft' });
const logic = { nodes: [a, b], edges: [edge('la', 'contains', 'module:a.ts', a.id), edge('lb', 'contains', 'module:b.ts', b.id), edge('call', 'calls', a.id, b.id, [source('a.ts', 3)], { resolution: 'exact', evidence: 'static-call' })] };
const graft = { nodes: [ga, gb], edges: [edge('ga', 'contains', 'module:a.ts', ga.id), edge('gb', 'contains', 'module:b.ts', gb.id), edge('gc', 'calls', ga.id, gb.id, [source('graft/.graph/wiring.json', 8)], { extraction: 'graft' })] };
test('matching source-bound functions keep Graft identities and AST entrypoint/callsite evidence', () => {
    assert.equal(typeof integration.reconcileLogicGraft, 'function');
    const result = integration.reconcileLogicGraft(logic, graft);
    assert.equal(result.logic.nodes.length, 0); assert.equal(result.graft.nodes.length, 2);
    const merged = result.graft.nodes.find(node => node.id === ga.id); assert.equal(merged.attributes.signature, 'function start()'); assert.deepEqual(merged.attributes.entrypoints, a.attributes.entrypoints); assert.ok(merged.sources.some(s => s.path === 'graft/.graph/wiring.json'));
    const calls = [...result.logic.edges, ...result.graft.edges].filter(edge => edge.kind === 'calls'); assert.equal(calls.length, 1); assert.equal(calls[0].source, ga.id); assert.equal(calls[0].target, gb.id); assert.deepEqual(calls[0].sources, logic.edges[2].sources); assert.equal(calls[0].attributes.resolution, 'exact');
    assert.equal([...result.logic.edges, ...result.graft.edges].filter(edge => edge.kind === 'contains').length, 2);
});
test('uncovered callers still reach Graft-covered functions and lexical references are rebased', () => {
    const child = node('logic:child', 'nested', 'c.ts', 9, { lexicalParent: b.id });
    const partial = integration.reconcileLogicGraft({ ...logic, nodes: [a, b, child] }, { nodes: [gb], edges: [] });
    assert.deepEqual(partial.logic.nodes.map(node => node.id), [a.id, child.id]); assert.equal(partial.logic.nodes[1].attributes.lexicalParent, gb.id); assert.equal(partial.logic.edges.find(edge => edge.id === 'call').target, gb.id);
});
test('ambiguous same-line functions are not guessed and repeated exact call sites remain distinct', () => {
    const duplicate = { ...b, id: 'logic:b2' };
    const ambiguous = integration.reconcileLogicGraft({ ...logic, nodes: [a, b, duplicate] }, graft);
    assert.ok(ambiguous.logic.nodes.some(node => node.id === b.id)); assert.ok(ambiguous.logic.nodes.some(node => node.id === duplicate.id));
    const second = { ...logic.edges[2], id: 'second', sources: [source('a.ts', 4)] };
    const result = integration.reconcileLogicGraft({ ...logic, edges: [...logic.edges, second] }, graft);
    assert.equal([...result.logic.edges, ...result.graft.edges].filter(edge => edge.kind === 'calls').length, 2);
});
test('source drift and ambiguous imported candidates cannot erase standalone AST functions', () => {
    const stale = { ...gb, sources: [{ ...gb.sources[0], contentHash: 'stale' }] };
    assert.equal(integration.reconcileLogicGraft(logic, { nodes: [stale], edges: [] }).logic.nodes.length, 2);
    const twin = { ...gb, id: 'graft:other' };
    assert.equal(integration.reconcileLogicGraft(logic, { nodes: [gb, twin], edges: [] }).logic.nodes.length, 2);
});
test('imported methods receive callable semantics while retaining original kind and metadata', () => {
    const method = { ...gb, kind: 'method', attributes: { signature: 'void work()', extraction: 'graft' } };
    const result = integration.reconcileLogicGraft(logic, { nodes: [method], edges: [] });
    assert.equal(result.graft.nodes[0].kind, 'function'); assert.equal(result.graft.nodes[0].attributes.graftKind, 'method'); assert.equal(result.graft.nodes[0].attributes.graftMetadata.signature, 'void work()');
});
