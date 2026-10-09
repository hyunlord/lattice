import { isAbsolute, relative, sep } from 'node:path';
import { extractJson, extractCsv, extractMarkdown, extractCode, codeLanguage, DataInputError } from '../dist/index.js';
import { matchesGlob } from '../dist/lens/index.js';

export function inside(root, path) {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export function collectInputs({ paths, readText, lens, digest, sourceLink, cache }) {
  const records = [], documents = [], modules = [], files = [], inputs = [], diagnostics = [];
  for (const path of paths) {
    if (/^(?:\.lattice|\.omo|\.omx|\.codex|\.agents|\.git)\//u.test(path)) continue;
    const kinds = lens?.kinds.filter(kind => kind.files.some(pattern => matchesGlob(path, pattern))) ?? [];
    if (lens && kinds.length === 0) continue;
    if (kinds.length > 1) throw new Error(`Ambiguous kind patterns: ${path}`);
    const kind = kinds[0];
    const language = codeLanguage(path);
    const format = language ? 'code' : /\.(json|csv|md|markdown)$/iu.exec(path)?.[1]?.toLowerCase();
    if (!format) {
      if (lens) throw new Error(`No adapter for selected input: ${path}`);
      continue;
    }
    const text = readText(path);
    if (text === undefined) continue;
    const input = { path, text, contentHash: digest(text) };
    inputs.push({ path, contentHash: input.contentHash });
    const extract = parse => cache.extract(input, { format, selector: format === 'json' ? kind?.records ?? '' : '' }, parse);
    if (format === 'code') {
      const module = extract(() => extractCode(input));
      modules.push({ ...module, node: { ...module.node, sources: module.node.sources.map(sourceLink) }, imports: module.imports.map(reference => ({ ...reference, source: sourceLink(reference.source) })) });
      continue;
    }
    if (format === 'md' || format === 'markdown') {
      const doc = extract(() => extractMarkdown(input));
      documents.push({
        nodes: doc.nodes.map(node => ({ ...node, sources: node.sources.map(sourceLink) })),
        edges: doc.edges.map(edge => ({ ...edge, sources: edge.sources.map(sourceLink) })),
        links: doc.links.map(link => ({ ...link, source: sourceLink(link.source) })),
      });
      continue;
    }
    let extracted;
    try {
      extracted = extract(() => format === 'csv' ? extractCsv(input) : extractJson(input, kind?.records ?? ''));
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
  return { records, documents, modules, files, inputs, diagnostics };
}
