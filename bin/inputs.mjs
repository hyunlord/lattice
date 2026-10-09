import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { extractJson, extractCsv, extractMarkdown, DataInputError } from '../dist/index.js';
import { matchesGlob } from '../dist/lens/index.js';

export function inside(root, path) {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export function collectInputs({ root, paths, lens, digest, sourceLink }) {
  const records = [], documents = [], files = [], inputs = [], diagnostics = [];
  for (const path of paths) {
    if (/^(?:\.lattice|\.omo|\.omx|\.codex|\.agents|\.git)\//u.test(path)) continue;
    const kinds = lens?.kinds.filter(kind => kind.files.some(pattern => matchesGlob(path, pattern))) ?? [];
    if (lens && kinds.length === 0) continue;
    if (kinds.length > 1) throw new Error(`Ambiguous kind patterns: ${path}`);
    const kind = kinds[0];
    const format = /\.(json|csv|md|markdown)$/iu.exec(path)?.[1]?.toLowerCase();
    if (!format) {
      if (lens) throw new Error(`No adapter for selected input: ${path}`);
      continue;
    }
    const absolute = realpathSync(join(root, path));
    if (!inside(root, absolute)) throw new Error(`Input resolves outside repository: ${path}`);
    if (!statSync(absolute).isFile()) continue;
    if (statSync(absolute).size > 10 * 1024 * 1024) throw new Error(`Input exceeds 10 MiB: ${path}`);
    const text = readFileSync(absolute, 'utf8');
    const input = { path, text, contentHash: digest(text) };
    inputs.push({ path, contentHash: input.contentHash });
    if (format === 'md' || format === 'markdown') {
      const doc = extractMarkdown(input);
      documents.push({
        nodes: doc.nodes.map(node => ({ ...node, sources: node.sources.map(sourceLink) })),
        edges: doc.edges.map(edge => ({ ...edge, sources: edge.sources.map(sourceLink) })),
        links: doc.links.map(link => ({ ...link, source: sourceLink(link.source) })),
      });
      continue;
    }
    let extracted;
    try {
      extracted = format === 'csv' ? extractCsv(input) : extractJson(input, kind?.records ?? '');
    } catch (error) {
      if (lens || !(error instanceof DataInputError)) throw error;
      diagnostics.push({ code: 'unparsed-file', path, line: error.line, message: error.reason });
      extracted = [];
    }
    for (const record of extracted) {
      const id = record.node.attributes[kind?.idField ?? 'id'];
      const name = record.node.attributes[kind?.nameField ?? 'name'];
      records.push({
        node: { ...record.node, id: typeof id === 'string' && id ? id : record.node.id, name: typeof name === 'string' && name ? name : record.node.name, kind: kind?.id ?? record.node.kind, sources: record.node.sources.map(sourceLink) },
        fields: Object.fromEntries(Object.entries(record.fields).map(([key, value]) => [key, sourceLink(value)])),
      });
    }
    if (!lens && !extracted.some(record => record.node.sources.some(source => source.pointer === ''))) {
      files.push({ id: `file:${path}`, kind: 'file', name: path, attributes: { format }, sources: [sourceLink({ path, pointer: '', line: 1, contentHash: input.contentHash })] });
    }
  }
  return { records, documents, files, inputs, diagnostics };
}
