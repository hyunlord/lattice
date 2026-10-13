import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, unlinkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { workingRepository, workingRepositoryAsync } from '../bin/repository.mjs';
const git = (root, ...args) => cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
test('working inventory matches Git for rename records, ignored files, cache scopes and linked worktrees', async t => {
    const parent = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-git-inventory-'))), root = join(parent, 'repo');
    t.after(() => rmSync(parent, { recursive: true, force: true })); mkdirSync(root); git(root, 'init', '-q');
    for (const name of ['? original.ts', 'deleted.ts', 'ignored.ts', 'ordinary.ts']) writeFileSync(join(root, name), 'export const value = 1;\n');
    git(root, 'add', '.'); git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    git(root, 'mv', '? original.ts', 'renamed.ts'); unlinkSync(join(root, 'deleted.ts'));
    writeFileSync(join(root, '.gitignore'), 'ignored*\n'); writeFileSync(join(root, 'ignored-new.ts'), 'ignore');
    for (const name of ['? loose.ts', 'space name.ts', 'line\nbreak.ts']) writeFileSync(join(root, name), 'new');
    symlinkSync('ordinary.ts', join(root, 'link.ts'));
    for (const directory of ['.lattice/cache', '.lattice/site', 'custom cache']) { mkdirSync(join(root, directory), { recursive: true }); writeFileSync(join(root, directory, 'generated.ts'), 'generated'); }
    async function check(at, cache) {
        const excluded = cache ? 'custom cache' : undefined;
        const oracle = [...new Set(git(at, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(path => path && (!excluded || (path !== excluded && !path.startsWith(excluded + '/')))))].sort();
        const sync = workingRepository(at, cache), async = await workingRepositoryAsync(at, cache);
        assert.deepEqual(sync.paths, oracle); assert.deepEqual(async.paths, oracle); assert.equal(sync.commit, async.commit); assert.equal(sync.dirty, async.dirty);
        assert(!sync.paths.includes('original.ts'), 'rename secondary field must not masquerade as an untracked path');
    }
    await check(root); await check(root, join(root, 'custom cache'));
    const linked = join(parent, 'linked'); git(root, 'worktree', 'add', '-q', '--detach', linked, 'HEAD'); writeFileSync(join(linked, 'untracked.ts'), 'new'); await check(linked);
    const calls = [], original = cp.execFileSync;
    cp.execFileSync = (...args) => { calls.push(args[1]); return original(...args); }; syncBuiltinESMExports();
    try { workingRepository(root); } finally { cp.execFileSync = original; syncBuiltinESMExports(); }
    assert(calls.filter(args => args.includes('ls-files') && args.includes('--others')).every(args => args.includes('--')), 'untracked scan must be confined to status-excluded scopes');
});
