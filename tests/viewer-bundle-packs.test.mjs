import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { archiveModules, viewerArchivePlan } from '../tools/viewer-archives.mjs';

function unpack(plan) {
    return Buffer.concat(plan.packs.map(pack => {
        assert.ok(pack.bytes.length <= 262144);
        assert.equal(pack.bytes.length, pack.entry.encoded);
        assert.equal(createHash('sha256').update(pack.bytes).digest('hex'), pack.entry.hash);
        const decoded = gunzipSync(pack.bytes);
        assert.ok(decoded.length <= 262144);
        assert.equal(decoded.length, pack.entry.decoded);
        return decoded;
    }));
}

test('bundle plan chunks one executable script deterministically without splitting its UTF-8 interpretation', () => {
    const modules = [['app.js', `globalThis.text=${JSON.stringify('🌳나무'.repeat(45000))};export const value=1;`]];
    const plan = viewerArchivePlan(modules);
    assert.equal(plan.version, 2);
    assert.ok(plan.packs.length > 1);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(unpack(plan));
    assert.match(source, /🌳나무/u);
    assert.deepEqual(viewerArchivePlan(modules), plan);
    assert.doesNotMatch(source, /new Function|\beval\(/u);
});

test('unsupported bundle graph retains the exact legacy archive payload and metadata', () => {
    const modules = [
        ['app.js', 'import {value} from "./peer.js";export const read=()=>value;'],
        ['peer.js', 'import {read} from "./app.js";export const value=1;export const later=()=>read();'],
    ];
    const plan = viewerArchivePlan(modules);
    assert.equal(plan.version, 1);
    assert.deepEqual(plan.packs, archiveModules(modules));
});
