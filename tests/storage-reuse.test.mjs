import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { realpathSync, mkdtempSync, rmSync, writeFileSync, readFileSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRepository } from '../bin/build.mjs';
import { digest, readGraph, readSnapshots, atomic, persistBuild } from '../bin/storage.mjs';
test('incremental digest preserves canonical UTF-8 bytes without concatenating the document', () => {
    const chunks = ['{"label":', '"한글😀",', '"values":[1,true,null]}'];
    assert.equal(digest.stream(write => { for (const chunk of chunks) write(chunk); }), digest(chunks.join('')));
    assert.equal(digest.stream(() => { }), digest(''));
});
test('validated immutable graph is reused only while complete file bytes match', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-storage-reuse-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, 'data.json'), JSON.stringify(Array.from({ length: 1024 }, (_, index) => ({ id: `node-${index}`, name: `한글😀Alpha${index}`, description: '한글😀'.repeat(24) }))));
    const build = buildRepository({ root });
    const graph = build.graph, path = join(root, 'graph.json');
    const persisted = persistBuild(root, build);
    assert.equal(readFileSync(join(root, '.lattice/cache/graph.json'), 'utf8'), JSON.stringify(persisted) + '\n');
    const beforeRepeat = statSync(join(root, '.lattice/cache/graph.json')).mtimeMs;
    const repeated = persistBuild(root, build);
    assert.equal(readFileSync(join(root, '.lattice/cache/graph.json'), 'utf8'), JSON.stringify(repeated) + '\n');
    assert.equal(statSync(join(root, '.lattice/cache/graph.json')).mtimeMs, beforeRepeat);
    atomic(path, graph);
    const first = readGraph(path);
    assert.equal(readGraph(path), first);
    const uncached = readGraph(path, { memoize: false });
    assert.notEqual(uncached, first);
    assert.deepEqual(uncached, first);
    const stat = statSync(path);
    writeFileSync(path, readFileSync(path, 'utf8').replace('Alpha', 'Omega'));
    utimesSync(path, stat.atime, stat.mtime);
    assert.throws(() => readGraph(path), /hash mismatch/u);
});

test('bulk snapshot visits validate provenance before exposing each graph', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-snapshot-visit-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    writeFileSync(join(root, 'data.json'), '[{"id":"one"}]');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    const graph = persistBuild(root, buildRepository({ root })), cache = join(root, '.lattice/cache');
    const seen = [];
    const catalog = readSnapshots(cache, { memoize: false, onGraph(snapshot, value) { seen.push([snapshot.id, value.hash]); } });
    assert.deepEqual(seen, [[catalog[0].id, graph.hash]]);
    atomic(join(cache, 'snapshots.json'), [{ ...catalog[0], graphHash: '0'.repeat(64) }]);
    let visited = false;
    assert.throws(() => readSnapshots(cache, { memoize: false, onGraph() { visited = true; } }), /Snapshot metadata mismatch/u);
    assert.equal(visited, false);
});

test('historical builds reuse immutable inputs but refresh current-lens projections', async t => {
    const { compareRepository } = await import('../bin/history.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-history-reuse-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    writeFileSync(join(root, 'data.json'), '[{"id":"one","name":"한글😀Alpha"}]');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    const options = { root };
    const first = compareRepository(options, 'HEAD');
    assert.equal(compareRepository(options, 'HEAD').before, first.before);
    const lens = join(root, '.lattice', 'lens.json');
    writeFileSync(lens, JSON.stringify({ schemaVersion: 1, name: 'Lens', kinds: [{ id: 'thing', label: 'Things', files: ['data.json'] }] }));
    const projected = compareRepository(options, 'HEAD');
    assert.notEqual(projected.before.hash, first.before.hash);
    assert.equal(projected.difference.before.coverage, 'current-lens-projection');
    assert.equal(projected.before.nodes.find(node => node.id === 'one').kind, 'thing');
});

test('bulk persistence can avoid pinning current and historical graphs through WeakRefs', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-no-memo-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n'); writeFileSync(join(root, 'data.json'), '[{"id":"one"}]');
    execFileSync('git', ['-C', root, 'add', '.']); execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    const result = buildRepository({ root }); persistBuild(root, result);
    const Original = globalThis.WeakRef; let created = 0;
    globalThis.WeakRef = class extends Original { constructor(value) { super(value); created++; } };
    try { const graph = persistBuild(root, result, undefined, { memoize: false }); assert.equal(graph.hash, result.graph.hash); assert.equal(created, 0); }
    finally { globalThis.WeakRef = Original; }
    const cache = join(root, '.lattice/cache'), catalog = JSON.parse(readFileSync(join(cache, 'snapshots.json'), 'utf8'));
    atomic(join(cache, 'snapshots.json'), [{ ...catalog[0], graphHash: '0'.repeat(64) }]);
    assert.throws(() => persistBuild(root, result, undefined, { memoize: false }), /Snapshot metadata mismatch/u);
});

