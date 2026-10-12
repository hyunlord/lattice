import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync, readFileSync, renameSync } from 'node:fs';
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
    const call = createMcpHandler({ root }); t.after(() => call.dispose());
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
    const call = createMcpHandler({ root }); t.after(() => call.dispose());
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

test('compact overview context is bounded and tokens preserve full source provenance', async t => {
    const { root } = fixture(t);
    for (let index = 0; index < 30; index++) writeFileSync(join(root, `src/extra${index}.ts`), `/** ${'Long documentation. '.repeat(200)} */\nexport const extra${index} = 1;`);
    const graph = buildRepository({ root }).graph;
    const context = interpretationContext(root, graph, 0, 9, { scope: 'overview', compact: true });
    assert.ok(context.items.length > 0 && context.items.length <= 9);
    assert.ok(JSON.stringify(context).length < 15000);
    const target = context.items.find(target => target.sourceCount >= 30);
    assert.ok(target);
    assert.equal(target.sources, undefined);
    assert.ok(target.evidence.length <= 3);
    assert.ok(target.evidence.every(source => source.excerpt.length <= 600));
    const record = { schemaVersion: 1, targetId: target.id, summary: '자료를 읽고 쓰는 기능입니다.', author: 'test-agent', sourceSetToken: target.sourceSetToken };
    const saved = writeInterpretation(root, graph, record);
    assert.equal(saved.sources.length, target.sourceCount);
    assert.equal(readInterpretations(root, graph).find(note => note.targetId === target.id).status, 'fresh');
    assert.throws(() => writeInterpretation(root, graph, { ...record, sources: saved.sources }), /exactly one/);
    assert.throws(() => writeInterpretation(root, graph, { ...record, sourceSetToken: '0'.repeat(64) }), /changed|token/i);
    writeFileSync(join(root, 'src/a.ts'), 'export const changed = true;');
    assert.throws(() => writeInterpretation(root, graph, record), /Source changed/);
    const next = buildRepository({ root }).graph;
    assert.throws(() => writeInterpretation(root, next, record), /changed|token/i);
    assert.equal(readInterpretations(root, next).find(note => note.targetId === target.id).status, 'stale');
});

test('MCP exposes bounded overview and folder scopes with compact write acknowledgements', async t => {
    const { root } = fixture(t);
    const { createMcpHandler } = await import('../bin/mcp.mjs');
    const { parseArguments } = await import('../bin/mcp-schema.mjs');
    const call = createMcpHandler({ root }); t.after(() => call.dispose());
    const args = parseArguments('lattice_interpretation_context', { scope: 'overview', compact: true, limit: 9 });
    const context = await call('lattice_interpretation_context', args);
    const target = context.items[0];
    const saved = await call('lattice_write_interpretation', { record: { schemaVersion: 1, targetId: target.id, summary: '파일을 읽고 쓰는 기능입니다.', author: 'test-agent', sourceSetToken: target.sourceSetToken } });
    assert.equal(saved.sources, undefined);
    assert.equal(saved.sourceCount, target.sourceCount);
    assert.equal(saved.status, 'fresh');
    const folders = await call('lattice_interpretation_context', parseArguments('lattice_interpretation_context', { scope: 'folders', compact: true }));
    assert.ok(folders.items.every(target => target.kind === 'cluster'));
    assert.throws(() => parseArguments('lattice_interpretation_context', { scope: 'bogus' }), /expected/);
    assert.throws(() => parseArguments('lattice_interpretation_context', { compact: 'yes' }), /boolean/);
});


test('overview tokens invalidate complete membership additions removals and renamed paths', t => {
    const { root } = fixture(t);
    const initial = buildRepository({ root }).graph;
    const target = interpretationContext(root, initial, 0, 9, { scope: 'overview', compact: true }).items[0];
    const record = { schemaVersion: 1, targetId: target.id, summary: 'Provides value access.', author: 'test-agent', sourceSetToken: target.sourceSetToken };
    writeInterpretation(root, initial, record);
    writeFileSync(join(root, 'src/c.ts'), 'export const added = 1;');
    assert.throws(() => writeInterpretation(root, buildRepository({ root }).graph, record), /changed/);
    rmSync(join(root, 'src/c.ts'));
    rmSync(join(root, 'src/b.ts'));
    assert.throws(() => writeInterpretation(root, buildRepository({ root }).graph, record), /changed/);
    renameSync(join(root, 'src/a.ts'), join(root, 'src/renamed.ts'));
    const next = buildRepository({ root }).graph;
    assert.throws(() => writeInterpretation(root, next, record), /changed/);
    assert.equal(readInterpretations(root, next).find(note => note.targetId === target.id).status, 'stale');
});

