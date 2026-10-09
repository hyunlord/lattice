import { errorCode, errorStatus } from './types.mjs';
import type { RepositoryReader } from './types.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { inside } from './inputs.mjs';

export function git(root: string, args: readonly string[]) {
    return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
}
function optionalGit(root: string, args: readonly string[]) {
    try { return git(root, args).trimEnd(); }
    catch (error) { if (errorStatus(error) === 1 || errorStatus(error) === 128) return ''; throw error; }
}
function identity(root: string) {
    git(root, ['rev-parse', '--show-toplevel']);
    const origin = optionalGit(root, ['config', '--get', 'remote.origin.url']);
    const github = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(origin)?.[1];
    return { name: github?.split('/').at(-1) ?? basename(root), ...(github ? { remoteUrl: `https://github.com/${github}` } : {}) };
}
export function workingRepository(root: string, cacheDir?: string): RepositoryReader {
    const commit = optionalGit(root, ['rev-parse', '--verify', 'HEAD']);
    const cachePath = cacheDir && inside(root, cacheDir) ? relative(root, cacheDir).split(sep).join('/') : undefined;
    const cacheExclusion = cachePath ? [`:(exclude,literal)${cachePath}`] : [];
    return {
        ...identity(root), ...(commit ? { commit } : {}),
        dirty: git(root, ['status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude).lattice/cache', ':(exclude).lattice/site', ...cacheExclusion]).trimEnd() !== '',
        paths: [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(path => path && (!cachePath || (path !== cachePath && !path.startsWith(cachePath + '/')))))].sort(),
        readText(path) {
            let absolute;
            try { absolute = realpathSync(join(root, path)); }
            catch (error) { if (errorCode(error) === 'ENOENT') return undefined; throw error; }
            if (!inside(root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
            const info = statSync(absolute);
            if (!info.isFile()) return undefined;
            if (info.size > 10 * 1024 * 1024) throw new Error(`Input exceeds 10 MiB: ${path}`);
            return readFileSync(absolute, 'utf8');
        },
    };
}
export function historicalRepository(root: string, ref?: string): RepositoryReader {
    if (!ref || ref.startsWith('-')) throw new Error('diff requires a valid commit reference');
    const commit = git(root, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit)) throw new Error('Git returned an invalid commit identity');
    if (realpathSync(git(root, ['rev-parse', '--show-toplevel']).trimEnd()) !== root) throw new Error('diff --root must name the repository root');
    const blobs = new Map<string, { mode: string; id: string; }>();
    for (const entry of git(root, ['ls-tree', '-r', '-z', '--full-tree', commit]).split('\0').filter(Boolean)) {
        const match = /^(100644|100755|120000) blob ([a-f0-9]+)\t([\s\S]+)$/u.exec(entry);
        if (match?.[1] && match[2] && match[3]) blobs.set(match[3], { mode: match[1], id: match[2] });
    }
    return {
        ...identity(root), commit, dirty: false, paths: [...blobs.keys()].sort(),
        readText(path) {
            const object = blobs.get(path);
            if (!object) return undefined;
            if (object.mode === '120000') throw new Error(`Historical symbolic link input is not supported: ${path}`);
            const size = Number(git(root, ['cat-file', '-s', object.id]));
            if (size > 10 * 1024 * 1024) throw new Error(`Input exceeds 10 MiB: ${path}`);
            return git(root, ['cat-file', 'blob', object.id]);
        },
    };
}
