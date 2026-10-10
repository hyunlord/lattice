import { join } from 'node:path';
import { diffGraphs } from '../dist/index.js';
import type { Options } from './types.mjs';
import { buildRepository } from './build.mjs';
import { historicalRepository } from './repository.mjs';
import { atomic, cacheDirectory, persistBuild, saveSnapshot, withCacheLock } from './storage.mjs';

export function compareRepository(options: Options, ref: string | undefined, current?: ReturnType<typeof buildRepository>) {
    const historical = historicalRepository(options.root, ref);
    return withCacheLock(options.root, () => {
        const buildOptions = { ...options, output: undefined };
        const before = buildRepository(buildOptions, historical);
        const after = current ?? buildRepository(buildOptions);
        const metadata = (result: ReturnType<typeof buildRepository>) => ({ ...result.graph.repository, graphHash: result.graph.hash, lensHash: result.graph.lensDigest, coverage: result.coverage });
        const difference = { schemaVersion: 1, before: metadata(before), after: metadata(after), ...diffGraphs(before.graph, after.graph) };
        const cache = cacheDirectory(options.root, options.cacheDir);
        saveSnapshot(cache, before.graph, before.coverage);
        const graph = persistBuild(options.root, after, options.cacheDir);
        atomic(join(cache, 'diff.json'), difference);
        return { difference, before: before.graph, after: graph, presentation: after.presentation };
    }, options.cacheDir);
}
