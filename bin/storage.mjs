import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { canonicalJson, createGraph } from '../dist/index.js';

export const digest = text => createHash('sha256').update(text).digest('hex');
export function atomic(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n');
    renameSync(temporary, path);
  } finally { rmSync(temporary, { force: true }); }
}
export function readGraph(path) {
  const stored = JSON.parse(readFileSync(path, 'utf8'));
  if (stored.schemaVersion !== 1) throw new Error(`Unsupported graph schema: ${path}`);
  const graph = createGraph(stored, digest);
  if (stored.hash !== graph.hash) throw new Error(`Graph hash mismatch: ${path}`);
  return graph;
}
export function withCacheLock(root, run) {
  const cache = join(root, '.lattice/cache');
  mkdirSync(cache, { recursive: true });
  const lock = join(cache, 'writer.lock');
  try { writeFileSync(lock, String(process.pid), { flag: 'wx' }); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Cache writer lock exists: ${lock}; retry after the active build finishes (remove only if its recorded process has stopped)`);
    throw error;
  }
  try { return run(); }
  finally { rmSync(lock); }
}
export function readSnapshots(cache) {
  const path = join(cache, 'snapshots.json');
  if (!existsSync(path)) return [];
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(catalog) || catalog.length > 32) throw new Error('Invalid snapshot catalog');
  return catalog.map(snapshot => {
    if (!snapshot || !/^[a-f0-9]{64}$/u.test(snapshot.id) || snapshot.artifactPath !== `snapshots/${snapshot.id}.json`) throw new Error('Invalid snapshot identity');
    const graph = readGraph(join(cache, snapshot.artifactPath));
    if (graph.hash !== snapshot.graphHash || graph.repository.commit !== snapshot.commit || graph.lensDigest !== snapshot.lensHash) throw new Error('Snapshot metadata mismatch');
    return snapshot;
  });
}
export function saveSnapshot(cache, graph, coverage) {
  let snapshots = readSnapshots(cache);
  if (graph.repository.commit && !graph.repository.dirty) {
    const id = digest(canonicalJson({ commit: graph.repository.commit, lens: graph.lensDigest, adapters: graph.adapterVersions, graph: graph.hash, coverage }));
    const snapshot = { id, commit: graph.repository.commit, graphHash: graph.hash, lensHash: graph.lensDigest, inputFingerprint: graph.repository.sourceFingerprint, coverage, artifactPath: `snapshots/${id}.json` };
    atomic(join(cache, snapshot.artifactPath), graph);
    snapshots = [...snapshots.filter(entry => entry.id !== id), snapshot].slice(-32);
    atomic(join(cache, 'snapshots.json'), snapshots);
  }
  return createGraph({ ...graph, snapshots }, digest);
}

export function persistBuild(root, result) {
  const cache = join(root, '.lattice/cache');
  const graph = saveSnapshot(cache, result.graph, result.coverage);
  atomic(join(cache, 'presentation.json'), result.presentation);
  atomic(join(cache, 'diagnostics.json'), result.diagnostics);
  atomic(join(cache, 'inputs.json'), result.extraction.manifest);
  atomic(join(cache, 'build.json'), result.extraction.stats);
  atomic(join(cache, 'graph.json'), graph);
  return graph;
}
