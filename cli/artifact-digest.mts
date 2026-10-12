import { createHash } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { open, stat, statfs } from 'node:fs/promises';
import { errorCode } from './types.mjs';
type Witness = { readonly identity: string; readonly digest: string; };
const identity = (value: BigIntStats): string => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
// Local APFS, ext and Btrfs update ctime on byte writes, including restored mtime.
// Unknown/network filesystems always read bytes; no TTL or watcher grants freshness.
const localTypes = new Set([0x1an, 0xef53n, 0x9123683en]);
export class ArtifactDigests {
    private readonly previous = new Map<string, Witness>();
    async digest(path: string): Promise<string> {
        try {
            const handle = await open(path, 'r');
            try {
                const before = await handle.stat({ bigint: true }), key = identity(before);
                const filesystem = await statfs(path, { bigint: true });
                const reusable = localTypes.has(filesystem.type) && before.ctimeNs % 1000000000n !== 0n;
                const cached = this.previous.get(path);
                let digest: string;
                if (reusable && cached?.identity === key) digest = cached.digest;
                else {
                    const hash = createHash('sha256');
                    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
                    digest = hash.digest('hex');
                }
                const after = await handle.stat({ bigint: true }), current = await stat(path, { bigint: true });
                if (identity(after) !== key || identity(current) !== key) throw new Error('Cache artifact changed during verification; retry the query');
                this.previous.set(path, { identity: key, digest });
                return digest;
            } finally { await handle.close(); }
        } catch (error) {
            this.previous.delete(path);
            if (errorCode(error) === 'ENOENT') return '';
            throw error;
        }
    }
}
