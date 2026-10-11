import { errorCode, object } from './types.mjs';
import type { Graph, GraphDraft, Snapshot } from '../dist/index.js';
import type { buildRepository } from './build.mjs';
import { parseGraph, parseSnapshots } from './decode.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson, createGraph } from '../dist/index.js';
import { readJsonObject } from './json-stream.mjs';

export const digest = Object.assign(
    (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex'),
    {
        stream(produce: (write: (chunk: string) => void) => void): string {
            const hash = createHash('sha256');
            produce(chunk => { hash.update(chunk); });
            return hash.digest('hex');
        }
    },
);
export function atomic(path: string, value: unknown) {
    writeAtomic(path, JSON.stringify(value) + '\n');
}
function writeAtomic(path: string, text: string | Uint8Array) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
        writeFileSync(temporary, text);
        renameSync(temporary, path);
    } finally { rmSync(temporary, { force: true }); }
}
const validatedGraphs = new Map<string, { readonly bytesHash: string; readonly graph: WeakRef<Graph>; }>();
function rememberGraph(path: string, bytesHash: string, graph: Graph) {
    validatedGraphs.delete(path);
    validatedGraphs.set(path, { bytesHash, graph: new WeakRef(graph) });
    if (validatedGraphs.size > 64) {
        const oldest = validatedGraphs.keys().next().value;
        if (oldest !== undefined) validatedGraphs.delete(oldest);
    }
}
export function readGraph(path: string, options: { readonly memoize?: boolean; } = {}) {
    const bytesHash = fileDigest(path);
    const previous = options.memoize === false ? undefined : validatedGraphs.get(path);
    const cached = previous?.bytesHash === bytesHash ? previous.graph.deref() : undefined;
    if (cached) return cached;
    const stored = readGraphDraft(path);
    const graph = createGraph(stored.draft, digest);
    if (stored.hash !== graph.hash) throw new Error(`Graph hash mismatch: ${path}`);
    if (options.memoize !== false) rememberGraph(path, bytesHash, graph);
    return graph;
}
function readGraphDraft(path: string): { readonly draft: GraphDraft; readonly hash: unknown; } {
    const stored = readJsonObject(path);
    if (stored['schemaVersion'] !== 1) throw new Error(`Unsupported graph schema: ${path}`);
    return { draft: parseGraph(stored), hash: stored['hash'] };
}
function fileDigest(path: string): string {
    const descriptor = openSync(path, 'r'), bytes = Buffer.allocUnsafe(65536), hash = createHash('sha256');
    try {
        let count: number;
        while ((count = readSync(descriptor, bytes, 0, bytes.length, null)) > 0) hash.update(bytes.subarray(0, count));
        return hash.digest('hex');
    } finally { closeSync(descriptor); }
}
function writeGraph(path: string, graph: Graph) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`, hash = createHash('sha256');
    let descriptor: number | undefined;
    try {
        descriptor = openSync(temporary, 'wx');
        const output = descriptor;
        let pending = '';
        const flush = () => {
            const bytes = Buffer.from(pending);
            hash.update(bytes);
            let offset = 0;
            while (offset < bytes.length) offset += writeSync(output, bytes, offset, bytes.length - offset);
            pending = '';
        };
        const write = (text: string) => { pending += text; if (pending.length >= 65536) flush(); };
        write('{');
        let separator = '';
        for (const [key, value] of Object.entries(graph)) {
            if (value === undefined) continue;
            write(`${separator}${JSON.stringify(key)}:`);
            if (Array.isArray(value)) {
                write('[');
                for (let index = 0; index < value.length; index++) write(`${index ? ',' : ''}${JSON.stringify(value[index])}`);
                write(']');
            } else write(JSON.stringify(value));
            separator = ',';
        }
        write('}\n');
        flush();
        closeSync(descriptor);
        descriptor = undefined;
        const bytesHash = hash.digest('hex');
        if (!existsSync(path) || fileDigest(path) !== bytesHash) renameSync(temporary, path);
        rememberGraph(path, bytesHash, graph);
    } finally {
        if (descriptor !== undefined) closeSync(descriptor);
        rmSync(temporary, { force: true });
    }
}
export function cacheDirectory(root: string, cacheDir?: string) {
    return cacheDir ?? join(root, '.lattice/cache');
}
export function withCacheLock<T>(root: string, run: () => T, cacheDir?: string): T {
    const cache = cacheDirectory(root, cacheDir);
    mkdirSync(cache, { recursive: true });
    const lock = join(cache, 'writer.lock');
    try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
    catch (error) {
        if (errorCode(error) === 'EEXIST') throw new Error(`Cache writer lock exists: ${lock}; retry after the active build finishes (remove only if its recorded process has stopped)`);
        throw error;
    }
    try {
        if (cacheDir !== undefined) {
            const ownerPath = join(cache, 'repository.json');
            if (existsSync(ownerPath)) {
                const owner: unknown = JSON.parse(readFileSync(ownerPath, 'utf8'));
                if (!object(owner) || owner['root'] !== root) throw new Error(`Cache belongs to another repository: ${cache}`);
            } else {
                if (existsSync(join(cache, 'graph.json')) || existsSync(join(cache, 'snapshots.json'))) throw new Error(`Existing cache has no repository identity: ${cache}; choose an empty directory`);
                atomic(ownerPath, { root });
            }
        }
        return run();
    }
    finally { rmSync(lock); }
}
export function readSnapshots(cache: string, options: { readonly memoize?: boolean; readonly onGraph?: (snapshot: Snapshot, graph: Graph) => void; } = {}) {
    const path = join(cache, 'snapshots.json');
    if (!existsSync(path)) return [];
    const catalog = parseSnapshots(JSON.parse(readFileSync(path, 'utf8')));
    if (catalog.length > 32) throw new Error('Invalid snapshot catalog');
    return catalog.map(snapshot => {
        if (!/^[a-f0-9]{64}$/u.test(snapshot.id) || snapshot.artifactPath !== `snapshots/${snapshot.id}.json`) throw new Error('Invalid snapshot identity');
        const graph = readGraph(join(cache, snapshot.artifactPath), options);
        if (graph.hash !== snapshot.graphHash || graph.repository.commit !== snapshot.commit || graph.lensDigest !== snapshot.lensHash) throw new Error('Snapshot metadata mismatch');
        options.onGraph?.(snapshot, graph);
        return snapshot;
    });
}
export function saveSnapshot(cache: string, graph: Graph, coverage: string) {
    let snapshots = readSnapshots(cache);
    if (graph.repository.commit && !graph.repository.dirty) {
        const id = digest(canonicalJson({ commit: graph.repository.commit, lens: graph.lensDigest, adapters: graph.adapterVersions, graph: graph.hash, coverage }));
        const snapshot = { id, commit: graph.repository.commit, graphHash: graph.hash, lensHash: graph.lensDigest, inputFingerprint: graph.repository.sourceFingerprint, coverage, artifactPath: `snapshots/${id}.json` };
        writeGraph(join(cache, snapshot.artifactPath), graph);
        snapshots = [...snapshots.filter(entry => entry.id !== id), snapshot].slice(-32);
        atomic(join(cache, 'snapshots.json'), snapshots);
    }
    const ordered = snapshots.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    return Object.freeze({ ...graph, snapshots: Object.freeze(ordered.map(snapshot => Object.freeze({ ...snapshot }))) });
}

export function persistBuild(root: string, result: ReturnType<typeof buildRepository>, cacheDir?: string) {
    const cache = cacheDirectory(root, cacheDir);
    const graph = saveSnapshot(cache, result.graph, result.coverage);
    atomic(join(cache, 'presentation.json'), result.presentation);
    atomic(join(cache, 'diagnostics.json'), result.diagnostics);
    atomic(join(cache, 'inputs.json'), result.extraction.manifest);
    atomic(join(cache, 'build.json'), result.extraction.stats);
    writeGraph(join(cache, 'graph.json'), graph);
    return graph;
}
