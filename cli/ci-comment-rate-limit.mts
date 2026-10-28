import type { GithubClient } from './ci-github.mjs';
import { GithubApiError } from './ci-github.mjs';
import { setTimeout } from 'node:timers/promises';

export class CommentRateLimitError extends Error {
    override readonly name = 'CommentRateLimitError';
}
export function commentClient(client: GithubClient, wait: (milliseconds: number) => Promise<unknown> = setTimeout): GithubClient {
    return {
        async request(method, path, body) {
            for (let attempt = 1; ; attempt++) {
                try { return await client.request(method, path, body); }
                catch (error) {
                    if (!(error instanceof GithubApiError) || !error.rateLimited) throw error;
                    if (attempt === 3) throw new CommentRateLimitError(error.message, { cause: error });
                    await wait(1000 * 2 ** (attempt - 1));
                }
            }
        },
    };
}
