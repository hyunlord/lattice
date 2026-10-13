import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';
import { interpretationContext, writeInterpretation, readInterpretations } from '../bin/interpretation.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-claims-')));
    execFileSync('git', ['init', '-q', root]);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'export function read() {\n    return 1;\n}\n');
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const graph = buildRepository({ root }).graph;
    const target = interpretationContext(root, graph).items.find(item => item.id === 'module:src/a.ts');
    const citation = { path: target.sources[0].path, contentHash: target.sources[0].contentHash, startLine: 1, endLine: 3, excerpt: 'export function read() {\n    return 1;\n}' };
    const record = { schemaVersion: 1, targetId: target.id, summary: 'Legacy text must not reach the first screen.', author: 'fixture', sources: target.sources, claims: [{ text: 'Exports a read function.', citations: [citation] }] };
    return { root, graph, record, citation };
}
test('individually cited claims are exposed separately from legacy prose', t => {
    const { root, graph, record } = fixture(t);
    const saved = writeInterpretation(root, graph, record);
    assert.deepEqual(saved.validatedClaims, record.claims);
    assert.deepEqual(readInterpretations(root, graph)[0].validatedClaims, record.claims);
    assert.equal(saved.label, 'AI 요약');
});
test('legacy summaries and uncited claims never become validated first-screen claims', t => {
    const { root, graph, record } = fixture(t);
    const { claims, ...legacy } = record;
    assert.deepEqual(writeInterpretation(root, graph, legacy).validatedClaims, []);
    assert.throws(() => writeInterpretation(root, graph, { ...record, claims: [{ text: 'Invented role.', citations: [] }] }), /citation/i);
});
for (const [name, changes] of [
    ['unknown path', { path: 'src/unknown.ts' }], ['wrong hash', { contentHash: 'a'.repeat(64) }],
    ['out-of-range line', { endLine: 100 }], ['wrong excerpt', { excerpt: 'Invented source text' }],
    ['unknown node', { nodeId: 'missing-node' }], ['unknown edge', { edgeId: 'missing-edge' }],
    ['inverted range', { startLine: 3, endLine: 1 }], ['traversal', { path: '../secret' }],
]) test(`rejects ${name} citation before persisting`, t => {
    const { root, graph, record, citation } = fixture(t);
    assert.throws(() => writeInterpretation(root, graph, { ...record, claims: [{ text: 'Exports read.', citations: [{ ...citation, ...changes }] }] }), /citation/i);
    assert.deepEqual(readInterpretations(root, graph), []);
});
test('claims disappear after an unrebuilt source edit and after graph rebuild', t => {
    const { root, graph, record } = fixture(t);
    writeInterpretation(root, graph, record);
    writeFileSync(join(root, 'src/a.ts'), 'export const changed = true;\n');
    assert.deepEqual(readInterpretations(root, graph)[0].validatedClaims, []);
    const rebuilt = buildRepository({ root }).graph;
    const stale = readInterpretations(root, rebuilt)[0];
    assert.equal(stale.status, 'stale');
    assert.deepEqual(stale.validatedClaims, []);
});
test('tampered persisted citations fall back while preserving detail evidence', t => {
    const { root, graph, record } = fixture(t);
    const saved = writeInterpretation(root, graph, record);
    const path = join(root, saved.notePath);
    const stored = JSON.parse(readFileSync(path, 'utf8'));
    stored.claims[0].citations[0].excerpt = 'made up';
    writeFileSync(path, JSON.stringify(stored));
    assert.deepEqual(readInterpretations(root, graph)[0].validatedClaims, []);
    assert.equal(readInterpretations(root, graph)[0].summary, record.summary);
});
test('compact context supplies hashes and exact citation ranges without breaking source-set tokens', t => {
    const { root, graph, record } = fixture(t);
    const target = interpretationContext(root, graph, 0, 50, { compact: true }).items.find(item => item.id === record.targetId);
    const source = target.evidence[0];
    assert.equal(source.contentHash, record.sources[0].contentHash);
    assert.equal(source.startLine, 1);
    assert.ok(source.endLine >= source.startLine);
    const { sources, ...base } = record;
    assert.equal(writeInterpretation(root, graph, { ...base, sourceSetToken: target.sourceSetToken }).validatedClaims.length, 1);
});
test('a real source line outside the supplied excerpt cannot serve as a claim citation', t => {
    const { root } = fixture(t);
    const text = Array.from({ length: 50 }, (_, index) => `export const n${index} = ${index};`).join('\n');
    writeFileSync(join(root, 'src/a.ts'), text);
    const graph = buildRepository({ root }).graph;
    const target = interpretationContext(root, graph).items.find(item => item.id === 'module:src/a.ts');
    const record = { schemaVersion: 1, targetId: target.id, summary: 'Exports n45.', author: 'fixture', sources: target.sources, claims: [{ text: 'Exports n45.', citations: [{ path: 'src/a.ts', contentHash: target.sources[0].contentHash, startLine: 46, endLine: 46, excerpt: 'export const n45 = 45;' }] }] };
    assert.throws(() => writeInterpretation(root, graph, record), /citation/i);
});
test('compact source-set tokens cannot cite unsupplied paths or unsupplied excerpt tails', t => {
    const { root } = fixture(t);
    for (let index = 0; index < 5; index++) writeFileSync(join(root, `src/n${index}.ts`), `export const n${index} = ${index};`);
    const graph = buildRepository({ root }).graph;
    const target = interpretationContext(root, graph, 0, 50, { compact: true }).items.find(item => item.id === 'folder:src');
    const input = graph.inputs.find(input => input.path === 'src/n4.ts');
    const record = { schemaVersion: 1, targetId: target.id, summary: 'Exports n4.', author: 'fixture', sourceSetToken: target.sourceSetToken, claims: [{ text: 'Exports n4.', citations: [{ path: input.path, contentHash: input.contentHash, startLine: 1, endLine: 1, excerpt: 'export const n4 = 4;' }] }] };
    assert.throws(() => writeInterpretation(root, graph, record), /compact context/i);
});
test('claims transport preserves individual evidence URLs and excludes stale or legacy records', async t => {
    const { root, graph, record } = fixture(t);
    const { parseClaimInterpretations } = await import('../dist/interpretation/model.js');
    const saved = writeInterpretation(root, graph, record);
    const url = 'https://github.com/example/repo/blob/commit/src/a.ts#L1-L3';
    const visible = { ...saved, validatedClaims: saved.validatedClaims.map(claim => ({ ...claim, citations: claim.citations.map(citation => ({ ...citation, url })) })) };
    const parsed = parseClaimInterpretations([visible]);
    assert.equal(parsed[0].validatedClaims[0].citations[0].url, url);
    assert.deepEqual(parseClaimInterpretations([{ ...visible, status: 'stale' }]), []);
    assert.deepEqual(parseClaimInterpretations([record]), []);
});
test('supplied read-only source reader validates claims without refreshing the working repository', t => {
    const { root, graph, record } = fixture(t);
    writeInterpretation(root, graph, record);
    const paths = [];
    const sourceReader = { name: 'safe-source', dirty: false, paths: ['src/a.ts'], readText(path) { paths.push(path); return 'export const changed = true;\n'; } };
    const notes = readInterpretations(root, graph, undefined, sourceReader);
    assert.deepEqual(paths, ['src/a.ts']);
    assert.deepEqual(notes[0].validatedClaims, []);
});
