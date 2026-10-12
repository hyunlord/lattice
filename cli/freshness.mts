import { ArtifactDigests } from './artifact-digest.mjs';
import { performance } from 'node:perf_hooks';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Options } from './types.mjs';
import { buildRepository } from './build.mjs';
import { observeRepository, observeRepositoryAsync } from './observation.mjs';
import { cacheDirectory, fileDigest, persistBuild, prepareSnapshots, withCacheLock } from './storage.mjs';
import { ObservationWorker } from './observer-client.mjs';
import { observationSummary, observationContextKey, type ObservationSummary } from './observer-protocol.mjs';

interface Observer { observe(options: Options): Promise<ObservationSummary>; dispose(): Promise<void>; }

/** Every query verifies source identity; a failed observation never returns the previous graph. */
export class FreshRepository {
    private current: { build: ReturnType<typeof buildRepository>; graph: ReturnType<typeof persistBuild>; artifacts: string; } | undefined;
    private pending: Promise<void> = Promise.resolve();
    private readonly artifactDigests = new ArtifactDigests();
    private generation = 0;
    private disposed = false;
    constructor(private readonly options: Options, private readonly observer: Observer = new ObservationWorker()) { }
    ensureFresh() {
        this.assertActive(); this.generation++;
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
        this.assertActive();
        const generation = this.generation, key = observationContextKey(this.options);
        const assertCurrent = () => {
            this.assertActive();
            if (generation !== this.generation) throw new Error('Fresh graph generation changed during observation');
            if (key !== observationContextKey(this.options)) throw new Error('Source observation options changed');
        };
        const started = performance.now();
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const observed = this.observer.observe(this.options).then(value => ({ value, durationMs: performance.now() - started }));
        const artifacts = Promise.all(['graph.json', 'presentation.json'].map(file => this.artifactDigests.digest(join(cache, file)))).then(values => values.join(':'));
        const [observation, artifactFingerprint] = await Promise.all([observed, artifacts]);
        assertCurrent();
        if (!this.stale(observation.value, artifactFingerprint, cache)) return this.refresh(undefined, started, artifactFingerprint, observation.durationMs, observation.value);
        // A summary cannot supply build input. Reobserve locally with an unretained cache identity.
        const local = await observeRepositoryAsync({ ...this.options });
        assertCurrent();
        return this.refresh(local, started, undefined, undefined, undefined, true);
    }
    async dispose(): Promise<void> {
        this.disposed = true; this.generation++; this.current = undefined;
        await this.observer.dispose();
    }
    private assertActive(): void { if (this.disposed) throw new Error('Fresh repository is disposed'); }
    private stale(observed: ObservationSummary, artifacts: string, cache: string): boolean {
        return this.current?.artifacts !== artifacts || this.current?.build.fingerprint !== observed.fingerprint || !existsSync(join(cache, 'graph.json')) || !existsSync(join(cache, 'presentation.json'));
    }
    private refresh(observation: ReturnType<typeof observeRepository> | undefined, started: number, artifactFingerprint?: string, checkedMs?: number, summary?: ObservationSummary, force = false) {
        const observed = observation ? observationSummary(observation) : summary;
        if (!observed) throw new Error('Fresh source observation is unavailable');
        const observedAt = new Date().toISOString();
        const observationMs = checkedMs ?? performance.now() - started;
        const previousFingerprint = this.current?.build.fingerprint ?? null;
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const artifacts = () => ['graph.json', 'presentation.json'].map(file => existsSync(join(cache, file)) ? fileDigest(join(cache, file)) : '').join(':');
        const wasStale = force || this.stale(observed, artifactFingerprint ?? artifacts(), cache);
        const rebuildStarted = performance.now();
        if (wasStale) {
            if (!observation) throw new Error('Fresh source observation is required for rebuilding');
            this.generation++;
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
