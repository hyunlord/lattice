import { webcrypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { errorCode } from './types.mjs';
import { join } from 'node:path';
import type { Options } from './types.mjs';
import { buildRepository } from './build.mjs';
import { observeRepository, observeRepositoryAsync } from './observation.mjs';
import { cacheDirectory, digest, persistBuild, withCacheLock } from './storage.mjs';

/** Every query reads content; a previous successful observation never masks a later failure. */
export class FreshRepository {
    private current: { build: ReturnType<typeof buildRepository>; graph: ReturnType<typeof persistBuild>; artifacts: string; } | undefined;
    constructor(private readonly options: Options) { }
    ensureFresh() {
        const started = performance.now();
        return this.refresh(observeRepository(this.options), started);
    }
    async ensureFreshAsync() {
        const started = performance.now();
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const observed = observeRepositoryAsync(this.options).then(value => ({ value, durationMs: performance.now() - started }));
        const artifacts = Promise.all(['graph.json', 'presentation.json'].map(async file => {
            try { return Buffer.from(await webcrypto.subtle.digest('SHA-256', await readFile(join(cache, file)))).toString('hex'); }
            catch (error) { if (errorCode(error) === 'ENOENT') return ''; throw error; }
        })).then(values => values.join(':'));
        const [observation, artifactFingerprint] = await Promise.all([observed, artifacts]);
        return this.refresh(observation.value, started, artifactFingerprint, observation.durationMs);
    }
    private refresh(observed: ReturnType<typeof observeRepository>, started: number, artifactFingerprint?: string, checkedMs?: number) {
        const observedAt = new Date().toISOString();
        const observationMs = checkedMs ?? performance.now() - started;
        const previousFingerprint = this.current?.build.fingerprint ?? null;
        const cache = cacheDirectory(this.options.root, this.options.cacheDir);
        const artifacts = () => ['graph.json', 'presentation.json'].map(file => existsSync(join(cache, file)) ? digest(readFileSync(join(cache, file))) : '').join(':');
        const wasStale = this.current?.artifacts !== (artifactFingerprint ?? artifacts()) || previousFingerprint !== observed.fingerprint || !existsSync(join(cache, 'graph.json')) || !existsSync(join(cache, 'presentation.json'));
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
