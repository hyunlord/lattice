import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';
import { readInterpretations, writeInterpretation, interpretationContext, writeDraftLens, readDraftStatus } from '../bin/interpretation.mjs';
import { runInterpretationCommand } from '../bin/interpretation-runner.mjs';
import { observeRepository } from '../bin/observation.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-notes-')));
    execFileSync('git', ['init', '-q', root]);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'export function read() { return 1; }\n');
    writeFileSync(join(root, 'src/b.ts'), 'export function write() { return 2; }\n');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    return { root, graph: buildRepository({ root }).graph };
}
function note(target) { return { schemaVersion: 1, targetId: target.id, summary: 'Reads the current value.', author: 'test-agent', sources: target.sources.map(({ path, contentHash, line }) => ({ path, contentHash, line })) }; }
test('source-bound notes stale on source edit and cluster additions; notes trigger observation refresh', t => {
    const { root, graph } = fixture(t);
    const before = observeRepository({ root }).fingerprint;
    const context = interpretationContext(root, graph);
    assert.equal(context.summaryLanguage, 'ko');
    const targets = context.items;
    for (const target of targets) writeInterpretation(root, graph, note(target));
    assert.notEqual(observeRepository({ root }).fingerprint, before);
    assert.ok(readInterpretations(root, graph).every(note => note.status === 'fresh'));
    writeFileSync(join(root, 'src/a.ts'), 'export function read() { return 3; }\n');
    assert.throws(() => writeInterpretation(root, graph, note(targets.find(target => target.id === 'module:src/a.ts'))), /changed/);
    const next = buildRepository({ root }).graph;
    const notes = readInterpretations(root, next);
    assert.equal(notes.find(note => note.targetId === 'module:src/a.ts').status, 'stale');
    assert.equal(notes.find(note => note.targetId === 'module:src/b.ts').status, 'fresh');
    assert.equal(notes.find(note => note.targetId === 'folder:src').status, 'stale');
    assert.throws(() => writeInterpretation(root, next, { ...note(targets[0]), sources: [{ path: '../secret', contentHash: 'a'.repeat(64) }] }), /path/);
});
test('external CI runner skips absent key and current targets, refreshes changed subset only', async t => {
    const { root, graph } = fixture(t);
    mkdirSync(join(root, '.lattice'), { recursive: true });
    const runner = join(root, '.lattice/runner.mjs');
    writeFileSync(runner, `let text='';for await(const c of process.stdin)text+=c;const {targets,summaryLanguage}=JSON.parse(text);if(summaryLanguage!=='ko')throw new Error('Viewer language missing');process.stdout.write(JSON.stringify(targets.map(t=>({schemaVersion:1,targetId:t.id,summary:'Fixture runner summary.',author:'fixture-external',sources:t.sources.map(({path,contentHash,line})=>({path,contentHash,line}))}))));`);
    delete process.env['LATTICE_TEST_KEY'];
    assert.equal((await runInterpretationCommand(root, graph, [process.execPath, runner], 'LATTICE_TEST_KEY')).updated, 0);
    process.env['LATTICE_TEST_KEY'] = 'fixture-only';
    t.after(() => delete process.env['LATTICE_TEST_KEY']);
    assert.equal((await runInterpretationCommand(root, graph, [process.execPath, runner], 'LATTICE_TEST_KEY')).updated, 3);
    assert.equal((await runInterpretationCommand(root, graph, [process.execPath, runner], 'LATTICE_TEST_KEY')).updated, 0);
    writeFileSync(join(root, 'src/a.ts'), 'export function read() { return 9; }\n');
    assert.equal((await runInterpretationCommand(root, buildRepository({ root }).graph, [process.execPath, runner], 'LATTICE_TEST_KEY')).updated, 2);
});
test('lens draft remains inactive, source-bound, refuses unreviewed replacement', t => {
    const { root, graph } = fixture(t);
    const yaml = 'schemaVersion: 1\nname: Draft\nkinds: []\n';
    const saved = writeDraftLens(root, graph, yaml);
    assert.equal(saved.active, false);
    assert.equal(readDraftStatus(root, graph).status, 'fresh');
    assert.throws(() => writeDraftLens(root, graph, yaml), /already exists/);
    writeDraftLens(root, graph, yaml, saved.contentHash);
    assert.ok(JSON.parse(readFileSync(join(root, '.lattice/lens.draft.sources.json'))).sources.length > 0);
    assert.equal(buildRepository({ root }).graph.lensDigest, null);
});
test('actual MCP handler writes, reads and invalidates AI notes without changing source', async t => {
    const { root } = fixture(t);
    const { createMcpHandler } = await import('../bin/mcp.mjs');
    const call = createMcpHandler({ root });
    const context = await call('lattice_interpretation_context', {});
    const record = note(context.items.find(target => target.id === 'module:src/a.ts'));
    const saved = await call('lattice_write_interpretation', { record });
    assert.equal(saved.label, 'AI 요약');
    const fresh = await call('lattice_interpretation_context', {});
    assert.equal(fresh.items.find(target => target.id === record.targetId).interpretation.status, 'fresh');
    writeFileSync(join(root, 'src/a.ts'), 'export function read() { return 5; }\n');
    const stale = await call('lattice_interpretation_context', {});
    assert.equal(stale.items.find(target => target.id === record.targetId).interpretation.status, 'stale');
});

