import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { SourceObservationCache } from '../bin/source-observation-cache.mjs';

test('shared parent containment is computed once per observation while every leaf is checked twice', t => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'lattice-parent-containment-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const paths = ['a.ts', 'b.ts', 'c.ts'];
    for (const file of paths) fs.writeFileSync(path.join(root, file), 'same');
    const cache = new SourceObservationCache(root);
    if (cache.mode !== 'metadata-witness') { t.skip('filesystem requires full byte verification'); return; }
    const oversized = () => { throw new Error('oversized'); };
    for (const file of paths) cache.read(file, oversized);
    cache.verify();
    const original = { relative: path.relative, lstat: fs.lstatSync };
    let containment = 0;
    const leafStats = new Map(paths.map(file => [path.join(root, file), 0]));
    path.relative = (from, to) => { if (from === root && to === root) containment++; return original.relative(from, to); };
    fs.lstatSync = (...args) => { if (leafStats.has(args[0])) leafStats.set(args[0], leafStats.get(args[0]) + 1); return original.lstat(...args); };
    syncBuiltinESMExports();
    try {
        const warm = cache.fork();
        for (let round = 0; round < 2; round++) {
            warm.prune(paths);
            for (const file of paths) assert.equal(warm.read(file, oversized).text, 'same');
            warm.verify();
            assert.equal(containment, round + 1, 'clear starts a new containment computation');
            for (const count of leafStats.values()) assert.ok(count >= 2 * (round + 1));
        }
    } finally { path.relative = original.relative; fs.lstatSync = original.lstat; syncBuiltinESMExports(); }
});

test('a later observation rejects a parent retargeted outside despite an identical leaf inode', t => {
    const base = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'lattice-parent-retarget-')));
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    const root = path.join(base, 'root'), inside = path.join(root, 'inside'), outside = path.join(base, 'outside');
    fs.mkdirSync(inside, { recursive: true }); fs.mkdirSync(outside);
    fs.writeFileSync(path.join(inside, 'input.ts'), 'same');
    fs.linkSync(path.join(inside, 'input.ts'), path.join(outside, 'input.ts'));
    fs.symlinkSync(inside, path.join(root, 'alias'));
    const cache = new SourceObservationCache(root), oversized = () => { throw new Error('oversized'); };
    cache.read('alias/input.ts', oversized); cache.verify();
    fs.unlinkSync(path.join(root, 'alias')); fs.symlinkSync(outside, path.join(root, 'alias'));
    assert.throws(() => cache.fork().read('alias/input.ts', oversized), /outside|escape/iu);
});
