import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { extractJson, resolveRecords, createGraph } from '../dist/index.js';

const [rootArg, ...directories] = process.argv.slice(2);
if (!rootArg || directories.length === 0) throw new Error('Usage: node tools/extract-smoke.mjs <root> <relative-directory>...');
const root = realpathSync(resolve(rootArg));
const digest = text => createHash('sha256').update(text).digest('hex');
const records = [], inputs = [], counts = {};
for (const directory of directories) {
  const absolute = realpathSync(resolve(root, directory));
  if (relative(root, absolute) === '..' || relative(root, absolute).startsWith('../')) throw new Error('Directory must be inside root');
  counts[directory] = 0;
  for (const file of readdirSync(absolute, { withFileTypes: true }).filter(file => file.isFile() && file.name.endsWith('.json')).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const path = relative(root, join(absolute, file.name)).split('\\').join('/');
    const text = readFileSync(join(absolute, file.name), 'utf8');
    const contentHash = digest(text);
    inputs.push({ path, contentHash });
    const found = extractJson({ path, text, contentHash });
    records.push(...found);
    counts[directory] += found.length;
  }
}
const result = resolveRecords(records);
const draft = { repository: { name: 'read-only-smoke', dirty: true, sourceFingerprint: digest(JSON.stringify(inputs)) }, nodes: result.nodes, edges: result.edges, facets: [], findings: [], views: [], snapshots: [], lensDigest: null, adapterVersions: { json: '0.1', reference: '0.1' }, inputs };
const graph = createGraph(draft, digest);
assert.equal(createGraph({ ...draft, ...resolveRecords([...records].reverse()) }, digest).hash, graph.hash);
console.log(JSON.stringify({ node: process.version, counts, nodes: graph.nodes.length, edges: graph.edges.length, diagnostics: Object.fromEntries([...new Set(result.diagnostics.map(d => d.code))].map(code => [code, result.diagnostics.filter(d => d.code === code).length])), hash: graph.hash }, null, 2));
