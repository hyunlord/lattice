import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { identity, sameIdentity } from './input-witness.mjs';
import type { Identity } from './input-witness.mjs';
import { errorCode } from './types.mjs';
import { inside } from './inputs.mjs';
type Directory = { readonly path: string; readonly witness: Identity; readonly resolved: string; readonly native: boolean; };
// Ancestor resolution is shared only inside one observation, never between queries.
export class SourceDirectoryObservation {
    private readonly directories = new Map<string, Directory>();
    private readonly ordered: Directory[] = [];
    private readonly absent = new Set<string>();
    constructor(private readonly root: string, private readonly local: boolean, private readonly device: bigint) { }
    clear() { this.directories.clear(); this.ordered.length = 0; this.absent.clear(); }
    resolve(path: string): string { return this.read(path).resolved; }
    private read(path: string): Directory {
        const cached = this.directories.get(path);
        if (cached) return cached;
        const parent = path === this.root || !inside(this.root, path) ? undefined : this.read(dirname(path));
        try {
            const stat = lstatSync(path, { bigint: true });
            const native = parent?.native === true || !this.local || stat.dev !== this.device || stat.ctimeNs % 1000000000n === 0n || !stat.isDirectory();
            const resolved = !parent || native ? realpathSync.native(path) : join(parent.resolved, basename(path));
            const entry = { path, witness: identity(stat), resolved, native: native || (!parent && resolved !== path) };
            this.directories.set(path, entry); this.ordered.push(entry);
            return entry;
        } catch (error) { if (errorCode(error) === 'ENOENT') this.absent.add(path); throw error; }
    }
    verify() {
        for (const path of this.absent) {
            try { lstatSync(path, { bigint: true }); } catch (error) { if (errorCode(error) === 'ENOENT') continue; throw error; }
            throw new Error('Source directory changed during observation; retry the query');
        }
        for (let index = this.ordered.length - 1; index >= 0; index--) {
            const directory = this.ordered[index];
            if (!directory) continue;
            const { path } = directory;
            let current: Identity | undefined;
            try { current = lstatSync(path, { bigint: true }); } catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
            if (!sameIdentity(current, directory.witness) || (directory.native && realpathSync.native(path) !== directory.resolved)) throw new Error('Source directory changed during observation; retry the query');
        }
    }
}
