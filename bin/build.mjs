import { canonicalJson, createGraph, resolveRecords, resolveDocumentLinks, resolveModuleLinks } from '../dist/index.js';
import { applyLens } from '../dist/lens/index.js';
import { collectInputs } from './inputs.mjs';
import { observeRepository } from './observation.mjs';
import { digest } from './storage.mjs';
import { extractionCache } from './extraction-cache.mjs';

export function buildRepository(options, historical, observed) {
  if (options.output !== undefined) throw new Error('build takes --root and --lens, not an output directory');
  const { root } = options;
  const { repository, lens, lensInput, coverage, selected, fingerprint } = observed ?? observeRepository(options, historical);
  const sourceLink = source => !repository.dirty && repository.remoteUrl && repository.commit ? { ...source, revision: repository.commit, url: `${repository.remoteUrl}/blob/${repository.commit}/${source.path.split('/').map(encodeURIComponent).join('/')}#L${source.line}` } : source;
  const cache = extractionCache(root);
  const { records, documents, modules, files, inputs, diagnostics } = collectInputs({ selected, lens, sourceLink, cache });
  const interpreted = lens && lensInput ? applyLens(records, lens, lensInput) : { nodes: records.map(record => record.node), facets: [], findings: [], presentation: { description: "JSON·CSV·문서·코드 파일에서 추출한 지도입니다. 코드 연결은 JS/TS·Python의 정적 import이며 실행 증거가 아닙니다. YAML은 아직 포함하지 않습니다." } };
  const nodes = new Map(interpreted.nodes.map(node => [node.id, node]));
  const references = resolveRecords(lens ? records.map(record => ({ ...record, node: nodes.get(record.node.id) ?? record.node })) : records);
  const linked = resolveDocumentLinks(documents, [...references.nodes, ...modules.map(module => module.node), ...files]);
  const moduleLinks = resolveModuleLinks(modules);
  const graph = createGraph({ repository: { name: repository.name, ...(repository.remoteUrl ? { remoteUrl: repository.remoteUrl } : {}), ...(repository.commit ? { commit: repository.commit } : {}), dirty: repository.dirty, sourceFingerprint: digest(canonicalJson(inputs)) }, nodes: linked.nodes, edges: [...references.edges, ...linked.edges, ...moduleLinks.edges], facets: interpreted.facets, findings: interpreted.findings, views: [], snapshots: [], lensDigest: lensInput?.contentHash ?? null, adapterVersions: { json: '0.1', ...(inputs.some(input => /\.csv$/iu.test(input.path)) ? { csv: '0.1' } : {}), ...(documents.length ? { markdown: '0.1' } : {}), ...(modules.length ? { code: '0.1' } : {}), ...(lens ? { lens: '0.1' } : {}), references: '0.1' }, inputs }, digest);
  return { fingerprint, extraction: { stats: cache.stats, manifest: cache.manifest }, graph, presentation: interpreted.presentation, diagnostics: [...diagnostics, ...references.diagnostics, ...linked.diagnostics, ...moduleLinks.diagnostics], coverage };
}
