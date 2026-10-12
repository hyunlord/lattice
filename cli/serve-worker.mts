import { parentPort } from 'node:worker_threads';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createPackedExport } from './export-packs.mjs';
import { writeNodeDetails } from './export-details.mjs';
import { writeLogic } from './export-logic.mjs';
import { writeOverview } from './export-overview.mjs';
import { buildRepository } from './build.mjs';
import { observeRepository } from './observation.mjs';
import { cacheDirectory, persistBuild, prepareSnapshots, withCacheLock } from './storage.mjs';
import type { Options } from './types.mjs';

export interface ServeStart { readonly options: Options; readonly liveDirectory: string; }
export type ServeCommand = 'stop' | { readonly retire: readonly string[]; };
export interface ServeUpdate {
    readonly generation: number;
    readonly checks: number;
    readonly builds: number;
    readonly error: string | null;
    readonly hash: string | null;
    readonly generations: readonly (readonly [string, string])[];
    readonly media: readonly { readonly path: string; readonly bytes: Uint8Array; readonly mimeType: string; }[];
    readonly build?: { readonly extraction: ReturnType<typeof buildRepository>['extraction']['stats']; readonly diagnostics: ReturnType<typeof buildRepository>['diagnostics']; readonly durationMs: number; };
}
const port = parentPort;
if (!port) throw new Error('Live producer requires a worker message port');
port.once('message', ({ options, liveDirectory }: ServeStart) => {
    const cache = cacheDirectory(options.root, options.cacheDir);
    const generations = new Map<string, string>();
    const retired = new Set<string>();
    let fingerprint: string | undefined, generation = 0, checks = 0, builds = 0;
    let error: string | null = null, hash: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
        checks++;
        let media: ServeUpdate['media'] = [];
        let build: ServeUpdate['build'];
        try {
            const observedFingerprint = observeRepository(options).fingerprint;
            if (observedFingerprint !== fingerprint) {
                const startedAt = performance.now();
                const directory = join(liveDirectory, String(generation + 1));
                mkdirSync(directory);
                let next;
                try {
                    next = withCacheLock(options.root, () => {
                        const packs = createPackedExport(directory);
                        const write = (path: string, text: string) => { if (['overview.json', 'presentation.json', 'snapshots.json'].includes(path)) writeFileSync(join(directory, path), text); else packs.write(path, text); };
                        const packedGraph = (path: string, graph: Parameters<typeof writeNodeDetails>[0]) => { packs.json(path, graph); const target = join(directory, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, JSON.stringify({ transportVersion: 2, document: path, hash: graph.hash, repository: graph.repository, lensDigest: graph.lensDigest, counts: { nodes: graph.nodes.length, edges: graph.edges.length, facets: graph.facets.length, findings: graph.findings.length, views: graph.views.length } })); };
                        const preparedIds = new Set<string>();
                        const preparedSnapshots = prepareSnapshots(cache, { onGraph: (snapshot, graph) => { writeNodeDetails(graph, write, `details/snapshots/${snapshot.id}`); packedGraph(snapshot.artifactPath, graph); preparedIds.add(snapshot.id); } });
                        const buildArtifacts = () => {
                            const result = buildRepository(options);
                            const graph = persistBuild(options.root, result, options.cacheDir, { memoize: false, preparedSnapshots });
                            for (const snapshot of graph.snapshots) {
                                if (!preparedIds.has(snapshot.id)) { writeNodeDetails(result.graph, write, `details/snapshots/${snapshot.id}`); packedGraph(snapshot.artifactPath, result.graph); }
                            }
                            packedGraph('graph.json', graph);
                            write('presentation.json', JSON.stringify(result.presentation)); write('snapshots.json', JSON.stringify(graph.snapshots));
                            writeNodeDetails(graph, write, 'details', result.presentation);
                            writeLogic(graph, write); writeOverview(graph, result.presentation, write);
                            return { hash: graph.hash, fingerprint: result.fingerprint, snapshots: graph.snapshots, media: result.media.files, extraction: result.extraction.stats, diagnostics: result.diagnostics };
                        };
                        const artifacts = buildArtifacts();
                        packs.finish();
                        return artifacts;
                    }, options.cacheDir);
                } catch (failure) { rmSync(directory, { recursive: true, force: true }); throw failure; }
                generation++; builds++;
                generations.set(String(generation), directory);
                hash = next.hash; fingerprint = next.fingerprint; media = next.media;
                build = { extraction: next.extraction, diagnostics: next.diagnostics, durationMs: performance.now() - startedAt };
                while (generations.size > 4) {
                    const oldest = generations.keys().next().value; if (oldest === undefined) break;
                    const expired = generations.get(oldest); generations.delete(oldest);
                    if (expired) retired.add(expired);
                }
            }
            error = null;
        } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); }
        port.postMessage({ generation, checks, builds, error, hash, generations: [...generations], media, ...(build ? { build } : {}) } satisfies ServeUpdate);
    };
    port.on('message', (command: ServeCommand) => {
        if (command === 'stop') { clearTimeout(timer); port.close(); return; }
        for (const directory of command.retire) {
            if (retired.delete(directory)) rmSync(directory, { recursive: true, force: true });
        }
    });
    const poll = () => { refresh(); timer = setTimeout(poll, 500); };
    poll();
});
