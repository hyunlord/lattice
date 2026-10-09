import { isAbsolute, relative, sep } from 'node:path';
import { extractJson, extractYaml, extractCsv, extractMarkdown, extractCode, codeLanguage, DataInputError } from '../dist/index.js';
import { matchesGlob } from '../dist/lens/index.js';

export function inside(root, path) {
  const offset = relative(root, path);
  return offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset);
}

export function inInputScope(path, lens) {
  return !/^(?:\.lattice|\.omo|\.omx|\.codex|\.agents|\.git|graft)\//u.test(path)
    && (lens?.include === undefined || lens.include.some(pattern => matchesGlob(path, pattern)))
    && !lens?.exclude?.some(pattern => matchesGlob(path, pattern));
}

export function selectedInputs(paths, lens) {
  const selected = [];
  for (const path of paths) {
    if (!inInputScope(path, lens)) continue;
    const kinds = lens?.kinds.flatMap(kind => [kind, ...(kind.selections ?? []).map(selection => ({ ...kind, ...selection }))].filter(selection => selection.files.some(pattern => matchesGlob(path, pattern)))) ?? [];
    if (lens && kinds.length === 0) continue;
    if (new Set(kinds.map(kind => kind.records ?? '')).size !== kinds.length) throw new Error(`Ambiguous kind patterns: ${path}`);
    const language = codeLanguage(path);
    const format = language ? 'code' : /\.(json|yaml|yml|csv|md|markdown)$/iu.exec(path)?.[1]?.toLowerCase();
    if (!format) {
      if (lens) throw new Error(`No adapter for selected input: ${path}`);
      continue;
    }
    for (const kind of kinds.length ? kinds : [undefined]) selected.push({ path, kind, format });
  }
  return selected;
}

export function collectInputs({ selected, lens, sourceLink, cache }) {
  const records = [], documents = [], modules = [], files = [], inputs = [], diagnostics = [];
  const roots = new Map();
  for (const { input, kind, format } of selected) {
    const { path } = input;
    inputs.push({ path, contentHash: input.contentHash });
    let namespace, namespaceSource;
    if (kind?.namespaceFrom !== undefined) {
      const pointer = kind.namespaceFrom;
      if (!['json', 'yaml', 'yml'].includes(format) || !pointer.startsWith('/') || /~(?:[^01]|$)/u.test(pointer)) throw new Error(`namespaceFrom requires a JSON/YAML root pointer: ${path}`);
      const rootKey = `${path}:${input.contentHash}:${format}`;
      if (!roots.has(rootKey)) roots.set(rootKey, cache.extract(input, { format, selector: '' }, () => format === 'json' ? extractJson(input) : extractYaml(input)));
      const root = roots.get(rootKey);
      if (root.length !== 1 || root[0].node.sources[0]?.pointer !== '') throw new Error(`namespaceFrom requires a single root mapping: ${path}`);
      let value = root[0].node.attributes;
      for (const token of pointer.slice(1).split('/')) {
        const key = token.replaceAll('~1', '/').replaceAll('~0', '~');
        value = value !== null && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
      }
      if (typeof value !== 'string' || !value) throw new Error(`namespaceFrom must select a nonempty string: ${path}${pointer}`);
      namespace = value;
      namespaceSource = root[0].fields[pointer];
      if (!namespaceSource) throw new Error(`Missing namespace source: ${path}${pointer}`);
    }
    const extract = parse => cache.extract(input, { format, selector: ['json', 'yaml', 'yml'].includes(format) ? kind?.records ?? '' : '' }, parse);
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
      extracted = extract(() => format === 'csv' ? extractCsv(input) : ['yaml', 'yml'].includes(format) ? extractYaml(input, kind?.records ?? '') : extractJson(input, kind?.records ?? ''));
    } catch (error) {
      if (lens || !(error instanceof DataInputError)) throw error;
      diagnostics.push({ code: 'unparsed-file', path, line: error.line, message: error.reason });
      extracted = [];
    }
    for (const record of extracted) {
      const id = record.node.attributes[kind?.idField ?? 'id'];
      const name = record.node.attributes[kind?.nameField ?? 'name'];
      const originalId = typeof id === 'string' && id ? id : record.node.id;
      const selectedKind = kind?.kindField ? record.node.attributes[kind.kindField] : kind?.id ?? record.node.kind;
      if (typeof selectedKind !== 'string' || !selectedKind) throw new Error(`Missing kind field in ${path}: ${record.node.sources[0]?.pointer}`);
      const identityNamespace = namespace ?? kind?.layer;
      const attributes = identityNamespace !== undefined ? { ...record.node.attributes, ...(kind?.layer ? { layer: kind.layer } : {}), originalId, ...(namespace !== undefined ? { identityNamespace: namespace } : {}) } : record.node.attributes;
      records.push({
        node: { ...record.node, id: identityNamespace !== undefined ? `${identityNamespace}:${originalId}` : originalId, name: typeof name === 'string' && name ? name : record.node.name, kind: selectedKind, attributes, sources: [...record.node.sources, ...(namespaceSource ? [namespaceSource] : [])].map(sourceLink) },
        ...(kind?.references === false ? { references: false } : {}),
        fields: Object.fromEntries(Object.entries({ ...record.fields, ...(namespaceSource ? { '/identityNamespace': namespaceSource } : {}) }).map(([key, value]) => [key, sourceLink(value)])),
      });
    }
    if (!lens && !extracted.some(record => record.node.sources.some(source => source.pointer === ''))) {
      files.push({ id: `file:${path}`, kind: 'file', name: path, attributes: { format }, sources: [sourceLink({ path, pointer: '', line: 1, contentHash: input.contentHash })] });
    }
  }
  return { records, documents, modules, files, inputs: [...new Map(inputs.map(input => [input.path, input])).values()], diagnostics };
}
