import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { inside } from './inputs.mjs';
import { dirname, join } from 'node:path';
import { errorCode } from './types.mjs';

// Git status applies configured clean/process filters. Read index/object identities and hash raw bytes instead.
export function readOnlyMetadata(root: string, git: (args: readonly string[]) => string, verify = true) {
    const staged = git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean);
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
    const paths = new Set<string>(untracked);
    if (!verify) {
        for (const entry of staged) { const tab = entry.indexOf('\t'); if (tab < 0) throw new Error('Invalid Git index entry'); paths.add(entry.slice(tab + 1)); }
        return { status: '1 unverified-inventory\0', paths: [...paths].sort().join('\0') };
    }
    let dirty = untracked.length > 0;
    let commit: string | undefined;
    try { commit = git(['rev-parse', '--verify', 'HEAD']).trim(); }
    catch (error) { if (error !== null && typeof error === 'object' && 'status' in error && error.status === 128) dirty = true; else throw error; }
    const tree = new Map<string, string>();
    if (commit) for (const entry of git(['ls-tree', '-r', '-z', 'HEAD']).split('\0')) {
        const match = /^(\d+) (?:blob|commit) ([a-f0-9]+)\t([\s\S]+)$/u.exec(entry);
        if (match?.[1] && match[2] && match[3]) tree.set(match[3], `${match[1]} ${match[2]}`);
    }
    for (const entry of staged) {
        const match = /^(\d+) ([a-f0-9]+) (\d+)\t([\s\S]+)$/u.exec(entry);
        if (!match?.[1] || !match[2] || !match[3] || !match[4]) throw new Error('Invalid Git index entry');
        const [, mode, oid, stage, path] = match;
        if (!mode || !oid || !stage || !path) throw new Error('Incomplete Git index entry');
        paths.add(path);
        if (stage !== '0' || tree.get(path) !== `${mode} ${oid}`) dirty = true;
        tree.delete(path);
        try {
            const absolute = join(root, path);
            if (!inside(root, realpathSync(dirname(absolute)))) throw new Error(`Input resolves outside repository: ${path}`);
            const info = lstatSync(absolute);
            if (mode === '160000' || info.size > 10 * 1024 * 1024 || (!info.isFile() && !info.isSymbolicLink())) { dirty = true; continue; }
            const bytes = info.isSymbolicLink() ? Buffer.from(readlinkSync(absolute)) : readFileSync(absolute);
            const observedMode = info.isSymbolicLink() ? '120000' : info.mode & 0o111 ? '100755' : '100644';
            const hash = createHash(oid.length === 64 ? 'sha256' : 'sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
            if (hash !== oid || observedMode !== mode) dirty = true;
        } catch (error) { if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') dirty = true; else throw error; }
    }
    if (tree.size) dirty = true;
    const status = `${commit ? `# branch.oid ${commit}\0` : ''}${dirty ? '1 raw-content-change\0' : ''}`;
    return { status, paths: [...paths].sort().join('\0') };
}
