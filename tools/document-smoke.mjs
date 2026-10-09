import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { extractMarkdown, resolveDocumentLinks, createGraph } from '../dist/index.js';

const root = realpathSync(process.argv[2] ?? '.');
const digest = text => createHash('sha256').update(text).digest('hex');
const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const documents = [], files = [], inputs = [];
for (const path of paths) {
  const absolute = join(root, path);
  if (!lstatSync(absolute).isFile()) continue;
  const content = readFileSync(absolute);
  const contentHash = digest(content);
  inputs.push({ path, contentHash });
  if (/\.md$/i.test(path)) documents.push(extractMarkdown({ path, text: content.toString('utf8'), contentHash }));
  else files.push({ id: `file:${path}`, kind: 'file', name: path, attributes: {}, sources: [{ path, pointer: '', line: 1, contentHash }] });
}
const linked = resolveDocumentLinks(documents, files);
const draft = { repository: { name: 'document-smoke', dirty: true, sourceFingerprint: digest(JSON.stringify(inputs)) }, nodes: linked.nodes, edges: linked.edges, facets: [], findings: [], views: [], snapshots: [], lensDigest: null, adapterVersions: { markdown: '0.1' }, inputs };
const graph = createGraph(draft, digest);
assert.equal(createGraph({ ...draft, ...resolveDocumentLinks([...documents].reverse(), [...files].reverse()) }, digest).hash, graph.hash);
console.log(JSON.stringify({ node: process.version, documents: documents.length, headings: graph.nodes.filter(n => n.kind === 'heading').length, links: graph.edges.filter(e => e.kind === 'link').length, externalLinks: linked.externalLinks.length, diagnostics: linked.diagnostics, hash: graph.hash }, null, 2));
