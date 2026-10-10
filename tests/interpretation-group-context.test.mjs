import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';
import { interpretationContext, writeInterpretation, readInterpretations } from '../bin/interpretation.mjs';

test('group context tokens bind exact member sources and reject old or partial evidence', t => {
    // Given a real repository with an import cycle and a separate unrelated folder.
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-group-notes-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    for (const part of ['a', 'b', 'other']) mkdirSync(join(root, 'src', part), { recursive: true });
    writeFileSync(join(root, 'src/a/index.ts'), 'import "../b/index"; export const a = 1;');
    writeFileSync(join(root, 'src/b/index.ts'), 'import "../a/index"; export const b = 1;');
    writeFileSync(join(root, 'src/other/index.ts'), 'export const other = 1;');
    const initial = buildRepository({ root }).graph;
    // When the existing compact context and writer are used for the group.
    const context = interpretationContext(root, initial, 0, 9, { scope: 'overview', compact: true });
    const target = context.items[0];
    assert.ok(target.group);
    assert.equal(target.sourceCount, 2);
    assert.ok(target.group.memberTargetIds.every(id => context.items.some(item => item.id === id)));
    const record = { schemaVersion: 1, targetId: target.id, sourceSetToken: target.sourceSetToken, summary: '두 폴더가 서로의 변환 기능을 사용합니다.', author: 'test-agent' };
    const saved = writeInterpretation(root, initial, record);
    // Then full source coverage is written, while partial and changed memberships fail closed.
    assert.deepEqual(saved.sources.map(source => source.path), ['src/a/index.ts', 'src/b/index.ts']);
    const { sourceSetToken: _token, ...explicit } = record;
    assert.throws(() => writeInterpretation(root, initial, { ...explicit, sources: saved.sources.slice(0, 1) }), /Sources or target changed/);
    writeFileSync(join(root, 'src/a/more.ts'), 'export const additional = 1;');
    const changed = buildRepository({ root }).graph;
    assert.throws(() => writeInterpretation(root, changed, record), /changed/);
    assert.equal(readInterpretations(root, changed).find(note => note.targetId === target.id).status, 'stale');
});