test('prepared history validates before the current build and rejects changed bytes without decoding a second graph', async t => {
    const { prepareSnapshots } = await import('../bin/storage.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-prepared-history-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    writeFileSync(join(root, 'data.json'), '[{"id":"historical-unique-marker"}]');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    persistBuild(root, buildRepository({ root }), undefined, { memoize: false });
    const cache = join(root, '.lattice/cache');
    const prepared = prepareSnapshots(cache);
    writeFileSync(join(root, 'data.json'), '[{"id":"current"}]');
    const result = buildRepository({ root });
    const parse = JSON.parse;
    JSON.parse = function (text, ...args) {
        if (typeof text === 'string' && text.includes('historical-unique-marker')) throw new Error('historical graph decoded during persistence');
        return parse(text, ...args);
    };
    try { assert.equal(persistBuild(root, result, undefined, { memoize: false, preparedSnapshots: prepared }).hash, result.graph.hash); }
    finally { JSON.parse = parse; }
    assert.throws(() => persistBuild(root, result, undefined, { preparedSnapshots: {} }), /Invalid prepared snapshot/u);
    const catalogPath = join(cache, 'snapshots.json'), catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const artifact = join(cache, catalog[0].artifactPath), original = readFileSync(artifact);
    writeFileSync(artifact, Buffer.concat([original, Buffer.from(' ')]));
    assert.throws(() => persistBuild(root, result, undefined, { preparedSnapshots: prepared }), /Snapshot artifacts changed/u);
    writeFileSync(artifact, original);
    writeFileSync(catalogPath, readFileSync(catalogPath, 'utf8') + ' ');
    assert.throws(() => persistBuild(root, result, undefined, { preparedSnapshots: prepared }), /Snapshot catalog changed/u);
});

test('streamed graph loading shares identical full evidence without erasing provenance', async t => {
    const { createGraph } = await import('../dist/index.js');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-storage-evidence-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const source = { path: 'input.ts', line: 1, pointer: '', contentHash: 'a'.repeat(64), revision: 'first', url: 'https://example.invalid/first' };
    const graph = createGraph({
        repository: { name: 'fixture', dirty: false, sourceFingerprint: 'b'.repeat(64) }, lensDigest: null, adapterVersions: {}, inputs: [], edges: [], facets: [], findings: [], views: [], snapshots: [], nodes: [
            { id: 'a', kind: 'module', name: 'A', attributes: {}, sources: [source] },
            { id: 'b', kind: 'module', name: 'B', attributes: {}, sources: [source] },
            { id: 'c', kind: 'module', name: 'C', attributes: {}, sources: [{ ...source, revision: 'second', url: 'https://example.invalid/second' }] },
        ]
    }, digest);
    const path = join(root, 'graph.json'); atomic(path, graph);
    const loaded = readGraph(path, { memoize: false });
    assert.deepEqual(loaded, graph);
    assert.equal(loaded.nodes[0].sources, loaded.nodes[1].sources);
    assert.notEqual(loaded.nodes[0].sources[0], loaded.nodes[2].sources[0]);
    assert.equal(loaded.nodes[2].sources[0].revision, 'second');
    const corrupted = JSON.parse(readFileSync(path, 'utf8')); corrupted.nodes[1].sources[0].line = 'invalid'; atomic(path, corrupted);
    assert.throws(() => readGraph(path, { memoize: false }), /finite number/);
});
