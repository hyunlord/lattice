import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, statSync, utimesSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ArtifactDigests } from '../bin/artifact-digest.mjs';
test('resident artifact digests detect preserved-mtime writes, replacements and deletion', async t => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-artifact-digest-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const path = join(root, 'graph.json'), cache = new ArtifactDigests();
    writeFileSync(path, 'alpha');
    const before = statSync(path), original = await cache.digest(path);
    assert.equal(await cache.digest(path), original);
    writeFileSync(path, 'omega'); utimesSync(path, before.atime, before.mtime);
    assert.notEqual(await cache.digest(path), original);
    writeFileSync(join(root, 'next'), 'alpha'); renameSync(join(root, 'next'), path);
    assert.equal(await cache.digest(path), original);
    rmSync(path); assert.equal(await cache.digest(path), '');
});
