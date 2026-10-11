import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

test('live generations stream immutable disk artifacts, retain four versions and clean shutdown', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-disk-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    const source = join(root, 'records.json');
    writeFileSync(source, '[{"id":"a","name":"First"}]');
    writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'Test', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }] }));
    execFileSync('git', ['-C', root, 'add', '.']);
    const guard = join(temporary, 'guard.mjs');
    writeFileSync(guard, `const original=JSON.stringify;JSON.stringify=function(value,...args){if(value?.schemaVersion===1&&value.hash&&Array.isArray(value.nodes)&&Array.isArray(value.edges))throw Error('whole graph serialization forbidden');return original.call(this,value,...args)};`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const until = async probe => { for (let i = 0; i < 300; i++) { const value = await probe(); if (value) return value; assert.equal(child.exitCode, null, stdout + stderr); await delay(50); } throw Error('Serve timeout: ' + stdout + stderr); };
    try {
        const ready = await until(() => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'ready'));
        const request = path => fetch(new URL(path, ready.url));
        const initial = await (await request('graph.json?generation=1')).json();
        assert.equal((await request('graph.json/child')).status, 404);
        assert.equal((await request('snapshots/..%2F..%2Fgraph.json')).status, 404);
        assert.equal((await request('__lattice/status')).status, 200);
        const directories = () => readdirSync(cache).filter(name => name.startsWith('serve-'));
        assert.equal(directories().length, 1);
        const generations = join(cache, directories()[0]);
        for (let revision = 2; revision <= 5; revision++) {
            writeFileSync(source, JSON.stringify([{ id: 'a', name: `Revision ${revision}` }]));
            await until(async () => (await (await request('__lattice/status')).json()).generation === String(revision));
            const retained = await request(`graph.json?generation=${Math.max(1, revision - 3)}`); assert.equal(retained.status, 200);
            if (revision < 5) assert.equal((await (await request('graph.json?generation=1')).json()).hash, initial.hash);
        }
        assert.equal((await request('graph.json?generation=1')).status, 503);
        assert.equal(readdirSync(generations).length, 4);
        const head = await request('graph.json?generation=5'); assert.equal((await head.json()).nodes[0].name, 'Revision 5');
        const bodyless = await fetch(new URL('graph.json?generation=5', ready.url), { method: 'HEAD' }); assert.equal(bodyless.status, 200); assert.equal(await bodyless.text(), '');
        child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null }); assert.equal(directories().length, 0);
    } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } rmSync(temporary, { recursive: true, force: true }); }
});
