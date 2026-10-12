import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync, rmSync, statSync, utimesSync, unlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { observeRepositoryAsync } from '../bin/observation.mjs';
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-selection-reuse-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    git(root, 'init', '-q');
    writeFileSync(join(root, 'a.ts'), 'export const value = 1;');
    writeFileSync(join(root, 'b.ts'), 'export const other = 1;');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    return { root, options: { root, noLens: true } };
}
test('unchanged selected inputs reuse wrappers without sharing observation arrays', async t => {
    const { options } = fixture(t);
    const first = await observeRepositoryAsync(options), second = await observeRepositoryAsync(options);
    assert.notStrictEqual(second.selected, first.selected);
    assert.equal(second.fingerprint, first.fingerprint);
    assert(first.selected.some(selected => selected.path === 'a.ts'));
    let reused = 0;
    for (let index = 0; index < first.selected.length; index++) {
        if (first.selected[index].input === second.selected[index].input) {
            assert.strictEqual(second.selected[index], first.selected[index]);
            reused++;
        } else assert.notStrictEqual(second.selected[index], first.selected[index]);
    }
    assert(reused > 0, 'At least one unchanged source must exercise wrapper reuse');
});
test('same-size restored-mtime edits replace selected content and preserve cold parity', async t => {
    const { root, options } = fixture(t), path = join(root, 'a.ts');
    const first = await observeRepositoryAsync(options), stat = statSync(path);
    writeFileSync(path, 'export const value = 2;'); utimesSync(path, stat.atime, stat.mtime);
    const changed = await observeRepositoryAsync(options);
    assert.notStrictEqual(changed.selected.find(x => x.path === 'a.ts'), first.selected.find(x => x.path === 'a.ts'));
    assert.match(changed.selected.find(x => x.path === 'a.ts').input.text, /2/);
    assert.equal(changed.fingerprint, (await observeRepositoryAsync({ ...options })).fingerprint);
});
test('selection plans invalidate on added, renamed and missing paths', async t => {
    const { root, options } = fixture(t);
    await observeRepositoryAsync(options);
    for (const change of [
        () => writeFileSync(join(root, '0.ts'), 'export const added = 1;'),
        () => git(root, 'mv', 'a.ts', 'z.ts'),
        () => unlinkSync(join(root, 'b.ts')),
    ]) {
        change();
        const observed = await observeRepositoryAsync(options), cold = await observeRepositoryAsync({ ...options });
        assert.deepEqual(observed.selected, cold.selected);
        assert.equal(observed.fingerprint, cold.fingerprint);
    }
});

test('lens changes replace the selection plan without reusing prior wrappers', async t => {
    const { root } = fixture(t), directory = join(root, '.lattice');
    mkdirSync(directory);
    const path = join(directory, 'lens.json'), options = { root };
    const writeLens = name => writeFileSync(path, JSON.stringify({ schemaVersion: 1, name, kinds: [] }));
    writeLens('First');
    const first = await observeRepositoryAsync(options);
    writeLens('Second');
    const second = await observeRepositoryAsync(options), cold = await observeRepositoryAsync({ ...options });
    assert.equal(second.lens.name, 'Second');
    assert.deepEqual(second.selected, cold.selected);
    assert.equal(second.fingerprint, cold.fingerprint);
    for (const selected of second.selected) assert(!first.selected.includes(selected));
});
