import { performance } from 'node:perf_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Options } from './types.mjs';
import { buildRepository } from './build.mjs';
import { observeRepository } from './observation.mjs';
import { cacheDirectory, digest, persistBuild, withCacheLock } from './storage.mjs';

/** Every query reads content; a previous successful observation never masks a later failure. */
export class FreshRepository {
    private current: { build: ReturnType<typeof buildRepository>; graph: ReturnType<typeof persistBuild>; artifacts: string; } | undefined;
    constructor(private readonly options: Options) { }
    ensureFresh() {
        const started = performance.now();
        const observed = observeRepository(this.options);
        const observedAt = new Date().toISOString();
        const observationMs = performance.now() - started;
        const previousFingerprint = this.current?.build.fingerprint ?? null;
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const artifacts = () => ['graph.json', 'presentation.json'].map(file => existsSync(join(cache, file)) ? digest(readFileSync(join(cache, file), 'utf8')) : '').join(':');
        const wasStale = this.current?.artifacts !== artifacts() || previousFingerprint !== observed.fingerprint || !existsSync(join(cache, 'graph.json')) || !existsSync(join(cache, 'presentation.json'));
        const rebuildStarted = performance.now();
        if (wasStale) {
            const next = withCacheLock(this.options.root, () => {
                const build = buildRepository(this.options, undefined, observed);
                const graph = persistBuild(this.options.root, build, this.options.cacheDir);
                return { build, graph, artifacts: artifacts() };
            }, this.options.cacheDir);
            this.current = next;
        }
        const current = this.current;
        if (!current) throw new Error('Fresh graph is unavailable');
        return { ...current, freshness: { status: 'fresh', mode: 'content-hash', observedAt, wasStale, rebuilt: wasStale, previousFingerprint, fingerprint: observed.fingerprint, sourceFingerprint: current.graph.repository.sourceFingerprint, checkedInputs: observed.selected.length + observed.codeInputs.length, observationMs, rebuildMs: wasStale ? performance.now() - rebuildStarted : 0, durationMs: performance.now() - started } };
    }
}
