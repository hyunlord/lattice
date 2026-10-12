import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync, renameSync, statSync, utimesSync, symlinkSync, linkSync, mkdirSync, cpSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { ObservationWorker } from '../bin/observer-client.mjs';
import { observationSummary } from '../bin/observer-protocol.mjs';
import { observeRepositoryAsync } from '../bin/observation.mjs';
import { FreshRepository } from '../bin/freshness.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-worker-test-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    const path = join(root, 'data.json');
    writeFileSync(path, '[{"id":"one","name":"Alpha"}]');
    execFileSync('git', ['-C', root, 'add', '.']);
    execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'fixture']);
    return { root, path, options: { root } };
}
test('real worker observes every edit and configuration change with direct summary parity', async t => {
    const f = fixture(t), worker = new ObservationWorker(); t.after(() => worker.dispose());
    const check = async () => assert.deepEqual(await worker.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
    await check(); await check();
    const before = statSync(f.path); writeFileSync(f.path, readFileSync(f.path, 'utf8').replace('Alpha', 'Omega')); utimesSync(f.path, before.atime, before.mtime); await check();
    const replacement = join(f.root, 'replacement.json'); writeFileSync(replacement, '[{"id":"two"}]'); renameSync(replacement, f.path); await check();
    writeFileSync(replacement, '[{"id":"three"}]'); await check(); renameSync(replacement, join(f.root, 'renamed.json')); await check(); rmSync(join(f.root, 'renamed.json')); await check();
    mkdirSync(join(f.root, '.lattice/notes'), { recursive: true });
    const lens = join(f.root, '.lattice/lens.json'), note = join(f.root, '.lattice/notes/n.json'), draft = join(f.root, '.lattice/lens.draft.yaml');
    writeFileSync(lens, JSON.stringify({ schemaVersion: 1, name: 'Lens', kinds: [] })); await check();
    writeFileSync(note, '{"summary":"a"}'); await check(); writeFileSync(draft, 'schemaVersion: 1\nname: draft\nkinds: []\n'); await check();
    rmSync(note); rmSync(draft); rmSync(lens); await check();
    writeFileSync(lens, 'invalid'); await assert.rejects(worker.observe(f.options)); rmSync(lens); await check();
    f.options.noLens = true; await check();
});
test('real worker refuses outside hardlink aliases and recovers after a dangling source is removed', async t => {
    const f = fixture(t), worker = new ObservationWorker(); t.after(() => worker.dispose());
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-worker-outside-'))); t.after(() => rmSync(outside, { recursive: true, force: true }));
    await worker.observe(f.options);
    const alias = join(outside, 'same.json'); linkSync(f.path, alias); rmSync(f.path); symlinkSync(alias, f.path);
    await assert.rejects(worker.observe(f.options));
    rmSync(alias); assert.deepEqual(await worker.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
    rmSync(f.path); assert.deepEqual(await worker.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
});
test('a real worker exit rejects active observation and the next request uses a new worker', async t => {
    const f = fixture(t); let first = true;
    const client = new ObservationWorker(start => {
        if (first) { first = false; return new Worker('process.exit(0)', { eval: true }); }
        return new Worker(new URL('../bin/observer-worker.mjs', import.meta.url), { workerData: start });
    });
    t.after(() => client.dispose()); await assert.rejects(client.observe(f.options));
    assert.deepEqual(await client.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
});
test('warm worker observes parent replacement and safe internal symlink targets', async t => {
    const f = fixture(t), worker = new ObservationWorker(); t.after(() => worker.dispose());
    const directory = join(f.root, 'nested'), moved = join(f.root, 'old'); mkdirSync(directory);
    const path = join(directory, 'value.json'); writeFileSync(path, '[{"id":"nested"}]');
    await worker.observe(f.options); renameSync(directory, moved); mkdirSync(directory); linkSync(join(moved, 'value.json'), path);
    assert.deepEqual(await worker.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
    rmSync(directory, { recursive: true }); symlinkSync(moved, directory);
    assert.deepEqual(await worker.observe(f.options), observationSummary(await observeRepositoryAsync({ ...f.options })));
});
test('replacement of the repository root cannot retain the previous source summary', async t => {
    const f = fixture(t), worker = new ObservationWorker(); t.after(() => worker.dispose());
    const old = `${f.root}-old`; t.after(() => rmSync(old, { recursive: true, force: true }));
    const first = await worker.observe(f.options); renameSync(f.root, old); cpSync(old, f.root, { recursive: true });
    writeFileSync(f.path, '[{"id":"one","name":"Omega"}]');
    const next = await worker.observe(f.options); assert.notEqual(next.fingerprint, first.fingerprint);
    assert.deepEqual(next, observationSummary(await observeRepositoryAsync({ ...f.options })));
});
test('unknown filesystem in the worker retains the content-hash fallback', async t => {
    const f = fixture(t), entry = new URL('../bin/observer-worker.mjs', import.meta.url).href;
    const worker = new ObservationWorker(start => new Worker(`const fs=require('node:fs');const statfs=fs.statfsSync;fs.statfsSync=(...args)=>({...statfs(...args),type:999999n});require('node:module').syncBuiltinESMExports();import(${JSON.stringify(entry)});`, { eval: true, workerData: start, env: start.environment }));
    t.after(() => worker.dispose());
    const first = await worker.observe(f.options); assert.equal(first.observationMode, 'content-hash');
    const before = statSync(f.path); writeFileSync(f.path, '[{"id":"one","name":"Omega"}]'); utimesSync(f.path, before.atime, before.mtime);
    const next = await worker.observe(f.options); assert.notEqual(next.fingerprint, first.fingerprint); assert.equal(next.observationMode, 'content-hash');
});
test('actual stdio serves a worker-backed request and exits cleanly when input ends', { timeout: 15000 }, async t => {
    const f = fixture(t), child = spawn(process.execPath, [new URL('../bin/lattice.mjs', import.meta.url).pathname, 'mcp', '--root', f.root], { stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => { if (child.exitCode === null) child.kill(); });
    let stdout = '', stderr = ''; child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    const closed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
    child.stdin.end([
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lattice_freshness', arguments: {} } },
    ].map(value => JSON.stringify(value)).join('\n') + '\n');
    assert.equal(await closed, 0, stderr); assert.equal(stderr, '');
    const reply = stdout.trim().split('\n').map(line => JSON.parse(line)).find(value => value.id === 2);
    assert.equal(reply.result.isError, false); assert.equal(reply.result.structuredContent.freshness.status, 'fresh');
});
test('environment changes restart the real worker with current external interpretations', async t => {
    const f = fixture(t), worker = new ObservationWorker(); t.after(() => worker.dispose());
    const previous = process.env.LATTICE_INTERPRETATION_DIR;
    t.after(() => { if (previous === undefined) delete process.env.LATTICE_INTERPRETATION_DIR; else process.env.LATTICE_INTERPRETATION_DIR = previous; });
    const first = await worker.observe(f.options), external = join(f.root, '.lattice/external'); mkdirSync(join(external, 'notes'), { recursive: true });
    writeFileSync(join(external, 'notes/n.json'), '{"summary":"new"}'); process.env.LATTICE_INTERPRETATION_DIR = external;
    const next = await worker.observe(f.options); assert.notEqual(next.fingerprint, first.fingerprint);
    assert.deepEqual(next, observationSummary(await observeRepositoryAsync({ ...f.options })));
});
test('real idle and busy worker disposal settles requests and rejects further checks', async t => {
    const f = fixture(t), worker = new ObservationWorker(); await worker.observe(f.options); await worker.dispose();
    await assert.rejects(worker.observe(f.options), /disposed/u);
    const busy = new ObservationWorker(), pending = busy.observe(f.options), rejected = assert.rejects(pending, /disposed/u);
    await busy.dispose(); await rejected;
});
test('queued repository requests settle on disposal and artifact removal requires rebuilding', async t => {
    const f = fixture(t), service = new FreshRepository(f.options); t.after(() => service.dispose());
    await service.ensureFreshAsync(); assert.equal((await service.ensureFreshAsync()).freshness.rebuilt, false);
    rmSync(join(f.root, '.lattice/cache/presentation.json'));
    assert.equal((await service.ensureFreshAsync()).freshness.rebuilt, true);
    const requests = [service.ensureFreshAsync(), service.ensureFreshAsync()];
    const results = Promise.allSettled(requests); await service.dispose();
    assert.deepEqual((await results).map(result => result.status), ['rejected', 'rejected']);
});
test('local rebuild observes changes made after the worker summary rather than publishing its old fingerprint', async t => {
    const f = fixture(t); let oldFingerprint;
    const client = {
        observe: async options => {
            const summary = observationSummary(await observeRepositoryAsync(options)); oldFingerprint = summary.fingerprint;
            writeFileSync(f.path, '[{"id":"one","name":"Omega"}]'); return summary;
        }, dispose: async () => { }
    };
    const service = new FreshRepository(f.options, client); t.after(() => service.dispose());
    const result = await service.ensureFreshAsync();
    assert.notEqual(result.freshness.fingerprint, oldFingerprint);
    assert.equal(result.freshness.fingerprint, (await observeRepositoryAsync({ ...f.options })).fingerprint);
    assert.equal(result.graph.nodes.find(node => node.id === 'one').name, 'Omega');
});
test('mixed synchronous publication and disposal invalidate pending async proofs', async t => {
    const f = fixture(t); let release;
    const summary = observationSummary(await observeRepositoryAsync(f.options));
    const client = { observe: () => new Promise(resolve => { release = resolve; }), dispose: async () => { } };
    const service = new FreshRepository(f.options, client); t.after(() => service.dispose());
    const pending = service.ensureFreshAsync(); await new Promise(resolve => setImmediate(resolve));
    service.ensureFresh(); release(summary); await assert.rejects(pending, /generation/u);
    const second = service.ensureFreshAsync(); await new Promise(resolve => setImmediate(resolve));
    await service.dispose(); release(summary); await assert.rejects(second, /disposed/u);
    await assert.rejects(service.ensureFreshAsync(), /disposed/u);
});
