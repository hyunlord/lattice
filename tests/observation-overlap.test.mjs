import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
let beforeGit, afterGit, onStat;
const execute = cp.execFile, lstat = fs.lstatSync;
function instrumented(file, args, options, callback) {
    if (args.includes('status')) beforeGit?.();
    return execute(file, args, options, (error, stdout, stderr) => { if (args.includes('status')) afterGit?.(); callback(error, stdout, stderr); });
}
instrumented[promisify.custom] = (file, args, options) => new Promise((resolve, reject) => instrumented(file, args, options, (error, stdout, stderr) => error ? reject(error) : resolve({ stdout, stderr })));
cp.execFile = instrumented; fs.lstatSync = (...args) => { onStat?.(args[0]); return lstat(...args); }; syncBuiltinESMExports();
const { observeRepositoryAsync } = await import('../bin/observation.mjs');
const git = (root, ...args) => cp.execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'lattice-observation-overlap-')));
    t.after(() => { beforeGit = afterGit = onStat = undefined; fs.rmSync(root, { recursive: true, force: true }); });
    git(root, 'init', '-q'); fs.writeFileSync(join(root, 'input.ts'), 'export const value = 1;'); git(root, 'add', '.'); git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture');
    return { root, options: { root, noLens: true }, file: join(root, 'input.ts') };
}
test('warm source checks overlap the fresh before-Git query and still verify afterward', async t => {
    const f = fixture(t); const first = await observeRepositoryAsync(f.options);
    let returned = false, overlap = false, final = false;
    afterGit = () => { returned = true; }; onStat = path => { if (path === f.file) { if (returned) final = true; else overlap = true; } };
    const second = await observeRepositoryAsync(f.options);
    assert.equal(second.fingerprint, first.fingerprint); assert(overlap); assert(final);
});
test('new Git inventory and metadata discard the speculative result', async t => {
    const f = fixture(t); await observeRepositoryAsync(f.options);
    const changes = [
        () => fs.writeFileSync(join(f.root, 'added.ts'), 'export const added = 1;'),
        () => git(f.root, 'add', 'added.ts'),
        () => git(f.root, 'mv', 'added.ts', 'renamed.ts'),
        () => fs.unlinkSync(join(f.root, 'renamed.ts')),
        () => git(f.root, 'config', 'remote.origin.url', 'https://github.com/example/fixture.git'),
        () => { git(f.root, 'add', '-A'); git(f.root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-qm', 'next'); },
    ];
    for (const change of changes) {
        change();
        const actual = await observeRepositoryAsync(f.options); beforeGit = undefined;
        const fresh = await observeRepositoryAsync({ ...f.options });
        assert.equal(actual.fingerprint, fresh.fingerprint); assert.deepEqual(actual.codeInputs, fresh.codeInputs);
    }
});
test('source and note writes during before-Git completion fail closed after speculative reads', async t => {
    const f = fixture(t); fs.mkdirSync(join(f.root, '.lattice/notes'), { recursive: true }); const note = join(f.root, '.lattice/notes/example.json'); fs.writeFileSync(note, '{"summary":"one"}');
    await observeRepositoryAsync(f.options);
    for (const path of [f.file, note]) {
        let once = false; afterGit = () => { if (!once) { once = true; const stat = fs.statSync(path); fs.writeFileSync(path, fs.readFileSync(path, 'utf8').replace(path === f.file ? '1' : 'one', path === f.file ? '2' : 'two')); fs.utimesSync(path, stat.atime, stat.mtime); } };
        await assert.rejects(observeRepositoryAsync(f.options), /changed/); afterGit = undefined;
        await observeRepositoryAsync(f.options);
    }
});

test('a discarded speculative failure cannot block the changed current inventory', async t => {
    const f = fixture(t); await observeRepositoryAsync(f.options);
    const outside = fs.mkdtempSync(join(tmpdir(), 'lattice-overlap-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true })); fs.writeFileSync(join(outside, 'source.ts'), 'outside');
    git(f.root, 'rm', '--cached', 'input.ts'); fs.writeFileSync(join(f.root, '.gitignore'), 'input.ts\n'); fs.unlinkSync(f.file); fs.symlinkSync(join(outside, 'source.ts'), f.file);
    const observed = await observeRepositoryAsync(f.options);
    assert.equal(observed.codeInputs.length, 0);
    assert.equal(observed.fingerprint, (await observeRepositoryAsync({ ...f.options })).fingerprint);
});
test('lens mutation while the before-Git query resolves is never published as fresh', async t => {
    const f = fixture(t), lens = join(f.root, '.lattice/lens.json'); fs.mkdirSync(join(f.root, '.lattice')); fs.writeFileSync(lens, JSON.stringify({ schemaVersion: 1, name: 'First', kinds: [] }));
    const options = { root: f.root }; await observeRepositoryAsync(options);
    let once = false; afterGit = () => { if (!once) { once = true; fs.writeFileSync(lens, '{invalid'); } };
    await assert.rejects(observeRepositoryAsync(options), /changed/); afterGit = undefined;
    await assert.rejects(observeRepositoryAsync(options));
    fs.writeFileSync(lens, JSON.stringify({ schemaVersion: 1, name: 'Fixed', kinds: [] }));
    assert.equal((await observeRepositoryAsync(options)).lens.name, 'Fixed');
});

test('ignored lens, note membership and draft creation during before-Git resolution invalidate speculation', async t => {
    for (const name of ['lens.json', 'notes/new.json', 'lens.draft.yaml', 'lens.draft.sources.json']) await t.test(name, async t => {
        const f = fixture(t); fs.writeFileSync(join(f.root, '.gitignore'), '.lattice/\n'); fs.mkdirSync(join(f.root, '.lattice/notes'), { recursive: true });
        const options = { root: f.root }; await observeRepositoryAsync(options);
        let once = false; afterGit = () => { if (!once) { once = true; fs.writeFileSync(join(f.root, '.lattice', name), JSON.stringify({ schemaVersion: 1, name: 'New', kinds: [] })); } };
        await assert.rejects(observeRepositoryAsync(options), /changed/); afterGit = undefined;
        assert.equal((await observeRepositoryAsync(options)).fingerprint, (await observeRepositoryAsync({ ...options })).fingerprint);
    });
});

test('ignored configuration rename, removal and a second default lens invalidate the pending observation', async t => {
    for (const action of ['rename-lens', 'remove-lens', 'second-lens', 'rename-note']) await t.test(action, async t => {
        const f = fixture(t), directory = join(f.root, '.lattice'); fs.writeFileSync(join(f.root, '.gitignore'), '.lattice/\n'); fs.mkdirSync(join(directory, 'notes'), { recursive: true });
        const text = JSON.stringify({ schemaVersion: 1, name: 'Initial', kinds: [] }); fs.writeFileSync(join(directory, 'lens.json'), text); fs.writeFileSync(join(directory, 'notes/old.json'), '{}');
        const options = { root: f.root }; await observeRepositoryAsync(options);
        let once = false; afterGit = () => {
            if (once) return; once = true;
            if (action === 'rename-lens') fs.renameSync(join(directory, 'lens.json'), join(directory, 'lens.yml'));
            if (action === 'remove-lens') fs.unlinkSync(join(directory, 'lens.json'));
            if (action === 'second-lens') fs.writeFileSync(join(directory, 'lens.yaml'), text);
            if (action === 'rename-note') fs.renameSync(join(directory, 'notes/old.json'), join(directory, 'notes/new.json'));
        };
        await assert.rejects(observeRepositoryAsync(options), /changed/); afterGit = undefined;
    });
});
