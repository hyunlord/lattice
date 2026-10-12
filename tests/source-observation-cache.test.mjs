import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceObservationCache } from '../bin/source-observation-cache.mjs';
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'lattice-source-witness-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const path = join(root, 'input.ts'); fs.writeFileSync(path, 'alpha');
    return { root, path, cache: new SourceObservationCache(root), read: cache => cache.read('input.ts', () => { throw new Error('oversized'); }) };
}
test('source witness sees restored timestamps, replaced files and deletions', t => {
    const f = fixture(t), original = f.read(f.cache), before = fs.statSync(f.path);
    assert.equal(f.read(f.cache).contentHash, original.contentHash);
    fs.writeFileSync(f.path, 'omega'); fs.utimesSync(f.path, before.atime, before.mtime);
    assert.equal(f.read(f.cache).text, 'omega');
    fs.writeFileSync(join(f.root, 'next'), 'delta'); fs.renameSync(join(f.root, 'next'), f.path);
    assert.equal(f.read(f.cache).text, 'delta');
    fs.rmSync(f.path); assert.equal(f.read(f.cache), undefined);
});
test('source changing while bytes are read fails closed and recovers on next observation', t => {
    const f = fixture(t), original = fs.readFileSync, before = fs.statSync(f.path);
    fs.readFileSync = (...args) => { const text = original(...args); if (typeof args[0] === 'number') { fs.writeFileSync(f.path, 'omega'); fs.utimesSync(f.path, before.atime, before.mtime); } return text; };
    syncBuiltinESMExports();
    try { assert.throws(() => f.read(f.cache), /Source changed while reading/u); }
    finally { fs.readFileSync = original; syncBuiltinESMExports(); }
    assert.equal(f.read(f.cache).text, 'omega');
});
test('source changed after its individual read invalidates the complete observation', t => {
    const f = fixture(t); f.cache.prune(['input.ts']); f.read(f.cache);
    const before = fs.statSync(f.path); fs.writeFileSync(f.path, 'omega'); fs.utimesSync(f.path, before.atime, before.mtime);
    assert.throws(() => f.cache.verify(), /Source changed across observation/u);
    f.cache.prune(['input.ts']); assert.equal(f.read(f.cache).text, 'omega'); f.cache.verify();
});
test('an absent tracked path appearing after its read invalidates the observation', t => {
    const f = fixture(t); fs.rmSync(f.path); f.cache.prune(['input.ts']);
    assert.equal(f.read(f.cache), undefined); fs.writeFileSync(f.path, 'after');
    assert.throws(() => f.cache.verify(), /Source changed across observation/u);
});
test('retargeting a source symlink to an outside hardlink never reuses cached bytes', t => {
    const f = fixture(t), outside = fs.mkdtempSync(join(tmpdir(), 'lattice-outside-link-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.renameSync(f.path, join(f.root, 'inside')); fs.linkSync(join(f.root, 'inside'), join(outside, 'outside'));
    fs.symlinkSync('inside', f.path); f.cache.prune(['input.ts']); f.read(f.cache); f.cache.verify();
    fs.unlinkSync(f.path); fs.symlinkSync(join(outside, 'outside'), f.path);
    assert.throws(() => f.read(f.cache), /outside repository/u);
});
test('observation contexts keep independent verification sets while sharing hashed inputs', t => {
    const f = fixture(t), first = f.cache.fork(), second = f.cache.fork();
    first.prune(['input.ts']); f.read(first); fs.writeFileSync(f.path, 'omega');
    second.prune(['input.ts']); assert.equal(f.read(second).text, 'omega'); second.verify();
    assert.throws(() => first.verify(), /Source changed across observation/u);
});
test('configuration mutation during direct text read fails the observation', t => {
    const f = fixture(t), original = fs.readFileSync;
    fs.readFileSync = (...args) => { const text = original(...args); if (args[0] === f.path) fs.writeFileSync(f.path, 'omega'); return text; }; syncBuiltinESMExports();
    try { assert.throws(() => f.cache.readObservedText(f.path), /Source changed while reading configuration/u); }
    finally { fs.readFileSync = original; syncBuiltinESMExports(); }
});
test('leaf symlink retarget after reading is rejected by final verification', t => {
    const f = fixture(t), outside = fs.mkdtempSync(join(tmpdir(), 'lattice-final-link-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.renameSync(f.path, join(f.root, 'inside')); fs.linkSync(join(f.root, 'inside'), join(outside, 'outside'));
    fs.symlinkSync('inside', f.path); f.cache.prune(['input.ts']); f.read(f.cache);
    fs.unlinkSync(f.path); fs.symlinkSync(join(outside, 'outside'), f.path);
    assert.throws(() => f.cache.verify(), /Source changed across observation/u);
});
test('regular leaf replaced with an outside symlink is rejected by final verification', t => {
    const f = fixture(t), outside = fs.mkdtempSync(join(tmpdir(), 'lattice-final-regular-link-'));
    t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
    fs.linkSync(f.path, join(outside, 'outside')); f.cache.prune(['input.ts']); f.read(f.cache);
    fs.unlinkSync(f.path); fs.symlinkSync(join(outside, 'outside'), f.path);
    assert.throws(() => f.cache.verify(), /Source changed across observation/u);
});
test('an unchanged dangling symlink stays absent but a target appearing invalidates it', t => {
    const f = fixture(t); fs.unlinkSync(f.path); fs.symlinkSync('missing', f.path);
    f.cache.prune(['input.ts']); assert.equal(f.read(f.cache), undefined); assert.doesNotThrow(() => f.cache.verify());
    fs.writeFileSync(join(f.root, 'missing'), 'after'); assert.throws(() => f.cache.verify(), /Source changed across observation/u);
});
