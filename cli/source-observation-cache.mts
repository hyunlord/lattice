import { createHash } from 'node:crypto';
import { closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, statSync, statfsSync } from 'node:fs';
import { identity, sameIdentity } from './input-witness.mjs';
import type { Identity } from './input-witness.mjs';
import { SourceDirectoryObservation } from './source-directory-observation.mjs';
import { dirname, join } from 'node:path';
import type { SourceInput } from '../dist/index.js';
import { inside } from './inputs.mjs';
import { errorCode } from './types.mjs';
type PathWitness = { readonly leaf: Identity; readonly target: Identity | undefined; };
type Record = { readonly identity: Identity; readonly input: SourceInput; readonly requested: string; readonly parent: string; readonly witness: PathWitness; };
function pathWitness(path: string): PathWitness | undefined {
    let current: PathWitness | undefined;
    try {
        const leaf = lstatSync(path, { bigint: true });
        current = { leaf, target: leaf.isSymbolicLink() ? undefined : leaf };
        if (leaf.isSymbolicLink()) current = { leaf, target: statSync(path, { bigint: true }) };
    } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
    return current;
}
function matchesPathWitness(path: string, witness: PathWitness | undefined): boolean {
    let leaf: Identity | undefined, target: Identity | undefined;
    try {
        const current = lstatSync(path, { bigint: true });
        leaf = current;
        target = current.isSymbolicLink() ? statSync(path, { bigint: true }) : current;
    } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
    return sameIdentity(leaf, witness?.leaf) && sameIdentity(target, witness?.target);
}
const localTypes = new Set([0x1an, 0xef53n, 0x9123683en]);
/** Local filesystem witnesses reuse previously hashed bytes, never a watcher or TTL. */
export class SourceObservationCache {
    private readonly directories: SourceDirectoryObservation;
    private readonly external = new Map<string, Identity>();
    private readonly configurationPaths = new Map<string, PathWitness | undefined>();
    private readonly observed = new Map<string, PathWitness | undefined>();
    private readonly local: boolean;
    private readonly device: bigint;
    constructor(private readonly root: string, private readonly records = new Map<string, Record>()) { this.device = statSync(root, { bigint: true }).dev; this.local = localTypes.has(statfsSync(root, { bigint: true }).type); this.directories = new SourceDirectoryObservation(root, this.local, this.device); }
    fork() { return new SourceObservationCache(this.root, this.records); }
    observePaths(paths: readonly string[]) {
        for (const path of paths) if (!this.configurationPaths.has(path)) this.configurationPaths.set(path, pathWitness(path));
    }
    readObservedText(path: string): string {
        this.observePaths([path]);
        const before = identity(statSync(path, { bigint: true })), text = readFileSync(path, 'utf8');
        if (!sameIdentity(statSync(path, { bigint: true }), before)) throw new Error('Source changed while reading configuration; retry the query');
        this.external.set(path, before);
        return text;
    }
    get mode(): 'metadata-witness' | 'content-hash' { return this.local ? 'metadata-witness' : 'content-hash'; }
    prune(paths: readonly string[]) { this.observed.clear(); this.directories.clear(); this.external.clear(); this.configurationPaths.clear(); const keep = new Set(paths); for (const path of this.records.keys()) if (!keep.has(path)) this.records.delete(path); }
    verify() {
        for (const [path, witness] of this.configurationPaths) if (!matchesPathWitness(path, witness)) throw new Error('Configuration paths changed during observation; retry the query');
        for (const [path, key] of this.external) if (!sameIdentity(statSync(path, { bigint: true }), key)) throw new Error('Configuration changed during observation; retry the query');
        for (const [path, key] of this.observed) {
            if (matchesPathWitness(this.records.get(path)?.requested ?? join(this.root, path), key)) continue;
            this.records.delete(path);
            throw new Error('Source changed across observation; retry the query');
        }
        this.directories.verify();
    }
    read(path: string, oversized: (bytes: number) => never): SourceInput | undefined {
        const cached = this.records.get(path), requested = cached?.requested ?? join(this.root, path);
        let leafIdentity: Identity | undefined;
        try {
            const parent = cached?.parent ?? dirname(requested);
            if (!this.directories.containsResolved(parent)) throw new Error(`Input resolves outside repository: ${path}`);
            const leaf = lstatSync(requested, { bigint: true });
            leafIdentity = cached && sameIdentity(cached.witness.leaf, leaf) ? cached.witness.leaf : identity(leaf);
            if (leaf.isSymbolicLink() && !inside(this.root, realpathSync.native(requested))) throw new Error(`Input resolves outside repository: ${path}`);
            const before = leaf.isSymbolicLink() ? statSync(requested, { bigint: true }) : leaf, key = before === leaf ? leafIdentity : cached && sameIdentity(cached.identity, before) ? cached.identity : identity(before);
            const witness = cached && cached.witness.leaf === leafIdentity && cached.witness.target === key ? cached.witness : { leaf: leafIdentity, target: key };
            this.observed.set(path, witness);
            if (!before.isFile()) { this.records.delete(path); return undefined; }
            if (before.size > 10n * 1024n * 1024n) return oversized(Number(before.size));
            const reusable = this.local && before.dev === this.device && before.ctimeNs % 1000000000n !== 0n;
            let input: SourceInput;
            if (reusable && cached && sameIdentity(cached.identity, key)) input = cached.input;
            else {
                const absolute = realpathSync.native(requested);
                if (!inside(this.root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
                const descriptor = openSync(absolute, 'r');
                try {
                    if (!sameIdentity(fstatSync(descriptor, { bigint: true }), key)) throw new Error('Source changed before reading; retry the query');
                    const text = readFileSync(descriptor, 'utf8');
                    if (!sameIdentity(fstatSync(descriptor, { bigint: true }), key)) throw new Error('Source changed while reading; retry the query');
                    input = { path, text, contentHash: createHash('sha256').update(text).digest('hex') };
                } finally { closeSync(descriptor); }
            }
            if ((!reusable || !sameIdentity(cached?.identity, key)) && !sameIdentity(statSync(requested, { bigint: true }), key)) throw new Error('Source changed during observation; retry the query');
            if (cached?.witness !== witness || cached?.input !== input) this.records.set(path, { identity: key, input, requested, parent, witness });
            return input;
        } catch (error) {
            this.records.delete(path);
            if (errorCode(error) === 'ENOENT') { this.observed.set(path, leafIdentity === undefined ? undefined : { leaf: leafIdentity, target: undefined }); return undefined; }
            throw error;
        }
    }
}
