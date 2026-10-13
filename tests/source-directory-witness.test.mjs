import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SourceObservationCache } from '../bin/source-observation-cache.mjs';
const oversized = () => { throw new Error('oversized'); };
function fixture(t) {
    const base = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'lattice-directory-witness-'))), root = join(base, 'root');
    fs.mkdirSync(join(root, 'a/b'), { recursive: true }); fs.writeFileSync(join(root, 'a/b/input.ts'), 'same');
    t.after(() => fs.rmSync(base, { recursive: true, force: true }));
    return { base, root, cache: new SourceObservationCache(root) };
}
test('ancestor and root replacement with identical hardlinked leaves invalidates observation', t => {
    for (const relative of ['a', '']) {
        const f = fixture(t), path = join(f.root, relative), moved = join(f.base, `moved-${relative || 'root'}`);
        const replacement = join(f.base, 'replacement'), destination = join(replacement, relative ? 'b' : 'a/b'); fs.mkdirSync(destination, { recursive: true });
        fs.linkSync(join(f.root, 'a/b/input.ts'), join(destination, 'input.ts'));
        f.cache.read('a/b/input.ts', oversized); fs.renameSync(path, moved); fs.renameSync(replacement, path);
        assert.throws(() => f.cache.verify(), /directory changed/i);
    }
});
test('renaming an ancestor away and back cannot erase its identity-change witness', t => {
    const f = fixture(t); f.cache.read('a/b/input.ts', oversized);
    fs.renameSync(join(f.root, 'a'), join(f.base, 'moved')); fs.renameSync(join(f.base, 'moved'), join(f.root, 'a'));
    assert.throws(() => f.cache.verify(), /directory changed/i);
});
test('an absent parent appearing is detected even while its selected leaf remains absent', t => {
    const f = fixture(t); assert.equal(f.cache.read('missing/input.ts', oversized), undefined);
    fs.mkdirSync(join(f.root, 'missing')); assert.throws(() => f.cache.verify(), /directory changed/i);
});
test('symlinked ancestors preserve native inside and outside-returning path semantics', t => {
    const f = fixture(t), outside = join(f.base, 'outside'); fs.mkdirSync(outside);
    fs.symlinkSync(join(f.root, 'a'), join(f.root, 'safe')); fs.symlinkSync(outside, join(f.root, 'via')); fs.symlinkSync(join(f.root, 'a'), join(outside, 'back'));
    assert.equal(f.cache.read('safe/b/input.ts', oversized).text, 'same');
    assert.equal(f.cache.read('via/back/b/input.ts', oversized).text, 'same'); f.cache.verify();
});
test('retargeting an ancestor outside with an identical hardlinked leaf fails closed', t => {
    const f = fixture(t), outside = join(f.base, 'outside'); fs.mkdirSync(outside); fs.linkSync(join(f.root, 'a/b/input.ts'), join(outside, 'input.ts'));
    fs.symlinkSync(join(f.root, 'a/b'), join(f.root, 'alias')); f.cache.read('alias/input.ts', oversized);
    fs.unlinkSync(join(f.root, 'alias')); fs.symlinkSync(outside, join(f.root, 'alias')); assert.throws(() => f.cache.verify(), /directory changed/i);
});

test('ancestor swaps during the final leaf pass are rejected by the later root barrier', t => {
    const f = fixture(t), path = join(f.root, 'a/b/input.ts'); f.cache.read('a/b/input.ts', oversized);
    const original = fs.lstatSync; let changed = false;
    fs.lstatSync = (...args) => { const stat = original(...args); if (args[0] === path && !changed) { changed = true; fs.renameSync(join(f.root, 'a'), join(f.base, 'moved')); fs.renameSync(join(f.base, 'moved'), join(f.root, 'a')); } return stat; }; syncBuiltinESMExports();
    try { assert.throws(() => f.cache.verify(), /directory changed/i); }
    finally { fs.lstatSync = original; syncBuiltinESMExports(); }
});
test('normal shared ancestors need only one native root resolution on a warm observation', t => {
    const f = fixture(t), paths = [];
    if (f.cache.mode !== 'metadata-witness') { t.skip('filesystem requires native fallback'); return; }
    for (let i = 0; i < 12; i++) { const directory = join(f.root, `a/b/c${i}`); fs.mkdirSync(directory); fs.writeFileSync(join(directory, 'input.ts'), 'same'); paths.push(`a/b/c${i}/input.ts`); }
    for (const path of [f.root, join(f.root, 'a'), join(f.root, 'a/b'), ...paths.map(path => join(f.root, path, '..'))]) if (fs.statSync(path, { bigint: true }).ctimeNs % 1000000000n === 0n) { t.skip('coarse timestamps require native fallback'); return; }
    for (const path of paths) f.cache.read(path, oversized); f.cache.verify();
    const warm = f.cache.fork(), original = fs.realpathSync.native; let calls = 0;
    fs.realpathSync.native = (...args) => { calls++; return original(...args); };
    try { for (const path of paths) warm.read(path, oversized); warm.verify(); assert.equal(calls, 1); }
    finally { fs.realpathSync.native = original; }
});