test('external interpretation directory keeps source read-only while participating in freshness', t => {
    const { root, graph } = fixture(t);
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-external-notes-')));
    process.env['LATTICE_INTERPRETATION_DIR'] = directory;
    t.after(() => { delete process.env['LATTICE_INTERPRETATION_DIR']; rmSync(directory, { recursive: true, force: true }); });
    const before = observeRepository({ root }).fingerprint;
    const target = interpretationContext(root, graph).items[0];
    const saved = writeInterpretation(root, graph, note(target));
    assert.ok(readFileSync(join(directory, 'notes', saved.notePath.split('/').at(-1))).length);
    assert.notEqual(before, observeRepository({ root }).fingerprint);
    assert.equal(readInterpretations(root, graph)[0].status, 'fresh');
});
test('historical interpretation reads never project current or external notes into old revisions', t => {
    const { root, graph } = fixture(t);
    const target = interpretationContext(root, graph).items[0];
    writeInterpretation(root, graph, note(target));
    writeDraftLens(root, graph, 'schemaVersion: 1\nname: Current draft\nkinds: []\n');
    const historical = { name: 'past', dirty: false, paths: ['src/a.ts', 'src/b.ts'], readText() { return undefined; } };
    assert.deepEqual(readInterpretations(root, graph, historical), []);
    assert.equal(readDraftStatus(root, graph, historical), undefined);
    const record = note(target);
    const withNote = { ...historical, paths: ['.lattice/notes/past.json'], readText(path) { return path === '.lattice/notes/past.json' ? JSON.stringify({ ...record, summary: 'The past summary.' }) : undefined; } };
    assert.equal(readInterpretations(root, graph, withNote)[0].summary, 'The past summary.');
});

test('MCP accepts one batch of source-bound notes while keeping single-record compatibility', async t => {
    const { root, graph } = fixture(t);
    const records = interpretationContext(root, graph).items.map(note);
    const { createMcpHandler } = await import('../bin/mcp.mjs');
    const { parseArguments } = await import('../bin/mcp-schema.mjs');
    const call = createMcpHandler({ root });
    const saved = await call('lattice_write_interpretation', parseArguments('lattice_write_interpretation', { records }));
    assert.equal(saved.updated, records.length);
    assert.deepEqual(saved.records.map(record => record.targetId), records.map(record => record.targetId));
    assert.equal(readInterpretations(root, graph).length, records.length);
    assert.throws(() => parseArguments('lattice_write_interpretation', { records, record: records[0] }), /exactly one/);
    assert.throws(() => parseArguments('lattice_write_interpretation', { records: Array(501).fill(records[0]) }), /500/);
});

test('batch source race rejects all notes before the first write', async t => {
    const { root, graph } = fixture(t);
    const records = interpretationContext(root, graph).items.filter(target => target.kind === 'module').map(note);
    writeFileSync(join(root, 'src/b.ts'), 'export function write() { return 999; }\n');
    const { writeInterpretations } = await import('../bin/interpretation.mjs');
    assert.throws(() => writeInterpretations(root, graph, records), /Source changed/);
    assert.deepEqual(readInterpretations(root, graph), []);
});