test('production and all-code overview tokens never cross scopes', t => {
    const { root } = fixture(t);
    writeFileSync(join(root, 'src/a.test.ts'), 'import {read} from "./a"; read();');
    const graph = buildRepository({ root }).graph;
    const production = interpretationContext(root, graph, 0, 9, { scope: 'overview', compact: true }).items[0];
    const all = interpretationContext(root, graph, 0, 9, { scope: 'overview', overviewScope: 'all', compact: true }).items[0];
    assert.ok(production.id.startsWith('overview:production:'));
    assert.ok(all.id.startsWith('overview:all:'));
    assert.notEqual(production.sourceSetToken, all.sourceSetToken);
    assert.ok(all.sourceCount > production.sourceCount);
    assert.throws(() => writeInterpretation(root, graph, { schemaVersion: 1, targetId: all.id, summary: 'Mis-scoped summary.', author: 'test-agent', sourceSetToken: production.sourceSetToken }), /token/);
});

test('explicit source evidence requires the exact target line and old mismatched notes are stale', async t => {
    const { root, graph } = fixture(t);
    const target = interpretationContext(root, graph).items.find(target => target.kind === 'module');
    const valid = note(target);
    const wrongLine = { ...valid, sources: valid.sources.map(source => ({ ...source, line: source.line + 100 })) };
    assert.throws(() => writeInterpretation(root, graph, wrongLine), /Sources or target changed/);
    assert.deepEqual(readInterpretations(root, graph), []);
    const { interpretationStatus } = await import('../dist/interpretation/model.js');
    assert.equal(interpretationStatus(wrongLine, graph), 'stale');
    assert.equal(writeInterpretation(root, graph, valid).status, 'fresh');
});

test('AI evidence links verify each committed source despite unrelated dirty initialization files', t => {
    const { root } = fixture(t);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('remote', 'add', 'origin', 'https://github.com/example/evidence.git');
    git('add', 'src');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Record sources');
    const commit = git('rev-parse', 'HEAD');
    writeFileSync(join(root, 'AGENTS.md'), '# Generated setup\n');
    const graph = buildRepository({ root }).graph;
    assert.equal(graph.repository.dirty, true);
    const target = interpretationContext(root, graph).items.find(target => target.id === 'module:src/a.ts');
    writeInterpretation(root, graph, note(target));
    const saved = readInterpretations(root, graph)[0];
    assert.equal(saved.sources[0].url, `https://github.com/example/evidence/blob/${commit}/src/a.ts#L1`);
    writeFileSync(join(root, 'src/a.ts'), 'export const changed = true;');
    const changed = buildRepository({ root }).graph;
    const changedTarget = interpretationContext(root, changed).items.find(value => value.id === target.id);
    writeInterpretation(root, changed, note(changedTarget));
    assert.equal(readInterpretations(root, changed)[0].sources[0].url, undefined);
});

test('stale note hashes cannot inherit a current source permalink by path alone', t => {
    const { root } = fixture(t);
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('remote', 'add', 'origin', 'https://github.com/example/evidence.git');
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    git('add', 'src', '.gitignore');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Record sources');
    const graph = buildRepository({ root }).graph;
    const target = interpretationContext(root, graph).items.find(target => target.id === 'module:src/a.ts');
    writeInterpretation(root, graph, note(target));
    writeFileSync(join(root, 'src/a.ts'), 'export const next = true;');
    git('add', 'src/a.ts');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Change source');
    const changed = buildRepository({ root }).graph;
    assert.equal(changed.repository.dirty, false);
    const stale = readInterpretations(root, changed)[0];
    assert.equal(stale.status, 'stale');
    assert.equal(stale.sources[0].url, undefined);
});
test('overview context includes exact visible flat-folder files with independently bound module notes', async t => {
    const { root } = fixture(t);
    for (const name of ['c', 'd']) writeFileSync(join(root, `src/${name}.ts`), `export function ${name}() { return 1; }\n`);
    const graph = buildRepository({ root }).graph;
    const { buildStructuralOverview } = await import('../dist/query/structural-map-model.js');
    const map = buildStructuralOverview(graph.nodes, graph.edges);
    const visible = map.stages.find(stage => stage.id === map.rootStageIds[0]).filePreviews.map(file => file.id);
    const context = interpretationContext(root, graph, 0, 1, { scope: 'overview', compact: true });
    assert.equal(context.items.length, 1);
    const files = context.items[0].visibleFiles;
    assert.deepEqual(files.map(file => file.id), visible);
    assert.equal(files.length, 3);
    assert.ok(files.every(file => file.kind === 'module' && file.sourceCount === 1 && file.evidence.length === 1 && file.evidence[0].excerpt.length <= 600));
    const target = files[0];
    writeInterpretation(root, graph, { schemaVersion: 1, targetId: target.id, sourceSetToken: target.sourceSetToken, summary: '호출된 작업을 실행하고 결과를 반환합니다.', author: 'test-agent' });
    const updated = interpretationContext(root, graph, 0, 1, { scope: 'overview', compact: true });
    assert.equal(updated.items[0].visibleFiles[0].interpretation.status, 'fresh');
    assert.equal(updated.total, context.total, 'File previews do not alter folder pagination');
    writeFileSync(join(root, target.samplePaths[0]), 'export const changed = 2;\n');
    assert.equal(readInterpretations(root, buildRepository({ root }).graph)[0].status, 'stale');
});
