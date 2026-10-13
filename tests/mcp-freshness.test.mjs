import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, statSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { observeRepository, observeRepositoryAsync } from '../bin/observation.mjs';
import { createMcpHandler } from '../bin/mcp.mjs';
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-mcp-fresh-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/cache/\n');
    writeFileSync(join(root, 'data.json'), JSON.stringify([{ id: 'one', name: 'Alpha' }, { id: 'two', name: 'Bravo', targetId: 'one' }]));
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    const call = createMcpHandler({ root }); t.after(() => call.dispose());
    return { root, call };
}
test('all queries content-check, reuse unchanged graph and see same-size preserved-mtime edits', async t => {
    const f = fixture(t), first = await f.call('lattice_find', {}), unchanged = await f.call('lattice_freshness', {});
    assert.equal((await observeRepositoryAsync({ root: f.root })).fingerprint, observeRepository({ root: f.root }).fingerprint);
    assert.equal(first.freshness.rebuilt, true); assert.equal(unchanged.freshness.rebuilt, false);
    assert.equal(first.graphHash, unchanged.graphHash);
    const path = join(f.root, 'data.json'), stat = statSync(path);
    writeFileSync(path, readFileSync(path, 'utf8').replace('Alpha', 'Omega'));
    utimesSync(path, stat.atime, stat.mtime);
    const changed = await f.call('lattice_find', { q: 'Omega' });
    assert.equal(changed.freshness.rebuilt, true); assert.equal(changed.total, 1);
    assert.notEqual(changed.graphHash, first.graphHash);
    const difference = await f.call('lattice_diff', { ref: 'HEAD' });
    assert.equal(difference.link, null);
    assert.equal(difference.nodes.changed.items.find(change => change.after.id === 'one').after.name, 'Omega');
    assert.equal(difference.nodes.changed.total, 1);
    const added = join(f.root, 'new.json');
    writeFileSync(added, JSON.stringify([{ id: 'three', name: 'Added' }]));
    assert.equal((await f.call('lattice_find', { q: 'Added' })).total, 1);
    rmSync(added);
    assert.equal((await f.call('lattice_find', { q: 'Added' })).total, 0);
});
test('lens parse failure never returns previous graph; corrected lens recovers', async t => {
    const f = fixture(t); await f.call('lattice_overview', {});
    mkdirSync(join(f.root, '.lattice'), { recursive: true });
    writeFileSync(join(f.root, '.lattice/lens.yaml'), 'schemaVersion: [');
    await assert.rejects(() => f.call('lattice_overview', {}));
    rmSync(join(f.root, '.lattice/lens.yaml'));
    assert.equal((await f.call('lattice_overview', {})).freshness.status, 'fresh');
    const path = join(f.root, '.lattice/lens.json');
    writeFileSync(path, JSON.stringify({ schemaVersion: 1, name: 'Lens', kinds: [{ id: 'thing', label: 'Things', files: ['data.json'] }] }));
    assert.equal((await f.call('lattice_find', { kind: 'thing' })).total, 2);
    const stat = statSync(path);
    writeFileSync(path, readFileSync(path, 'utf8').replace('thing', 'other'));
    utimesSync(path, stat.atime, stat.mtime);
    assert.equal((await f.call('lattice_find', { kind: 'other' })).total, 2);
    assert.equal((await f.call('lattice_find', { kind: 'thing' })).total, 0);
});
test('concurrent cold queries build once and each later query still detects cache corruption', async t => {
    const f = fixture(t);
    const answers = await Promise.all(Array.from({ length: 3 }, () => f.call('lattice_freshness', {})));
    assert.equal(answers.filter(answer => answer.freshness.rebuilt).length, 1);
    assert.equal(new Set(answers.map(answer => answer.graphHash)).size, 1);
    const graphPath = join(f.root, '.lattice/cache/graph.json');
    const stat = statSync(graphPath), original = readFileSync(graphPath, 'utf8');
    writeFileSync(graphPath, original.replace('Alpha', 'Omega'));
    utimesSync(graphPath, stat.atime, stat.mtime);
    const repaired = await f.call('lattice_find', { q: 'Alpha' });
    assert.equal(repaired.freshness.rebuilt, true);
    assert.equal(repaired.total, 1);
    assert.equal(repaired.graphHash, answers[0].graphHash);
    assert.equal((await f.call('lattice_freshness', {})).freshness.rebuilt, false);
});
for (const name of ['lattice_find', 'lattice_entrypoints', 'lattice_node']) {
    test(`${name} compact observes preserved-mtime edits and refuses stale fallback`, async t => {
        // Given an observed repository, when compact is requested after an edit, then freshness still rebuilds.
        const f = fixture(t), args = name === 'lattice_node' ? { id: 'one' } : {};
        const first = await f.call(name, args), path = join(f.root, 'data.json'), stat = statSync(path);
        writeFileSync(path, readFileSync(path, 'utf8').replace('Alpha', 'Omega'));
        utimesSync(path, stat.atime, stat.mtime);
        const changed = await f.call(name, { ...args, compact: true });
        assert.equal(changed.freshness.status, 'fresh');
        assert.equal(changed.freshness.rebuilt, true);
        assert.notEqual(changed.graphHash, first.graphHash);
        if (name === 'lattice_find') assert.equal(changed.items.find(item => item.id === 'one').name, 'Omega');
        if (name === 'lattice_node') assert.equal(changed.node.name, 'Omega');
        mkdirSync(join(f.root, '.lattice'), { recursive: true });
        writeFileSync(join(f.root, '.lattice/lens.yaml'), 'schemaVersion: [');
        await assert.rejects(() => f.call(name, { ...args, compact: true }));
    });
}
