import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, realpath, stat, lstat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { inside } from './inputs.mjs';
import { serve } from './serve.mjs';
import type { Options } from './types.mjs';
import type { OpenProgress } from './open-progress.mjs';

export function githubTarget(value: string): string {
    const match = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u.exec(value);
    if (!match?.[1] || !match[2] || match[2] === '.' || match[2] === '..') throw new Error('Expected a public GitHub HTTPS owner/repo URL without credentials, query or fragment');
    return `https://github.com/${match[1]}/${match[2]}.git`;
}
export async function openRepository(args: readonly string[]) {
    const target = args[0];
    if (!target || target.startsWith('-')) throw new Error('open requires a public GitHub HTTPS owner/repo URL or existing local directory');
    for (const flag of args.slice(1)) if (flag !== '--no-browser' && flag !== '--json') throw new Error(`Unknown open option: ${flag}`);
    const remote = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u.test(target) ? githubTarget(target) : undefined;
    const local = remote ? undefined : await realpath(resolve(target));
    if (local && !(await stat(local)).isDirectory()) throw new Error('open requires an existing local directory');
    const temporary = await realpath(tmpdir());
    const base = local && inside(local, temporary) ? await realpath(homedir()) : temporary;
    if (local && inside(local, base)) throw new Error('No external cache location is available outside this directory');
    const cacheRoot = join(base, '.lattice-open');
    await mkdir(cacheRoot, { recursive: true });
    if ((await lstat(cacheRoot)).isSymbolicLink()) throw new Error('External cache directory must not be a symbolic link');
    const session = await realpath(await mkdtemp(join(cacheRoot, 'session-')));
    const options: Options = { root: local ?? join(session, 'repository'), cacheDir: join(session, 'cache'), port: '0', readOnlySource: true, json: args.includes('--json'), noLens: true };
    await serve(options, {
        browser: !args.includes('--no-browser'),
        async prepare(report: (progress: OpenProgress) => void, signal: AbortSignal) {
            if (!remote) return;
            report({ phase: 'clone', detail: 'git clone --depth 1 (public HTTPS)' });
            // Isolate system/global Git configuration: no credential helpers, filters, aliases, hooks or URL rewrites.
            const env = { PATH: process.env['PATH'], HOME: session, USERPROFILE: session, TMPDIR: tmpdir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' };
            const child = spawn('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'credential.helper=', '-c', 'protocol.file.allow=never', 'clone', '--depth', '1', '--no-recurse-submodules', '--progress', '--', remote, options.root], { env, stdio: ['ignore', 'ignore', 'pipe'], signal });
            await new Promise<void>((resolvePromise, reject) => {
                let detail = '';
                child.stderr.on('data', (bytes: Buffer) => {
                    detail = (detail + bytes.toString('utf8')).slice(-4096);
                    const line = detail.split(/[\r\n]/u).filter(Boolean).at(-1);
                    if (line) report({ phase: 'clone', detail: line.slice(0, 300) });
                });
                child.once('error', reject);
                child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Public clone failed (${code ?? 'signal'}): ${detail.slice(-1000)}`)));
            });
        },
    });
}

export function launchBrowser(url: string): Promise<void> {
    const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'rundll32' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { stdio: 'ignore' });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolvePromise() : reject(new Error(`Browser launcher exited ${code}`)));
    });
}
