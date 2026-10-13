import test from 'node:test';
import assert from 'node:assert/strict';
import { logicCalls, logicEntrypoints } from '../dist/query/logic-model.js';
const source = { path: 'src/main.ts', line: 1, pointer: '', contentHash: 'a' };
test('one call query describes only its requested function, not every indexed function', () => {
    const seen = [];
    const node = id => ({ id, kind: 'function', name: id, sources: [source], attributes: { get entrypoints() { seen.push(id); return []; } } });
    const graph = { nodes: [node('a'), node('b'), node('unrelated')], edges: [{ id: 'ab', kind: 'calls', source: 'a', target: 'b', directed: true, attributes: { resolution: 'exact' }, sources: [source] }] };
    const result = logicCalls(graph, { id: 'a' }); assert.equal(result.outgoing.total, 1); assert.deepEqual(seen, ['a']);
    logicCalls(graph, { id: 'a' }); assert.deepEqual(seen, ['a']);
});
test('entrypoint ranking avoids building adjacency lists for unrelated call edges', () => {
    let sortedCalls = 0;
    const node = id => ({ id, kind: 'function', name: id, sources: [source], attributes: { entrypoints: id === 'a' ? [{ category: 'executable', rule: 'main', source }] : [] } });
    const edge = (id, a, b) => ({ get id() { sortedCalls++; return id; }, kind: 'calls', source: a, target: b, directed: true, attributes: { resolution: 'exact' }, sources: [source] });
    const graph = { nodes: [node('a'), node('b'), node('c')], edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')] };
    assert.equal(logicEntrypoints(graph).items[0].node.id, 'a'); assert.equal(sortedCalls, 0);
});

test('demand indexes preserve every eager public logic result and ordering', async () => {
    const { readFileSync } = await import('node:fs');
    const ts = await import('typescript');
    const current = await import('../dist/query/logic-model.js');
    const original = readFileSync(new URL('./fixtures/logic-eager-original.txt', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(original, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } }).outputText.replace('../core/logic-policy.js', new URL('../dist/core/logic-policy.js', import.meta.url).href);
    const eager = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    const makeNode = (id, category, path = 'src/main.ts') => ({ id, kind: 'function', name: id, sources: [{ ...source, path }], attributes: { module: 'module:main', ...(category ? { entrypoints: [{ category, rule: 'fixture', source }] } : {}) } });
    const edge = (id, from, to, resolution = 'exact') => ({ id, kind: 'calls', source: from, target: to, directed: true, attributes: { resolution }, sources: [source] });
    const nodes = [makeNode('main', 'executable'), makeNode('api', 'public-api'), makeNode('server', 'server'), makeNode('worker'), makeNode('example', 'executable', 'examples/main.ts'), makeNode('test', 'executable', 'tests/main.ts'), { id: 'package', kind: 'package', attributes: { memberIds: ['module:main', 'worker', 'worker'] }, sources: [source] }];
    const edges = [edge('mw', 'main', 'worker'), edge('wa', 'worker', 'api'), edge('am', 'api', 'main'), edge('ms', 'main', 'server', 'estimated'), edge('unknown', 'main', 'api', 'unresolved'), edge('missing', 'main', 'absent'), { id: 'member', kind: 'contains', source: 'package', target: 'server', directed: true }];
    for (const graph of [{ nodes, edges }, { nodes: [...nodes].reverse(), edges: [...edges].reverse() }]) {
        for (const name of ['logicOverviewMetadata', 'rankedLogicFunctions', 'logicNodes']) assert.deepEqual(current[name](graph), eager[name](graph), name);
        for (const options of [{}, { offset: 1, limit: 1 }, { offset: 999, limit: 3 }]) assert.deepEqual(current.logicEntrypoints(graph, options), eager.logicEntrypoints(graph, options));
        for (const includeEstimated of [false, true]) for (const id of ['main', 'api', 'server', 'absent']) {
            for (const direction of ['in', 'out', 'both']) for (const offset of [0, 1]) {
                const options = { id, direction, offset, limit: 1, includeEstimated };
                assert.deepEqual(current.logicCalls(graph, options), eager.logicCalls(graph, options));
            }
            for (const limits of [{}, { depth: 0 }, { depth: 1 }, { maxNodes: 1 }, { maxEdges: 1 }]) {
                const options = { id, includeEstimated, ...limits };
                assert.deepEqual(current.logicFlow(graph, options), eager.logicFlow(graph, options));
            }
        }
    }
    for (const id of ['main', 'a/한글', '']) assert.equal(current.logicLookupBucket(id), eager.logicLookupBucket(id));
});
