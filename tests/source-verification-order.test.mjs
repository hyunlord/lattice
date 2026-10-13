import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceObservationCache } from '../bin/source-observation-cache.mjs';

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'lattice-verification-order-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const records = new Map(), cache = new SourceObservationCache(root, records);
    const paths = ['b.ts', 'a.ts', 'c.ts'];
    for (const file of [...paths, 'config.json']) fs.writeFileSync(join(root, file), 'alpha');
    cache.readObservedText(join(root, 'config.json'));
    for (const file of paths) cache.read(file, () => { throw new Error('oversized'); });
    return { root, records, cache, paths };
}

function traceVerification(cache) {
    const original = { lstat: fs.lstatSync, stat: fs.statSync }, trace = [];
    fs.lstatSync = (...args) => { trace.push(['lstat', args[0]]); return original.lstat(...args); };
    fs.statSync = (...args) => { trace.push(['stat', args[0]]); return original.stat(...args); };
    syncBuiltinESMExports();
    let failure;
    try { cache.verify(); } catch (error) { failure = error; }
    finally { fs.lstatSync = original.lstat; fs.statSync = original.stat; syncBuiltinESMExports(); }
    return { trace, failure };
}

test('verification checks configuration then every selected leaf in insertion order then ancestors', t => {
    const f = fixture(t), result = traceVerification(f.cache);
    assert.equal(result.failure, undefined);
    assert.deepEqual(result.trace, [
        ['lstat', join(f.root, 'config.json')], ['stat', join(f.root, 'config.json')],
        ...f.paths.map(file => ['lstat', join(f.root, file)]), ['lstat', f.root],
    ]);
});

test('verification stops at a changed leaf, drops only that record and permits a fresh recovery', t => {
    const f = fixture(t);
    fs.writeFileSync(join(f.root, 'a.ts'), 'omega');
    const result = traceVerification(f.cache);
    assert.match(result.failure?.message ?? '', /Source changed across observation/u);
    assert.deepEqual(result.trace, [
        ['lstat', join(f.root, 'config.json')], ['stat', join(f.root, 'config.json')],
        ['lstat', join(f.root, 'b.ts')], ['lstat', join(f.root, 'a.ts')],
    ]);
    assert.equal(f.records.has('a.ts'), false);
    assert.equal(f.records.has('b.ts'), true); assert.equal(f.records.has('c.ts'), true);
    const next = f.cache.fork(); next.prune(f.paths);
    for (const file of f.paths) assert.equal(next.read(file, () => { throw new Error('oversized'); }).text, file === 'a.ts' ? 'omega' : 'alpha');
    assert.doesNotThrow(() => next.verify());
});
