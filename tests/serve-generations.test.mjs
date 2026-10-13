import { createPackedLoader } from '../viewer/packed-data.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { detailIdentityKey } from '../dist/query/node-detail-transport.js';
import { logicLookupBucket } from '../dist/query/logic-model.js';
import { nodeIdentity } from '../dist/query/history-model.js';

test('live generations stream immutable disk artifacts, retain four versions and clean shutdown', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-disk-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    const source = join(root, 'records.json');
    writeFileSync(source, '[{"id":"a","name":"First"}]');
    writeFileSync(join(root, 'icon.png'), Buffer.from([0, 255, 3, 128]));
    writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'Test', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }], presentation: { media: { nodes: { a: 'icon.png' } } } }));
    execFileSync('git', ['-C', root, 'add', '.']);
    const guard = join(temporary, 'guard.mjs'), retiring = join(temporary, 'retiring'), retired = join(temporary, 'retired');
    writeFileSync(guard, `import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';const write=fs.writeFileSync;let changed=false;fs.writeFileSync=function(path,...args){const result=write.call(this,path,...args);if(!changed&&String(path).endsWith('/writer.lock')){changed=true;write(${JSON.stringify(source)},'[{'+'"id":"a","name":"Observed under lock"}]');}return result;};syncBuiltinESMExports();const original=JSON.stringify;JSON.stringify=function(value,...args){if(value?.schemaVersion===1&&value.hash&&Array.isArray(value.nodes)&&Array.isArray(value.edges))throw Error('whole graph serialization forbidden');return original.call(this,value,...args)};const remove=fs.rmSync;fs.rmSync=function(path,...args){if(String(path).includes('/serve-')&&String(path).endsWith('/1')){write(${JSON.stringify(retiring)},'retiring');const until=Date.now()+30000;while(!fs.existsSync(${JSON.stringify(retired)})){if(Date.now()>until)throw Error('Retirement fixture was not released');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,25);}}return remove.call(this,path,...args)};syncBuiltinESMExports();`);
    const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const until = async probe => { for (let i = 0; i < 300; i++) { const value = await probe(); if (value) return value; assert.equal(child.exitCode, null, stdout + stderr); await delay(50); } throw Error('Serve timeout: ' + stdout + stderr); };
    try {
        const ready = await until(() => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'ready'));
        const request = path => fetch(new URL(path, ready.url));
        const firstHtml = await (await request('index.html?generation=1')).text();
        assert.match(firstHtml, /asset-bootstrap\.js/u); assert.match(firstHtml, /lattice-generation" content="1"/u);
        assert.equal((await request('__lattice/live-client.js')).status, 200);
        assert.equal((await request('asset-bootstrap.js')).headers.get('content-type'), 'text/javascript');
        const assetManifest = await request('asset-archives/manifest.json?generation=1');
        assert.equal(assetManifest.status, 200); assert.equal(assetManifest.headers.get('content-type'), 'application/json');
        const initialAssetManifest = await assetManifest.json();

        const initial = await createPackedLoader(ready.url, '?generation=1').json('graph.json');
        assert.equal(initial.nodes[0].name, 'Observed under lock');
        const presentation = await (await request('presentation.json?generation=1')).json();
        const media = await request(presentation.mediaManifest.a.url);
        assert.equal(media.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await media.arrayBuffer()), Buffer.from([0, 255, 3, 128]));
        await delay(650);
        assert.equal((await (await request('__lattice/status')).json()).builds, 1);
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
            const html = await (await request(`index.html?generation=${revision}`)).text();
            assert.match(html, /asset-bootstrap\.js/u); assert.ok(html.includes(`lattice-generation" content="${revision}"`));
            assert.deepEqual(await (await request(`asset-archives/manifest.json?generation=${revision}`)).json(), initialAssetManifest);

            if (revision < 5) assert.equal((await (await request('graph.json?generation=1')).json()).hash, initial.hash);
        }
        await until(() => readdirSync(temporary).includes('retiring'));
        assert.equal((await (await request('__lattice/status')).json()).generation, '5');
        assert.equal((await request('graph.json?generation=1')).status, 503);
        assert.equal((await request('index.html?generation=1')).status, 503);
        writeFileSync(retired, 'published');
        await until(() => readdirSync(generations).length === 4);
        const head = await createPackedLoader(ready.url, '?generation=5').json('graph.json'); assert.equal(head.nodes[0].name, 'Revision 5');
        const bodyless = await fetch(new URL('graph.json?generation=5', ready.url), { method: 'HEAD' }); assert.equal(bodyless.status, 200); assert.equal(await bodyless.text(), '');
        child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null }); assert.equal(directories().length, 0);
    } finally { writeFileSync(retired, 'release'); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } rmSync(temporary, { recursive: true, force: true }); }
});

