import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const digest = n => { const bytes = Buffer.alloc(32, 73); bytes.writeUInt32LE(n, 28); return bytes; };
test('exact digest index preserves all bits, zero references, updates, and growth', async () => {
    const { DigestIndex } = await import('../bin/export-digest-index.mjs');
    const index = new DigestIndex();
    for (let n = 0; n < 4000; n++) index.set(digest(n), n * 262144);
    assert.equal(index.size, 4000);
    for (let n = 0; n < 4000; n++) assert.equal(index.get(digest(n)), n * 262144);
    assert.equal(index.get(digest(4000)), undefined);
    const single = new DigestIndex(); single.set(digest(0), 0);
    for (let byte = 0; byte < 32; byte++) { const changed = digest(0); changed[byte] ^= 128; assert.equal(single.get(changed), undefined); }
    index.set(digest(0), Number.MAX_SAFE_INTEGER);
    assert.equal(index.get(digest(0)), Number.MAX_SAFE_INTEGER);
    assert.equal(index.size, 4000);
    assert.throws(() => index.set(Buffer.alloc(31), 0));
    assert.throws(() => index.get(Buffer.alloc(33)));
    assert.throws(() => index.set(digest(0), -1));
    index.clear(); assert.equal(index.size, 0); assert.equal(index.get(digest(0)), undefined);
    index.set(digest(0), 0); assert.equal(index.get(digest(0)), 0);
});
test('one million retained digests leave a bounded JavaScript heap', () => {
    const script = `import { DigestIndex } from './bin/export-digest-index.mjs';
const index = new DigestIndex(); const key = Buffer.alloc(32);
for (let n=0;n<1000000;n++) { key.writeUInt32LE(n,0); key.writeUInt32LE(n ^ 0x12345678,28); index.set(key,n); }
for (let n=0;n<1000000;n++) { key.writeUInt32LE(n,0); key.writeUInt32LE(n ^ 0x12345678,28); if(index.get(key)!==n) throw Error('Lost digest'); }
console.log(index.size);`;
    const result = spawnSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '-e', script], { cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout.trim(), '1000000');
});
