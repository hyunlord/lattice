import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMediaAssets } from '../bin/assets.mjs';
import { parseMediaReference } from '../dist/query/media-model.js';

const node = (id, attributes = {}) => ({ id, attributes });
test('local atlas reference retains crop metadata and deduplicates exported image bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-media-'));
    try {
        mkdirSync(join(root, 'art'));
        writeFileSync(join(root, 'art/sheet.png'), Buffer.from('image fixture'));
        const frame = { x: 3, y: 4, width: 16, height: 20 };
        const result = resolveMediaAssets(root, [node('one'), node('two')], { nodes: { one: { path: 'art/sheet.png', frame }, two: 'art/sheet.png' } });
        assert.equal(result.files.length, 1);
        assert.deepEqual(result.manifest.one.frame, frame);
        assert.equal(result.manifest.one.status, 'available');
        assert.match(result.manifest.one.url, /^media\/[a-f0-9]{64}\.png$/u);
        assert.equal(result.manifest.one.url, result.manifest.two.url);
        assert.equal(result.files[0].bytes.toString(), 'image fixture');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
test('missing images and symlinks escaping the source root produce evidence without publishing bytes', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-media-'));
    const outside = mkdtempSync(join(tmpdir(), 'lattice-media-outside-'));
    try {
        writeFileSync(join(outside, 'outside.png'), 'outside');
        symlinkSync(outside, join(root, 'escape'));
        const result = resolveMediaAssets(root, [node('missing'), node('escape'), node('parent'), node('remote')], { nodes: { missing: 'missing.png', escape: 'escape/outside.png', parent: '../outside.png', remote: 'https://example.com/a.png' } });
        assert.equal(result.files.length, 0);
        assert(Object.values(result.manifest).every(entry => entry.status === 'missing'));
        assert.match(result.manifest.escape.reason, /outside/u);
        assert.match(result.manifest.missing.reason, /not found/u);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
test('image content hashes change with bytes and malformed atlas dimensions are rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-media-'));
    try {
        writeFileSync(join(root, 'icon.png'), 'first');
        const config = { field: 'icon' }, nodes = [node('icon', { icon: 'icon.png' })];
        const first = resolveMediaAssets(root, nodes, config);
        writeFileSync(join(root, 'icon.png'), 'second');
        const second = resolveMediaAssets(root, nodes, config);
        assert.notEqual(first.manifest.icon.sourceHash, second.manifest.icon.sourceHash);
        assert.equal(parseMediaReference({ path: 'icon.png', frame: { x: 0, y: 0, width: -1, height: 1 } }), undefined);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unfetched Git LFS image pointers are unavailable instead of exported as broken images', () => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-media-lfs-'));
    try {
        writeFileSync(join(root, 'atlas.png'), `version https://git-lfs.github.com/spec/v1\noid sha256:${'a'.repeat(64)}\nsize 735523\n`);
        const result = resolveMediaAssets(root, [node('atlas')], { nodes: { atlas: 'atlas.png' } });
        assert.equal(result.files.length, 0);
        assert.equal(result.manifest.atlas.status, 'missing');
        assert.match(result.manifest.atlas.reason, /Git LFS.*checkout/u);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