test('new clean live generations publish bounded node history for their new snapshots', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'lattice-serve-history-')), root = join(temporary, 'repo'), cache = join(temporary, 'cache');
    mkdirSync(join(root, '.lattice'), { recursive: true }); execFileSync('git', ['init', '-q', root]);
    const source = join(root, 'records.json');
    writeFileSync(source, '[{"id":"a","name":"First"}]');
    writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'History', kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }] }));
    const commit = () => { execFileSync('git', ['-C', root, 'add', '.']); execFileSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Record clean source']); return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); };
    const firstCommit = commit();
    const child = spawn(process.execPath, [resolve('bin/lattice.mjs'), 'serve', '--root', root, '--cache-dir', cache, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const until = async probe => { for (let i = 0; i < 300; i++) { const value = await probe(); if (value) return value; assert.equal(child.exitCode, null, stdout + stderr); await delay(50); } throw Error('Serve timeout: ' + stdout + stderr); };
    try {
        const ready = await until(() => stdout.split('\n').filter(Boolean).map(line => JSON.parse(line)).find(event => event.event === 'ready'));
        const loaders = new Map();
        const json = async (path, generation) => { if (path === 'graph.json' || path.startsWith('details/')) { if (!loaders.has(generation)) loaders.set(generation, createPackedLoader(ready.url, `?generation=${generation}`)); return loaders.get(generation).json(path); } const response = await fetch(new URL(`${path}?generation=${generation}`, ready.url)); assert.equal(response.status, 200, path); return response.json(); };
        const inspect = async (generation, expected) => {
            const snapshots = await json('snapshots.json', generation); assert.equal(snapshots.length, expected.size);
            for (const snapshot of snapshots) {
                const index = await json(`details/snapshots/${snapshot.id}/index.json`, generation);
                assert.equal(index.graphHash, snapshot.graphHash); assert.equal(index.repository.commit, snapshot.commit); assert.equal(index.repository.dirty, false);
                const graph = await json('graph.json', generation);
                const key = detailIdentityKey(nodeIdentity(graph.nodes[0]));
                const lookup = await json(`${index.lookupRoot}/${logicLookupBucket(key)}.json`, generation);
                const range = lookup.ranges.find(range => range.first <= key && range.last >= key); assert.ok(range);
                const record = async ref => { const parts = 'record' in ref ? [{ path: `${index.lookupRoot.replace(/\/lookup$/u, '')}/packets/${Math.floor(ref.record / 32)}.json`, key: String(ref.record) }] : ref.parts; const values = await Promise.all(parts.map(async part => { const packet = await json(part.path, generation); assert.equal(packet.graphHash, index.graphHash); assert.deepEqual(packet.repository, index.repository); assert.equal(packet.detailVersion, index.detailVersion); return packet.records[part.key]; })); if (index.detailVersion === 2) { assert.equal(values.length, 1); return values[0]; } return JSON.parse(values.join('')); };
                const mapping = await record(range.ref), reference = Array.isArray(mapping) ? mapping.find(row => row[0] === 1 && detailIdentityKey(JSON.stringify(row[1])) === key)?.[2] : mapping[key];
                assert.ok(reference); const detail = await record(reference);
                assert.equal(detail.graph.nodes[0].name, expected.get(snapshot.commit));
                assert.ok(detail.graph.nodes[0].sources.length);
            }
        };
        await inspect('1', new Map([[firstCommit, 'First']]));
        writeFileSync(source, '[{"id":"a","name":"Second"}]'); const secondCommit = commit();
        const changed = await until(async () => { const state = await json('__lattice/status', '1'); if (state.generation === '1') return; const overview = await json('overview.json', state.generation); return overview.repository.commit === secondCommit && !overview.repository.dirty && state; });
        await inspect(changed.generation, new Map([[firstCommit, 'First'], [secondCommit, 'Second']]));
        await inspect('1', new Map([[firstCommit, 'First']]));
        child.kill('SIGTERM'); assert.deepEqual(await exited, { code: 0, signal: null });
    } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } rmSync(temporary, { recursive: true, force: true }); }
});
