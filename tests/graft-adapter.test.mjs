import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { importGraft, graftAdapterVersion } from '../dist/index.js';

const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const code = input('src/run.ts', 'export function run() {\n  return 1;\n}\n');
function fixture() {
    const file = { id: code.path, name: 'run.ts', kind: 'file', path: code.path, span: 'L1-L4', signature: null, exported: true, origin: 'ast', body_hash: code.contentHash };
    return { meta: { version: 1, nodeCount: 2, edgeCount: 2, languages: ['typescript'] }, nodes: [file, { ...file, id: 'src/run.ts#run', name: 'run', kind: 'function', span: 'L1-L3', signature: 'function run()', summary: 'Ignored model prose', crux: { text: 'Ignored' } }], edges: [{ source: code.path, target: 'src/run.ts#run', relation: 'contains', confidence: 'extracted' }, { source: code.path, target: 'external-library', relation: 'imports', confidence: 'extracted' }] };
}
const graphInput = graph => input('graft/.graph/wiring.json', JSON.stringify(graph, null, 2));

test('imports current symbols with definition and exact JSON provenance', () => {
    const graph = graphInput(fixture());
    const result = importGraft(graph, [code]);
    assert.equal(graftAdapterVersion, 'wiring-v1');
    assert.deepEqual(result.coveredPaths, [code.path]);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].id, 'graft:src/run.ts#run');
    assert.equal(result.nodes[0].attributes.summary, undefined);
    assert.equal(result.nodes[0].attributes.crux, undefined);
    assert.deepEqual(result.nodes[0].sources[0], { path: code.path, pointer: '/graft/src~1run.ts#run', line: 1, endLine: 3, contentHash: code.contentHash });
    assert.equal(result.nodes[0].sources[1].pointer, '/nodes/1');
    assert.equal(graph.text.split('\n')[result.nodes[0].sources[1].line - 1].trim(), '{');
    assert.equal(result.edges[0].source, 'module:src/run.ts');
    assert.equal(result.edges[0].target, result.nodes[0].id);
    assert.equal(result.edges[0].sources[1].pointer, '/edges/0');
    assert.equal(result.edges[0].attributes.evidence, 'definition');
    assert.equal(result.diagnostics[0].code, 'graft-unresolved');
});

test('stale or missing file hashes omit imported symbols for standalone fallback', () => {
    const stale = importGraft(graphInput(fixture()), [input(code.path, 'changed')]);
    const missing = fixture();
    missing.nodes.shift();
    missing.meta.nodeCount--;
    missing.edges = [];
    missing.meta.edgeCount = 0;
    for (const result of [stale, importGraft(graphInput(missing), [code])]) {
        assert.deepEqual(result.nodes, []);
        assert.deepEqual(result.coveredPaths, []);
        assert.equal(result.diagnostics[0].code, 'graft-stale');
    }
});

test('optional malformed and unsupported wiring falls back with a diagnostic', () => {
    const unsupported = fixture();
    unsupported.meta.version = 2;
    const countMismatch = fixture();
    countMismatch.meta.nodeCount = 4;
    for (const graph of [input('graft/.graph/wiring.json', '{ broken'), graphInput(unsupported), graphInput(countMismatch)]) {
        const result = importGraft(graph, [code]);
        assert.deepEqual(result.nodes, []);
        assert.deepEqual(result.edges, []);
        assert.equal(result.diagnostics[0].code, 'graft-invalid');
    }
});
