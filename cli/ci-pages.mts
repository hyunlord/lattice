import { appendFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { GithubConnection } from './ci-github.mjs';
export interface PagesContext extends GithubConnection { readonly repository: string; }
export class PagesCheckError extends Error { constructor(message: string) { super(message); this.name = 'PagesCheckError'; } }
function bytePrefix(value: string, maximum: number): string {
    let bytes = 0, output = '';
    for (const character of value) {
        bytes += Buffer.byteLength(character, 'utf8');
        if (bytes > maximum) break;
        output += character;
    }
    return output;
}
function safeDiagnostic(value: string, token: string): string {
    return (token ? value.split(token).join('[redacted]') : value)
        .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/gu, '[redacted]')
        .replace(/\b(?:Bearer|Basic|token)\s+[^\s,;"'<>]+/giu, '[redacted]')
        .replace(/\b(?:authorization|(?:access[_-]?)?token)["']?\s*[:=][\s\S]*/giu, '[redacted]')
        .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ');
}
async function responseBody(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 65536) {
                await reader.cancel();
                return '[body omitted: response exceeds 64 KiB]';
            }
            chunks.push(chunk.value);
        }
        return Buffer.concat(chunks).toString('utf8');
    } catch (error) {
        if (error instanceof Error) return '[body unavailable]';
        throw error;
    } finally { reader.releaseLock(); }
}
async function failureDetails(response: Response, token: string): Promise<string> {
    const raw = await responseBody(response);
    let body: string;
    try {
        const value: unknown = JSON.parse(raw);
        body = value !== null && typeof value === 'object' && !Array.isArray(value)
            ? ['message', 'documentation_url'].flatMap(key => {
                const field: unknown = Reflect.get(value, key);
                return typeof field === 'string' ? [`${key}=${safeDiagnostic(field, token)}`] : [];
            }).join('; ') : '';
    } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        body = safeDiagnostic(raw, token);
    }
    const headers = ['x-github-request-id', 'x-accepted-github-permissions', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-used', 'x-ratelimit-reset', 'x-ratelimit-resource', 'retry-after'].flatMap(name => {
        const value = response.headers.get(name);
        return value === null ? [] : [`${name}=${bytePrefix(safeDiagnostic(value, token), 1024)}`];
    });
    return `${headers.length ? `\nHeaders: ${headers.join('; ')}` : ''}${body ? `\nBody: ${bytePrefix(body, 1024)}` : ''}`;
}
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
    if (response.status === 200 || response.status === 404) await response.body?.cancel();
    if (response.status === 200) return { available: true };
    if (response.status === 404) return { available: false, notice: 'GitHub Pages is unavailable (HTTP 404). The generated map remains available in the workflow artifacts; repository Pages settings were not changed.' };
    throw new PagesCheckError(`GitHub Pages availability check failed with HTTP ${response.status}${await failureDetails(response, context.token)}`);
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
