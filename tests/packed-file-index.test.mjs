import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createServer } from 'node:http';
import { createPackedExport } from '../bin/export-packs.mjs';
import { readPackedArtifact } from '../bin/packed-reader.mjs';
import { createPackedLoader } from '../viewer/packed-data.js';

const bucket = path => { let value = 0; for (const char of path) value = (value * 31 + char.codePointAt(0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); };
async function fixture(t) {
    const directory = mkdtempSync(join(tmpdir(), 'lattice-inline-index-')), requests = [];
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const server = createServer((request, response) => {
        requests.push(request.url);
        const url = new URL(request.url, 'http://fixture');
        if (!url.pathname.startsWith('/sub/')) { response.writeHead(404).end(); return; }
        try { response.writeHead(200, { 'Cache-Control': 'no-store' }).end(readFileSync(join(directory, url.pathname.slice(5)))); }
        catch { response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const root = path => `transport/files-${bucket(path)}.json.gz`;
    const read = path => JSON.parse(gunzipSync(readFileSync(join(directory, path))));
    const write = (path, value) => writeFileSync(join(directory, path), gzipSync(JSON.stringify(value), { level: 9 }));
    return { directory, requests, root, read, write, loader: () => createPackedLoader(`http://127.0.0.1:${server.address().port}/sub/`, '?generation=7') };
}

test('single-page indexes inline exact records and remove one lookup request without losing provenance', async t => {
    const f = await fixture(t), writer = createPackedExport(f.directory);
    const value = { name: '한글😀', sources: [{ path: 'src/a.ts', line: 3, revision: 'old' }], nested: { value: 7 } };
    writer.json('one.json', value); writer.finish();
    const root = f.read(f.root('one.json'));
    assert.ok(Array.isArray(root.files), 'single-page bucket must inline rows');
    assert.equal(readdirSync(join(f.directory, 'transport')).some(name => /^files-..-\d/.test(name)), false);
    assert.deepEqual(readPackedArtifact(f.directory, 'one.json'), value);
    const loader = f.loader();
    assert.deepEqual(await loader.json('one.json'), value);
    assert.deepEqual(await loader.json('one.json', { sources: true, nested: { value: true } }), { sources: value.sources, nested: value.nested });
    assert.equal(f.requests.filter(path => path.includes('/files-')).length, 1);
    assert.ok(f.requests.every(path => path.startsWith('/sub/') && path.endsWith('?generation=7')));
    await assert.rejects(loader.json('absent.json'), /404/);
    assert.throws(() => readPackedArtifact(f.directory, 'absent.json'), /missing/);
});

for (const zipped of [true, false]) test(`legacy ${zipped ? 'gzip' : 'plain'} ranged indexes still reconstruct exact values`, async t => {
    const f = await fixture(t), writer = createPackedExport(f.directory), value = { original: ['r', 1, 2], sources: [{ revision: 'snapshot' }] };
    writer.json('one.json', value); writer.finish();
    const rootPath = f.root('one.json'), root = f.read(rootPath);
    const rows = root.files ?? f.read(root[0].path), leaf = `transport/files-${bucket('one.json')}-0.json`;
    if (zipped) { f.write(leaf + '.gz', rows); f.write(rootPath, [{ first: 'one.json', last: 'one.json', path: leaf + '.gz' }]); }
    else {
        for (const name of readdirSync(join(f.directory, 'transport'))) if (name.endsWith('.gz')) writeFileSync(join(f.directory, 'transport', name.slice(0, -3)), gunzipSync(readFileSync(join(f.directory, 'transport', name))));
        writeFileSync(join(f.directory, leaf), JSON.stringify(rows));
        writeFileSync(join(f.directory, rootPath.slice(0, -3)), JSON.stringify([{ first: 'one.json', last: 'one.json', path: leaf }]));
        const manifest = JSON.parse(readFileSync(join(f.directory, 'transport.json'))); delete manifest.indexEncoding;
        writeFileSync(join(f.directory, 'transport.json'), JSON.stringify(manifest));
    }
    assert.deepEqual(await f.loader().json('one.json'), value);
    assert.deepEqual(readPackedArtifact(f.directory, 'one.json'), value);
});

test('large same-bucket indexes retain bounded ranged pages and sorted boundary lookups', async t => {
    const f = await fixture(t), writer = createPackedExport(f.directory);
    const paths = Array.from({ length: 270 }, (_, index) => 'x'.repeat(900) + index.toString(2).padStart(9, '0').replaceAll('0', 'Aa').replaceAll('1', 'BB') + '.json');
    assert.equal(new Set(paths.map(bucket)).size, 1);
    paths.forEach((path, index) => writer.json(path, { index })); writer.finish();
    const ranges = f.read(f.root(paths[0])); assert.ok(Array.isArray(ranges) && ranges.length > 1);
    const loader = f.loader();
    for (const range of ranges) for (const path of [range.first, range.last]) {
        assert.deepEqual(await loader.json(path), { index: paths.indexOf(path) });
        assert.deepEqual(readPackedArtifact(f.directory, path), { index: paths.indexOf(path) });
    }
    for (const dir of ['transport', 'packs']) for (const name of readdirSync(join(f.directory, dir))) {
        const bytes = readFileSync(join(f.directory, dir, name)); assert.ok(bytes.length <= 262144); assert.ok(gunzipSync(bytes).length <= 262144);
    }
});

test('invalid inline indexes and references reject, and failed downloads remain retryable', async t => {
    const f = await fixture(t), writer = createPackedExport(f.directory);
    writer.json('one.json', { ok: true }); writer.finish();
    const path = f.root('one.json'), original = readFileSync(join(f.directory, path));
    const validRows = f.read(path).files;
    for (const invalid of [{ files: 'wrong' }, { files: [['one.json']] }, { files: [['one.json', ['r', -1, 0]]] }, { files: [...validRows, ...validRows] }, { files: validRows, ranges: [] }, { files: [...validRows, [7, ['r', 0, 0]]] }]) {
        f.write(path, invalid);
        await assert.rejects(f.loader().json('one.json'));
        assert.throws(() => readPackedArtifact(f.directory, 'one.json'));
    }
    writeFileSync(join(f.directory, path), 'not gzip'); const loader = f.loader();
    await assert.rejects(loader.json('one.json'));
    writeFileSync(join(f.directory, path), original);
    assert.deepEqual(await loader.json('one.json'), { ok: true });
});

test('inline wrapper bytes determine the page boundary and oversized input remains rejected', async t => {
    for (const extra of [0, 1]) {
        const f = await fixture(t), writer = createPackedExport(f.directory);
        const rowBytes = length => Buffer.byteLength(JSON.stringify({ files: [['x'.repeat(length) + 'Aa.json', ['r', 0, 0]], ['x'.repeat(length) + 'BB.json', ['r', 0, 0]]] }));
        const length = Math.floor((240000 - rowBytes(0)) / 2) + extra;
        const paths = ['Aa', 'BB'].map(tail => 'x'.repeat(length) + tail + '.json');
        paths.forEach(path => writer.json(path, null)); writer.finish();
        const index = f.read(f.root(paths[0]));
        assert.equal(Array.isArray(index), extra === 1);
        if (!extra) assert.ok(Buffer.byteLength(JSON.stringify(index)) <= 240000);
        for (const path of paths) { assert.equal(await f.loader().json(path), null); assert.equal(readPackedArtifact(f.directory, path), null); }
    }
    const f = await fixture(t), writer = createPackedExport(f.directory);
    writer.json('one.json', null); writer.finish();
    f.write(f.root('one.json'), { files: [], padding: 'x'.repeat(262144) });
    await assert.rejects(f.loader().json('one.json'), /byte limit/);
    assert.throws(() => readPackedArtifact(f.directory, 'one.json'));
    writeFileSync(join(f.directory, f.root('one.json')), Buffer.alloc(262145));
    await assert.rejects(f.loader().json('one.json'), /byte limit/);
    assert.throws(() => readPackedArtifact(f.directory, 'one.json'), /byte limit/);
});
