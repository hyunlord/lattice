import { performance } from 'node:perf_hooks';
import type { Options } from './types.mjs';
import { FreshRepository } from './freshness.mjs';
import { compareRepository } from './history.mjs';
import { runStdio } from './mcp-protocol.mjs';
import { queryGraph } from './mcp-queries.mjs';
import { stringArg } from './mcp-query-scope.mjs';
import { webDiff } from './mcp-diff.mjs';
import type { ToolName } from './mcp-schema.mjs';

export function createMcpHandler(options: Options) {
    if (options.output !== undefined) throw new Error('mcp does not take a positional argument');
    const url = new URL(options.viewerUrl ?? 'http://127.0.0.1:4173/');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw new Error('--viewer-url must be an HTTP(S) viewer base URL without credentials, query or fragment');
    const link = (route: string, params?: Record<string, string>) => {
        const target = new URL(url);
        const query = new URLSearchParams(params);
        target.hash = route + (query.size ? `?${query}` : '');
        return target.href;
    };
    const service = new FreshRepository(options);
    return async (name: ToolName, args: Record<string, unknown>): Promise<object> => {
        const started = performance.now();
        const fresh = await service.ensureFreshAsync();
        let result: object;
        if (name === 'lattice_freshness') result = { graphHash: fresh.graph.hash, repository: fresh.graph.repository, link: link('/home') };
        else if (name === 'lattice_diff') {
            const comparison = compareRepository(options, stringArg(args, 'ref'), fresh.build);
            const semantic = webDiff(comparison.before, comparison.after, comparison.presentation, args);
            const difference = comparison.difference;
            const base = comparison.after.snapshots.find(snapshot => snapshot.graphHash === comparison.before.hash);
            const head = comparison.after.snapshots.find(snapshot => snapshot.graphHash === comparison.after.hash);
            result = {
                graphHash: comparison.after.hash, repository: comparison.after.repository, ...semantic, before: difference.before, after: difference.after,
                link: base && head ? link('/changes', { base: base.id, head: head.id, layer: semantic.layer }) : null,
                linkReason: base && head ? null : 'Working-tree comparisons have no durable snapshot pair; the response contains the current diff.',
            };
        } else result = queryGraph(name, args, fresh.graph, fresh.build.presentation, link);
        return { ...result, freshness: fresh.freshness, timing: { totalMs: performance.now() - started } };
    };
}
export async function mcp(options: Options): Promise<void> { await runStdio(createMcpHandler(options)); }
