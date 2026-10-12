import { createPackedLoader } from '../viewer/packed-data.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

test('published live generation stays readable while the producer is blocked observing inputs', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-responsive-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    const lens = join(root, '.lattice/lens.json'), armed = join(temporary, 'armed'), entered = join(temporary, 'entered'), release = join(temporary, 'release');
    writeFileSync(join(root, 'records.json'), '[{"id":"a","name":"Published"}]');
    writeFileSync(lens, JSON.stringify({ schemaVersion: 1, name: 'Responsive', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }] }));
    execFileSync('git', ['-C', root, 'add', '.']);
    const guard = join(temporary, 'guard.mjs');
    writeFileSync(guard, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const read=fs.readFileSync;fs.readFileSync=function(path,...args){if(String(path).endsWith('/.lattice/lens.json')&&fs.existsSync(${JSON.stringify(armed)})&&!fs.existsSync(${JSON.stringify(entered)})){fs.writeFileSync(${JSON.stringify(entered)},'entered');const until=Date.now()+30000;while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>until)throw Error('Producer fixture was not released');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}return read.call(this,path,...args);};syncBuiltinESMExports();`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const until = async probe => { for (let i = 0; i < 300; i++) { const value = await probe(); if (value) return value; assert.equal(child.exitCode, null, stdout + stderr); await delay(50); } throw Error('Serve timeout: ' + stdout + stderr); };
    try {
        const ready = await until(() => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'ready'));
        writeFileSync(armed, 'observe');
        await until(() => readdirSync(temporary).includes('entered'));
        const response = await fetch(new URL('graph.json?generation=1', ready.url), { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200); assert.equal((await createPackedLoader(ready.url, '?generation=1').json('graph.json')).nodes[0].name, 'Published');
        assert.equal(readdirSync(temporary).includes('release'), false, 'HTTP must finish before the blocked producer is released');
        writeFileSync(release, 'resume');
        child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null });
        assert.equal(readdirSync(cache).includes('writer.lock'), false);
    } finally {
        writeFileSync(release, 'resume');
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited; }
        rmSync(temporary, { recursive: true, force: true });
    }
});

for (const signal of ['SIGINT', 'SIGTERM']) test(`live producer releases its initial writer lock before ${signal} shutdown`, async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-initial-stop-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, 'records.json'), '[{"id":"a","name":"Initial"}]');
    writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'Shutdown', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }] }));
    execFileSync('git', ['-C', root, 'add', '.']);
    const entered = join(temporary, 'entered'), release = join(temporary, 'release'), guard = join(temporary, 'guard.mjs');
    writeFileSync(guard, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const write=fs.writeFileSync;fs.writeFileSync=function(path,...args){const result=write.call(this,path,...args);if(String(path).endsWith('/writer.lock')){write(${JSON.stringify(entered)},'locked');const until=Date.now()+30000;while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()>until)throw Error('Lock fixture was not released');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}return result;};syncBuiltinESMExports();`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', chunk => stderr += chunk); child.stdout.resume();
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    try {
        for (let i = 0; !readdirSync(temporary).includes('entered'); i++) { assert.ok(i < 300, stderr); assert.equal(child.exitCode, null, stderr); await delay(50); }
        child.kill(signal); writeFileSync(release, 'finish');
        assert.deepEqual(await exited, { code: 0, signal: null });
        assert.equal(readdirSync(cache).includes('writer.lock'), false);
        assert.equal(readdirSync(cache).some(name => name.startsWith('serve-')), false);
    } finally {
        writeFileSync(release, 'finish');
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
        rmSync(temporary, { recursive: true, force: true });
    }
});

for (const fault of ['invalid input', 'worker failure', 'worker exit']) test(`live initial ${fault} fails closed and removes its temporary generation`, async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-failure-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.lattice/lens.json'), '{');
    const guard = join(temporary, 'guard.mjs');
    writeFileSync(guard, `import {isMainThread} from 'node:worker_threads';if(!isMainThread){${fault === 'worker failure' ? "throw Error('Producer failed fixture');" : fault === 'worker exit' ? 'process.exit(7);' : ''}}`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    try {
        assert.deepEqual(await exited, { code: 2, signal: null });
        assert.doesNotMatch(stdout, /"event":"ready"/u);
        assert.match(stdout + stderr, fault === 'worker failure' ? /Producer failed fixture/u : fault === 'worker exit' ? /exited unexpectedly/u : /lens\.json:1: expected an object key/u);
        assert.equal(readdirSync(cache).some(name => name.startsWith('serve-') || name === 'writer.lock'), false);
    } finally {
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
        rmSync(temporary, { recursive: true, force: true });
    }
});

for (const fault of ['failure', 'exit']) test(`live producer ${fault} after readiness closes the server and removes its generation`, async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-running-failure-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, 'records.json'), '[{"id":"a"}]');
    writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'Failure', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }] }));
    const armed = join(temporary, 'armed'), guard = join(temporary, 'guard.mjs');
    writeFileSync(guard, `import {isMainThread} from 'node:worker_threads';import {existsSync} from 'node:fs';if(!isMainThread)setInterval(()=>{if(existsSync(${JSON.stringify(armed)})){${fault === 'failure' ? "throw Error('Running producer failed fixture');" : 'process.exit(7);'}}},25).unref();`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    try {
        let ready;
        for (let i = 0; !ready; i++) { assert.ok(i < 300, stderr); assert.equal(child.exitCode, null, stderr); ready = stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'ready'); if (!ready) await delay(50); }
        assert.equal((await fetch(ready.url)).status, 200);
        writeFileSync(armed, 'fail');
        assert.deepEqual(await exited, { code: 2, signal: null });
        assert.match(stdout + stderr, fault === 'failure' ? /Running producer failed fixture/u : /exited unexpectedly/u);
        assert.equal(readdirSync(cache).some(name => name.startsWith('serve-') || name === 'writer.lock'), false);
        await assert.rejects(fetch(ready.url));
    } finally {
        if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
        rmSync(temporary, { recursive: true, force: true });
    }
});
