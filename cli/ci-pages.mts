import { appendFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { GithubConnection } from './ci-github.mjs';
export interface PagesContext extends GithubConnection { readonly repository: string; }
export class PagesCheckError extends Error { constructor(message: string) { super(message); this.name = 'PagesCheckError'; } }
/** Observe existing Pages settings only; deployment permission is handled by the workflow. */
export async function checkPages(context: PagesContext) {
    const base = new URL(context.apiUrl ?? 'https://api.github.com');
    if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) throw new PagesCheckError('Invalid GitHub API URL');
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(context.repository)) throw new PagesCheckError('Invalid GitHub repository');
    let response: Response;
    try {
        response = await fetch(`${base.href.replace(/\/$/u, '')}/repos/${context.repository}/pages`, {
            method: 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${context.token}`, 'X-GitHub-Api-Version': '2022-11-28' },
            signal: AbortSignal.timeout(30_000), redirect: 'error',
        });
    } catch (error) {
        throw new PagesCheckError(error instanceof Error && error.name === 'TimeoutError' ? 'GitHub Pages availability request timed out' : 'GitHub Pages availability request failed');
    }
    await response.body?.cancel();
    if (response.status === 200) return { available: true };
    if (response.status === 404) return { available: false, notice: 'GitHub Pages is unavailable (HTTP 404). The generated map remains available in the workflow artifacts; repository Pages settings were not changed.' };
    throw new PagesCheckError(`GitHub Pages availability check failed with HTTP ${response.status}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
    try {
        const required = (name: string): string => { const value = process.env[name]; if (!value) throw new PagesCheckError(`Missing ${name}`); return value; };
        const result = await checkPages({ token: required('GITHUB_TOKEN'), repository: required('GITHUB_REPOSITORY'), ...(process.env['GITHUB_API_URL'] ? { apiUrl: process.env['GITHUB_API_URL'] } : {}) });
        const output = process.env['GITHUB_OUTPUT'];
        if (output) appendFileSync(output, `available=${result.available}\n`);
        if (result.notice) console.log(`::notice::${result.notice}`);
        console.log(JSON.stringify(result));
    } catch (error) { console.error(error instanceof PagesCheckError ? error.message : 'GitHub Pages availability check failed'); process.exitCode = 1; }
}
