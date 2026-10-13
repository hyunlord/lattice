import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { FreshRepository } from '../bin/freshness.mjs';
import { observeRepositoryAsync } from '../bin/observation.mjs';
import { observationSummary } from '../bin/observer-protocol.mjs';
test('cold repository builds from one local observation before starting the warm observer', async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-cold-'))); t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]); writeFileSync(join(root, '.gitignore'), '.lattice/\n'); writeFileSync(join(root, 'data.json'), '[{"id":"one"}]');
    let observations = 0;
    const observer = { observe: async options => { observations++; return observationSummary(await observeRepositoryAsync(options)); }, dispose: async () => { } };
    const service = new FreshRepository({ root }, observer); t.after(() => service.dispose());
    const cold = await service.ensureFreshAsync(); assert.equal(observations, 0); assert.equal(cold.freshness.rebuilt, true);
    const warm = await service.ensureFreshAsync(); assert.equal(observations, 1); assert.equal(warm.graph.hash, cold.graph.hash); assert.equal(warm.freshness.rebuilt, false);
    writeFileSync(join(root, 'data.json'), '[{"id":"two"}]'); const changed = await service.ensureFreshAsync(); assert.equal(observations, 2); assert.notEqual(changed.graph.hash, cold.graph.hash);
});

for (const change of ['dispose', 'options']) test(`pending cold observation rejects ${change} rather than publishing`, async t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-cold-race-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, 'data.json'), '[{"id":"one"}]');
    let started = false;
    const options = { root };
    const service = new FreshRepository(options, { observe: async () => { started = true; throw new Error('cold worker must not start'); }, dispose: async () => { } });
    t.after(() => service.dispose());
    const pending = service.ensureFreshAsync();
    const rejected = assert.rejects(pending, change === 'dispose' ? /disposed/u : /options changed/u);
    // The queued observer has entered its first awaited Git operation before this microtask resumes.
    await Promise.resolve();
    if (change === 'dispose') await service.dispose(); else options.noLens = true;
    await rejected;
    assert.equal(started, false);
});
