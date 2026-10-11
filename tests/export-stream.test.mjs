import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { thinGraph, writeThinGraph } from '../bin/export-evidence.mjs';
import { writeJson } from '../bin/export-json.mjs';

test('streaming JSON preserves ordinary serialization without a complete payload string', () => {
    const value = { text: '한글 😀\n"', optional: undefined, nested: [null, true, { x: 4 }], many: Array.from({ length: 10000 }, (_, i) => ({ id: i, text: 'x'.repeat(100) })) };
    const chunks = []; writeJson(value, chunk => chunks.push(chunk));
    assert.equal(chunks.join(''), JSON.stringify(value));
    assert.ok(chunks.every(chunk => chunk.length < 131072));
    assert.ok(chunks.length > 10);
});
test('streaming thin export matches legacy descriptors and ordered evidence exactly', () => {
    const source = i => ({ path: 'src/file.ts', line: i + 1, contentHash: 'a'.repeat(64) });
    const graph = { schemaVersion: 1, hash: 'b'.repeat(64), repository: { name: 'repo', sourceFingerprint: 'c'.repeat(64), dirty: false }, nodes: [], edges: [{ id: '__proto__', kind: 'imports', source: 'a', target: 'b', directed: true, sources: Array.from({ length: 300 }, (_, i) => source(i)) }], facets: [], findings: [], views: [] };
    const original = JSON.stringify(graph), expectedFiles = new Map(), files = new Map(), chunks = [];
    const expected = thinGraph(graph, (path, text) => expectedFiles.set(path, text));
    writeThinGraph(graph, (path, text) => files.set(path, text), chunk => chunks.push(chunk));
    assert.deepEqual(JSON.parse(chunks.join('')), expected);
    assert.deepEqual(files, expectedFiles);
    assert.equal(JSON.stringify(graph), original);
    const groupId = expected.evidence.records.edges.__proto__;
    assert.equal(groupId, createHash('sha256').update(JSON.stringify(graph.edges[0].sources)).digest('hex'));
});
