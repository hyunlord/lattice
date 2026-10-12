import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, statSync, statfsSync } from 'node:fs';
import type { BigIntStats } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SourceInput } from '../dist/index.js';
import { inside } from './inputs.mjs';
import { errorCode } from './types.mjs';
type PathWitness = { readonly leaf: string; readonly target: string | undefined; };
type Record = { readonly identity: string; readonly input: SourceInput; };
const identity = (value: BigIntStats): string => [value.dev, value.ino, value.size, value.mtimeNs, value.ctimeNs].join(':');
const localTypes = new Set([0x1an, 0xef53n, 0x9123683en]);
/** Local filesystem witnesses reuse previously hashed bytes, never a watcher or TTL. */
export class SourceObservationCache {
    private readonly directories = new Map<string, string>();
    private readonly external = new Map<string, string>();
    private readonly observed = new Map<string, PathWitness | undefined>();
    private readonly local: boolean;
    private readonly device: bigint;
    constructor(private readonly root: string, private readonly records = new Map<string, Record>()) { this.device = statSync(root, { bigint: true }).dev; this.local = localTypes.has(statfsSync(root, { bigint: true }).type); }
    fork() { return new SourceObservationCache(this.root, this.records); }
    readObservedText(path: string): string {
        const before = identity(statSync(path, { bigint: true })), text = readFileSync(path, 'utf8');
        if (identity(statSync(path, { bigint: true })) !== before) throw new Error('Source changed while reading configuration; retry the query');
        this.external.set(path, before);
        return text;
    }
    get mode(): 'metadata-witness' | 'content-hash' { return this.local ? 'metadata-witness' : 'content-hash'; }
    prune(paths: readonly string[]) { this.observed.clear(); this.directories.clear(); this.external.clear(); const keep = new Set(paths); for (const path of this.records.keys()) if (!keep.has(path)) this.records.delete(path); }
    verify() {
        for (const [path, absolute] of this.directories) if (realpathSync.native(path) !== absolute) throw new Error('Source directory changed during observation; retry the query');
        for (const [path, key] of this.external) if (identity(statSync(path, { bigint: true })) !== key) throw new Error('Configuration changed during observation; retry the query');
        for (const [path, key] of this.observed) {
            let current: PathWitness | undefined;
            try {
                const requested = join(this.root, path), leaf = lstatSync(requested, { bigint: true });
                current = { leaf: identity(leaf), target: undefined };
                const target = leaf.isSymbolicLink() ? statSync(requested, { bigint: true }) : leaf;
                current = { leaf: current.leaf, target: identity(target) };
            } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
            if (current?.leaf === key?.leaf && current?.target === key?.target) continue;
            this.records.delete(path);
            throw new Error('Source changed across observation; retry the query');
        }
    }
    read(path: string, oversized: (bytes: number) => never): SourceInput | undefined {
        const requested = join(this.root, path);
        let leafIdentity: string | undefined;
        try {
            const parent = dirname(requested);
            if (!this.directories.has(parent)) {
                const absolute = realpathSync.native(parent);
                if (!inside(this.root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
                this.directories.set(parent, absolute);
            }
            const leaf = lstatSync(requested, { bigint: true });
            leafIdentity = identity(leaf);
            if (leaf.isSymbolicLink() && !inside(this.root, realpathSync.native(requested))) throw new Error(`Input resolves outside repository: ${path}`);
            const before = leaf.isSymbolicLink() ? statSync(requested, { bigint: true }) : leaf, key = identity(before);
            const witness = { leaf: leafIdentity, target: key };
            this.observed.set(path, witness);
            if (!before.isFile()) { this.records.delete(path); return undefined; }
            if (before.size > 10n * 1024n * 1024n) return oversized(Number(before.size));
            const cached = this.records.get(path);
            const reusable = this.local && before.dev === this.device && before.ctimeNs % 1000000000n !== 0n;
            let input: SourceInput;
            if (reusable && cached?.identity === key) input = cached.input;
            else {
                const absolute = realpathSync.native(requested);
                if (!inside(this.root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
                const descriptor = openSync(absolute, 'r');
                try {
                    if (identity(fstatSync(descriptor, { bigint: true })) !== key) throw new Error('Source changed before reading; retry the query');
                    const text = readFileSync(descriptor, 'utf8');
                    if (identity(fstatSync(descriptor, { bigint: true })) !== key) throw new Error('Source changed while reading; retry the query');
                    input = { path, text, contentHash: createHash('sha256').update(text).digest('hex') };
                } finally { closeSync(descriptor); }
            }
            if ((!reusable || cached?.identity !== key) && identity(statSync(requested, { bigint: true })) !== key) throw new Error('Source changed during observation; retry the query');
            this.records.set(path, { identity: key, input });
            this.observed.set(path, witness);
            return input;
        } catch (error) {
            this.records.delete(path);
            if (errorCode(error) === 'ENOENT') { this.observed.set(path, leafIdentity === undefined ? undefined : { leaf: leafIdentity, target: undefined }); return undefined; }
            throw error;
        }
    }
}
