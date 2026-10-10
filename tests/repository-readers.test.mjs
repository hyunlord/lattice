import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { historicalRepository, workingRepository } from '../bin/repository.mjs';
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-history-links-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    git('init', '--quiet'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'user.name', 'Fixture');
    const commit = () => { git('add', '.'); git('commit', '--quiet', '-m', 'Record fixture'); return git('rev-parse', 'HEAD'); };
    return { root, commit };
}
test('historical internal aliases read pinned target bytes in prepare and direct reads', t => {
    const { root, commit } = fixture(t);
    mkdirSync(join(root, 'docs'));
    writeFileSync(join(root, 'AGENTS.md'), '# Original\n');
    symlinkSync('AGENTS.md', join(root, 'CLAUDE.md'));
    symlinkSync('../CLAUDE.md', join(root, 'docs/guide.md'));
    const ref = commit();
    const current = workingRepository(root);
    const old = historicalRepository(root, ref);
    assert.equal(old.readText('CLAUDE.md'), current.readText('CLAUDE.md'));
    old.prepare(['CLAUDE.md', 'docs/guide.md']);
    writeFileSync(join(root, 'AGENTS.md'), '# Changed\n');
    assert.equal(old.readText('docs/guide.md'), '# Original\n');
    assert.equal(historicalRepository(root, ref).readText('docs/guide.md'), '# Original\n');
    assert.equal(workingRepository(root).readText('CLAUDE.md'), '# Changed\n');
});
test('historical aliases reject absolute, escaping and cyclic targets without filesystem access', t => {
    const { root, commit } = fixture(t);
    writeFileSync(join(root, 'safe.md'), '# Safe\n');
    for (const [name, target] of [['absolute.md', '/etc/passwd'], ['escape.md', '../outside.md'], ['first.md', 'second.md'], ['second.md', 'first.md']]) symlinkSync(target, join(root, name));
    const ref = commit();
    const reader = historicalRepository(root, ref);
    reader.prepare(['safe.md']);
    assert.equal(reader.readText('safe.md'), '# Safe\n');
    for (const name of ['absolute.md', 'escape.md', 'first.md']) {
        assert.throws(() => reader.readText(name), /outside|cycle/i);
        assert.throws(() => reader.prepare([name]), /outside|cycle/i);
    }
});
test('dangling historical aliases match missing working files and preserve target size bounds', t => {
    const { root, commit } = fixture(t);
    symlinkSync('missing.md', join(root, 'dangling.md'));
    writeFileSync(join(root, 'large.md'), 'x'.repeat(10 * 1024 * 1024 + 1));
    symlinkSync('large.md', join(root, 'alias.md'));
    const reader = historicalRepository(root, commit());
    assert.equal(workingRepository(root).readText('dangling.md'), undefined);
    assert.equal(reader.readText('dangling.md'), undefined);
    reader.prepare(['dangling.md']);
    writeFileSync(join(root, 'missing.md'), '# Exists only now\n');
    assert.equal(reader.readText('dangling.md'), undefined, 'No current filesystem fallback');
    assert.throws(() => reader.readText('alias.md'), /10 MiB/);
    assert.throws(() => reader.prepare(['alias.md']), /10 MiB/);
});
