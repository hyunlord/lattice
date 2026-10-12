import type { SourceObservationCache } from './source-observation-cache.mjs';
import { errorCode, errorStatus } from './types.mjs';
import type { RepositoryReader } from './types.mjs';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, join, posix, relative, sep } from 'node:path';
import { promisify } from 'node:util';
import { inside } from './inputs.mjs';

export class InputSizeError extends Error {
    constructor(readonly path: string, readonly bytes: number) {
        super(`Input exceeds 10 MiB: ${path}`);
        this.name = 'InputSizeError';
    }
}

export function git(root: string, args: readonly string[]) {
    return execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
}
function optionalGit(root: string, args: readonly string[]) {
    try { return git(root, args).trimEnd(); }
    catch (error) { if (errorStatus(error) === 1 || errorStatus(error) === 128) return ''; throw error; }
}
function identity(root: string, origin = optionalGit(root, ['config', '--get', 'remote.origin.url'])) {
    const github = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/u.exec(origin)?.[1];
    return { name: github?.split('/').at(-1) ?? basename(root), ...(github ? { remoteUrl: `https://github.com/${github}` } : {}) };
}
function workingCommands(root: string, cacheDir?: string) {
    const cachePath = cacheDir && inside(root, cacheDir) ? relative(root, cacheDir).split(sep).join('/') : undefined;
    return {
        cachePath,
        status: ['status', '--porcelain=v2', '-z', '--branch', '--no-ahead-behind', '--untracked-files=all', '--', '.', ':(exclude).lattice/cache', ':(exclude).lattice/site', ...(cachePath ? [`:(exclude,literal)${cachePath}`] : [])],
        paths: ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
        origin: ['config', '--get', 'remote.origin.url'],
    };
}
function workingReader(root: string, cachePath: string | undefined, statusText: string, pathText: string, origin: string, cache?: SourceObservationCache): RepositoryReader {
    const status = statusText.split('\0').filter(Boolean);
    const oid = status.find(entry => entry.startsWith('# branch.oid '))?.slice('# branch.oid '.length);
    const commit = oid === '(initial)' ? undefined : oid;
    return {
        ...identity(root, origin), ...(commit ? { commit } : {}),
        dirty: status.some(entry => !entry.startsWith('# ')),
        paths: [...new Set(pathText.split('\0').filter(path => path && (!cachePath || (path !== cachePath && !path.startsWith(cachePath + '/')))))].sort(),
        ...(cache ? { readObservedText: (path: string) => cache.readObservedText(path), readInput: (path: string) => cache.read(path, bytes => { throw new InputSizeError(path, bytes); }), observationMode: cache.mode } : {}),
        readText(path) {
            if (cache) return cache.read(path, bytes => { throw new InputSizeError(path, bytes); })?.text;
            let absolute;
            try { absolute = realpathSync(join(root, path)); }
            catch (error) { if (errorCode(error) === 'ENOENT') return undefined; throw error; }
            if (!inside(root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
            const info = statSync(absolute);
            if (!info.isFile()) return undefined;
            if (info.size > 10 * 1024 * 1024) throw new InputSizeError(path, info.size);
            return readFileSync(absolute, 'utf8');
        },
    };
}
export function workingRepository(root: string, cacheDir?: string): RepositoryReader {
    const commands = workingCommands(root, cacheDir);
    return workingReader(root, commands.cachePath, git(root, commands.status), git(root, commands.paths), optionalGit(root, commands.origin));
}
const executeGit = promisify(execFile);
async function gitAsync(root: string, args: readonly string[]) {
    const { stdout } = await executeGit('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return stdout;
}
export async function workingRepositoryAsync(root: string, cacheDir?: string, cache?: SourceObservationCache): Promise<RepositoryReader> {
    const commands = workingCommands(root, cacheDir);
    const origin = gitAsync(root, commands.origin).then(value => value.trimEnd(), (error: unknown) => {
        if (errorCode(error) === 1 || errorCode(error) === 128) return '';
        throw error;
    });
    const [status, paths, remote] = await Promise.all([gitAsync(root, commands.status), gitAsync(root, commands.paths), origin]);
    return workingReader(root, commands.cachePath, status, paths, remote, cache);
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
    const prepared = new Map<string, string>();
    const readBlob = (id: string, path: string): string => {
        const cached = prepared.get(id);
        if (cached !== undefined) return cached;
        const size = Number(git(root, ['cat-file', '-s', id]));
        if (size > 10 * 1024 * 1024) throw new InputSizeError(path, size);
        const text = git(root, ['cat-file', 'blob', id]);
        prepared.set(id, text);
        return text;
    };
    const resolved = new Map<string, { mode: string; id: string; } | undefined>();
    const resolveBlob = (requested: string) => {
        if (resolved.has(requested)) return resolved.get(requested);
        const visited = new Set<string>();
        let path = requested;
        let object = blobs.get(path);
        while (object?.mode === '120000') {
            if (visited.has(path) || visited.size >= 40) throw new Error(`Historical symbolic link cycle or depth limit: ${requested}`);
            visited.add(path);
            const target = readBlob(object.id, path);
            const next = posix.join(posix.dirname(path), target);
            if (posix.isAbsolute(target) || /^[A-Za-z]:|^\\/u.test(target) || next === '..' || next.startsWith('../')) throw new Error(`Historical input resolves outside repository: ${requested}`);
            path = next;
            object = blobs.get(path);
        }
        resolved.set(requested, object);
        return object;
    };
    return {
        ...identity(root), commit, dirty: false, paths: [...blobs.keys()].sort(),
        prepare(paths, options) {
            const selected = new Map<string, string>();
            for (const path of paths) {
                const object = resolveBlob(path);
                if (!object || prepared.has(object.id)) continue;
                selected.set(object.id, path);
            }
            if (!selected.size) return;
            const input = [...selected.keys()].join('\n') + '\n';
            const run = (args: readonly string[], maxBuffer: number) => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { input, maxBuffer, stdio: ['pipe', 'pipe', 'pipe'] });
            const sizes = new Map<string, number>();
            for (const line of run(['cat-file', '--batch-check'], selected.size * 128).toString('utf8').trimEnd().split('\n')) {
                const match = /^([a-f0-9]+) blob (\d+)$/u.exec(line);
                if (!match?.[1] || match[2] === undefined || !selected.has(match[1])) throw new Error('Invalid historical blob metadata');
                const size = Number(match[2]);
                if (size > 10 * 1024 * 1024) {
                    if (options?.skipOversized) { selected.delete(match[1]); continue; }
                    throw new InputSizeError(selected.get(match[1]) ?? match[1], size);
                }
                sizes.set(match[1], size);
            }
            if (sizes.size !== selected.size) throw new Error('Incomplete historical blob metadata');
            const bytes = run(['cat-file', '--batch'], [...sizes.values()].reduce((sum, size) => sum + size + 128, 0));
            let offset = 0;
            for (const id of selected.keys()) {
                const end = bytes.indexOf(10, offset);
                const size = sizes.get(id);
                if (end < 0 || size === undefined || bytes.toString('utf8', offset, end) !== `${id} blob ${size}` || bytes[end + size + 1] !== 10) throw new Error('Invalid historical blob response');
                prepared.set(id, bytes.toString('utf8', end + 1, end + size + 1));
                offset = end + size + 2;
            }
            if (offset !== bytes.length) throw new Error('Unexpected historical blob response bytes');
        },
        readText(path) {
            const object = resolveBlob(path);
            return object ? readBlob(object.id, path) : undefined;
        },
    };
}
