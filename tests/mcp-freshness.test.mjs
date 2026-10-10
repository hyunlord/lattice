import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, statSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createMcpHandler } from '../bin/mcp.mjs';
function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-mcp-fresh-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/cache/\n');
    writeFileSync(join(root, 'data.json'), JSON.stringify([{ id: 'one', name: 'Alpha' }, { id: 'two', name: 'Bravo', targetId: 'one' }]));
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture']);
    return { root, call: createMcpHandler({ root }) };
}
test('all queries content-check, reuse unchanged graph and see same-size preserved-mtime edits', t => {
    const f = fixture(t), first = f.call('lattice_find', {}), unchanged = f.call('lattice_freshness', {});
    assert.equal(first.freshness.rebuilt, true); assert.equal(unchanged.freshness.rebuilt, false);
    assert.equal(first.graphHash, unchanged.graphHash);
    const path = join(f.root, 'data.json'), stat = statSync(path);
    writeFileSync(path, readFileSync(path, 'utf8').replace('Alpha', 'Omega'));
    utimesSync(path, stat.atime, stat.mtime);
    const changed = f.call('lattice_find', { q: 'Omega' });
    assert.equal(changed.freshness.rebuilt, true); assert.equal(changed.total, 1);
    assert.notEqual(changed.graphHash, first.graphHash);
    const difference = f.call('lattice_diff', { ref: 'HEAD' });
    assert.equal(difference.link, null);
    assert.equal(difference.nodes.changed.items.find(change => change.after.id === 'one').after.name, 'Omega');
    assert.equal(difference.nodes.changed.total, 1);
});
test('lens parse failure never returns previous graph; corrected lens recovers', t => {
    const f = fixture(t); f.call('lattice_overview', {});
    mkdirSync(join(f.root, '.lattice'), { recursive: true });
    writeFileSync(join(f.root, '.lattice/lens.yaml'), 'schemaVersion: [');
    assert.throws(() => f.call('lattice_overview', {}));
    rmSync(join(f.root, '.lattice/lens.yaml'));
    assert.equal(f.call('lattice_overview', {}).freshness.status, 'fresh');
});
