import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { SourceObservationCache } from '../bin/source-observation-cache.mjs';

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'lattice-observation-paths-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const requested = path.join(root, 'input.ts');
    fs.writeFileSync(requested, 'alpha');
    const cache = new SourceObservationCache(root);
    return { root, requested, cache };
}
function observe(cache) {
    cache.prune(['input.ts']);
    const input = cache.read('input.ts', () => { throw new Error('oversized'); });
    cache.verify();
    return input;
}
function countPathWork(fixture) {
    const original = { join: path.join, dirname: path.dirname, lstatSync: fs.lstatSync };
    const counts = { joins: 0, parents: 0, leafStats: 0, directoryStats: 0 };
    path.join = (...args) => { if (args[0] === fixture.root && args[1] === 'input.ts') counts.joins++; return original.join(...args); };
    path.dirname = value => { if (value === fixture.requested) counts.parents++; return original.dirname(value); };
    fs.lstatSync = (...args) => { if (args[0] === fixture.requested) counts.leafStats++; if (args[0] === fixture.root) counts.directoryStats++; return original.lstatSync(...args); };
    syncBuiltinESMExports();
    return { counts, restore() { path.join = original.join; path.dirname = original.dirname; fs.lstatSync = original.lstatSync; syncBuiltinESMExports(); } };
}

test('warm observations reuse only lexical record paths and still inspect leaf and parent twice', t => {
    // Given a successful prior record, when observing a new fork, then lexical work is avoided but filesystem barriers run.
    const f = fixture(t), first = observe(f.cache);
    const measured = countPathWork(f);
    let input;
    try { input = observe(f.cache.fork()); }
    finally { measured.restore(); }
    assert.equal(input.contentHash, first.contentHash);
    assert.equal(measured.counts.joins, 0);
    assert.equal(measured.counts.parents, 0);
    assert.ok(measured.counts.leafStats >= 2);
    assert.ok(measured.counts.directoryStats >= 2);
});

test('pruning a record removes its lexical memo and preserves subsequent cold checks', t => {
    // Given a removed inventory entry, when reading it after pruning, then its path is derived again and checked freshly.
    const f = fixture(t); observe(f.cache); f.cache.prune([]);
    const measured = countPathWork(f);
    try { assert.equal(observe(f.cache.fork()).text, 'alpha'); }
    finally { measured.restore(); }
    assert.ok(measured.counts.joins >= 1);
    assert.ok(measured.counts.parents >= 1);
    assert.ok(measured.counts.leafStats >= 2);
});

test('reused lexical paths still detect equal-sized edits with restored modification time', t => {
    // Given a previously observed path, when its bytes change, then a fresh fork sees the new content.
    const f = fixture(t), first = observe(f.cache), stamp = fs.statSync(f.requested);
    fs.writeFileSync(f.requested, 'omega'); fs.utimesSync(f.requested, stamp.atime, stamp.mtime);
    const next = observe(f.cache.fork());
    assert.equal(next.text, 'omega');
    assert.notEqual(next.contentHash, first.contentHash);
});

test('an unchanged source symlink retains fresh target stats and realpath containment on each fork', t => {
    // Given a cached symlink record, when observing again, then the target remains freshly resolved and checked.
    const f = fixture(t), target = path.join(f.root, 'target.ts');
    fs.renameSync(f.requested, target); fs.symlinkSync('target.ts', f.requested); observe(f.cache);
    const original = { stat: fs.statSync, realpath: fs.realpathSync.native };
    let targetStats = 0, resolutions = 0;
    fs.statSync = (...args) => { if (args[0] === f.requested) targetStats++; return original.stat(...args); };
    fs.realpathSync.native = (...args) => { if (args[0] === f.requested) resolutions++; return original.realpath(...args); };
    syncBuiltinESMExports();
    try { assert.equal(observe(f.cache.fork()).text, 'alpha'); }
    finally { fs.statSync = original.stat; fs.realpathSync.native = original.realpath; syncBuiltinESMExports(); }
    assert.ok(targetStats >= 2);
    assert.ok(resolutions >= 1);
});

test('fork verification witnesses stay independent when a later fork sees changed bytes', t => {
    // Given a first fork's completed read, when another fork updates the shared record, then the first still rejects the mutation.
    const f = fixture(t); observe(f.cache);
    const first = f.cache.fork(); first.prune(['input.ts']); first.read('input.ts', () => { throw new Error('oversized'); });
    fs.writeFileSync(f.requested, 'omega');
    assert.equal(observe(f.cache.fork()).text, 'omega');
    assert.throws(() => first.verify(), /Source changed across observation/);
});

test('same-target symlink retarget keeps an older fork witness immutable', t => {
    // Given a symlink and same-inode target aliases, when another fork sees a new link leaf, then the older fork rejects it.
    const f = fixture(t), target = path.join(f.root, 'target.ts'), alias = path.join(f.root, 'alias.ts');
    fs.renameSync(f.requested, target); fs.linkSync(target, alias); fs.symlinkSync('target.ts', f.requested); observe(f.cache);
    const first = f.cache.fork(); first.prune(['input.ts']); first.read('input.ts', () => { throw new Error('oversized'); });
    fs.unlinkSync(f.requested); fs.symlinkSync('alias.ts', f.requested);
    assert.equal(observe(f.cache.fork()).text, 'alpha');
    assert.throws(() => first.verify(), /Source changed across observation/);
    assert.equal(observe(f.cache.fork()).text, 'alpha');
});

test('pruning shared records cannot remove an earlier forks final verification', t => {
    // Given an earlier fork's observed input, when a sibling prunes the shared record, then verification still checks that path.
    const f = fixture(t); observe(f.cache);
    const first = f.cache.fork(); first.prune(['input.ts']); first.read('input.ts', () => { throw new Error('oversized'); });
    f.cache.fork().prune([]);
    assert.doesNotThrow(() => first.verify());
    fs.writeFileSync(f.requested, 'omega');
    assert.throws(() => first.verify(), /Source changed across observation/);
});
