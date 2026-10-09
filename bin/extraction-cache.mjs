import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, GraphInputError } from '../dist/index.js';
import { atomic, digest } from './storage.mjs';

function implementationFingerprint() {
  const root = fileURLToPath(new URL('../dist/', import.meta.url));
  const sources = [];
  function visit(directory, prefix) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (entry.isDirectory()) visit(join(directory, entry.name), path + '/');
      else if (entry.isFile() && path.endsWith('.js')) sources.push({ path, hash: digest(readFileSync(join(directory, entry.name), 'utf8')) });
    }
  }
  visit(root, '');
  sources.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return digest(canonicalJson({ sources, dependencies: manifest.dependencies ?? {} }));
}
export function extractionCache(root) {
  const implementation = implementationFingerprint();
  const stats = { mode: 'strict-content', files: 0, bytes: 0, parsed: 0, reused: 0, discarded: 0, implementation };
  const manifest = [];
  return {
    stats, manifest,
    extract(input, selection, parse) {
      const identity = { schemaVersion: 1, implementation, path: input.path, contentHash: input.contentHash, ...selection };
      const key = digest(canonicalJson(identity));
      const path = join(root, '.lattice/cache/extractions', `${key}.json`);
      stats.files++;
      stats.bytes += Buffer.byteLength(input.text, 'utf8');
      manifest.push({ ...identity, key });
      let text;
      try { text = readFileSync(path, 'utf8'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (text !== undefined) {
        let cached;
        try {
          cached = JSON.parse(text);
          if (cached?.key === key && canonicalJson(cached.identity) === canonicalJson(identity) && cached.valueHash === digest(canonicalJson(cached.value))) {
            stats.reused++;
            return cached.value;
          }
        } catch (error) {
          if (!(error instanceof SyntaxError) && !(error instanceof GraphInputError)) throw error;
        }
        stats.discarded++;
      }
      stats.parsed++;
      const value = parse();
      atomic(path, { key, identity, valueHash: digest(canonicalJson(value)), value });
      return value;
    },
  };
}
