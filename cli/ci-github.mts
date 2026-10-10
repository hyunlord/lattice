import { object } from './types.mjs';
export interface GithubClient { request(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<unknown>; }
export interface GithubConnection { readonly token: string; readonly apiUrl?: string; }
export function githubClient(connection: GithubConnection): GithubClient {
    const base = new URL(connection.apiUrl ?? 'https://api.github.com');
    if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)))) throw new Error('Invalid GitHub API URL');
    return {
        async request(method, path, body) {
            const response = await fetch(base.href.replace(/\/$/u, '') + path, {
                method,
                headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${connection.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(30_000), redirect: 'error',
            });
            if (!response.ok) throw new Error(`GitHub API ${method} failed with HTTP ${response.status}`);
            try { return await response.json(); }
            catch (error) {
                if (error instanceof SyntaxError) throw new Error('GitHub API returned invalid JSON');
                throw error;
            }
        },
    };
}
export function pullRequest(value: unknown) {
    if (!object(value) || !object(value['head']) || !object(value['base'])) throw new Error('Invalid pull request context');
    const head = value['head']; const base = value['base'];
    if (!object(head['repo']) || !object(base['repo']) || typeof head['repo']['full_name'] !== 'string' || typeof base['repo']['full_name'] !== 'string' || typeof head['sha'] !== 'string' || typeof base['sha'] !== 'string' || typeof value['number'] !== 'number' || !Number.isSafeInteger(value['number']) || value['number'] < 1) throw new Error('Incomplete pull request context');
    return { number: value['number'], headSha: head['sha'], baseSha: base['sha'], headRepository: head['repo']['full_name'], baseRepository: base['repo']['full_name'], open: value['state'] === 'open' };
}
export function botComment(value: unknown): { readonly id: number; readonly body: string; } | undefined {
    if (!object(value) || !object(value['user'])) throw new Error('Invalid GitHub comment response');
    if (value['user']['type'] !== 'Bot' || value['user']['login'] !== 'github-actions[bot]') return undefined;
    if (typeof value['id'] !== 'number' || !Number.isSafeInteger(value['id']) || value['id'] <= 0 || typeof value['body'] !== 'string') throw new Error('Invalid GitHub bot comment');
    return { id: value['id'], body: value['body'] };
}
