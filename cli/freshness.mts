import { ArtifactDigests } from './artifact-digest.mjs';
import { performance } from 'node:perf_hooks';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Options } from './types.mjs';
import { buildRepository } from './build.mjs';
import { observeRepository, observeRepositoryAsync } from './observation.mjs';
import { cacheDirectory, fileDigest, persistBuild, prepareSnapshots, withCacheLock } from './storage.mjs';

type ObservationSummary = { readonly fingerprint: string; readonly checkedInputs: number; readonly observationMode: 'metadata-witness' | 'content-hash'; };
const observationSummary = (observed: ReturnType<typeof observeRepository>): ObservationSummary => ({ observationMode: observed.repository.observationMode ?? 'content-hash', fingerprint: observed.fingerprint, checkedInputs: observed.selected.length + observed.codeInputs.length });

/** Every query verifies source identity; a failed observation never returns the previous graph. */
export class FreshRepository {
    private current: { build: ReturnType<typeof buildRepository>; graph: ReturnType<typeof persistBuild>; artifacts: string; } | undefined;
    private pending: Promise<void> = Promise.resolve();
    private readonly artifactDigests = new ArtifactDigests();
    constructor(private readonly options: Options) { }
    ensureFresh() {
        const started = performance.now();
        return this.refresh(observeRepository(this.options), started);
    }
    ensureFreshAsync() {
        const run = () => this.observeFreshAsync();
        const pending = this.pending.then(run, run);
        // The queue retains no graph result; failures still propagate through the returned promise.
        this.pending = pending.then(() => undefined, () => undefined);
        return pending;
    }
    private async observeFreshAsync() {
        const started = performance.now();
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const observed = observeRepositoryAsync(this.options).then(value => ({ value, durationMs: performance.now() - started }));
        const artifacts = Promise.all(['graph.json', 'presentation.json'].map(file => this.artifactDigests.digest(join(cache, file)))).then(values => values.join(':'));
        const [observation, artifactFingerprint] = await Promise.all([observed, artifacts]);
        return this.refresh(observation.value, started, artifactFingerprint, observation.durationMs);
    }
    private refresh(observation: ReturnType<typeof observeRepository>, started: number, artifactFingerprint?: string, checkedMs?: number) {
        const observed = observationSummary(observation);
        const observedAt = new Date().toISOString();
        const observationMs = checkedMs ?? performance.now() - started;
        const previousFingerprint = this.current?.build.fingerprint ?? null;
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const artifacts = () => ['graph.json', 'presentation.json'].map(file => existsSync(join(cache, file)) ? fileDigest(join(cache, file)) : '').join(':');
        const wasStale = this.current?.artifacts !== (artifactFingerprint ?? artifacts()) || previousFingerprint !== observed.fingerprint || !existsSync(join(cache, 'graph.json')) || !existsSync(join(cache, 'presentation.json'));
        const rebuildStarted = performance.now();
        if (wasStale) {
            this.current = undefined;
            const next = withCacheLock(this.options.root, () => {
                const preparedSnapshots = prepareSnapshots(cache);
                const build = buildRepository(this.options, undefined, observation);
                const graph = persistBuild(this.options.root, build, this.options.cacheDir, { memoize: false, preparedSnapshots });
                return { build, graph, artifacts: artifacts() };
            }, this.options.cacheDir);
            this.current = next;
        }
        const current = this.current;
        if (!current) throw new Error('Fresh graph is unavailable');
        return { ...current, freshness: { status: 'fresh', mode: 'content-hash', observationMode: observed.observationMode, observedAt, wasStale, rebuilt: wasStale, previousFingerprint, fingerprint: current.build.fingerprint, sourceFingerprint: current.graph.repository.sourceFingerprint, checkedInputs: observed.checkedInputs, observationMs, rebuildMs: wasStale ? performance.now() - rebuildStarted : 0, durationMs: performance.now() - started } };
    }
}
