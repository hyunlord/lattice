import { canonicalJson, createGraph, resolveRecords, resolveDocumentLinks, resolveModuleLinks } from '../dist/index.js';
import { applyLens } from '../dist/lens/index.js';
import { collectInputs } from './inputs.mjs';
import { observeRepository } from './observation.mjs';
import { digest } from './storage.mjs';
import { extractionCache } from './extraction-cache.mjs';
import { buildGraft } from './graft.mjs';
import { graftAdapterVersion } from '../dist/index.js';

export function buildRepository(options, historical, observed) {
  if (options.output !== undefined) throw new Error('build takes --root and --lens, not an output directory');
  const { root } = options;
  const { repository, lens, lensInput, coverage, selected, codeInputs, fingerprint, graft: graftObservation } = observed ?? observeRepository(options, historical);
  const sourceLink = source => !repository.dirty && repository.remoteUrl && repository.commit ? { ...source, revision: repository.commit, url: `${repository.remoteUrl}/blob/${repository.commit}/${source.path.split('/').map(encodeURIComponent).join('/')}#L${source.line}` } : source;
  const cache = extractionCache(root);
  const { records, documents, modules, files, inputs: recordInputs, diagnostics } = collectInputs({ selected, lens, sourceLink, cache });
  const graft = buildGraft(graftObservation, selected, sourceLink);
  const inputs = [...new Map([...recordInputs, ...codeInputs.map(({ path, contentHash }) => ({ path, contentHash })), ...(graftObservation?.input ? [{ path: graftObservation.input.path, contentHash: graftObservation.input.contentHash }] : [])].map(input => [input.path, input])).values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const codeHashes = new Map(codeInputs.map(input => [input.path, input.contentHash]));
  const codeSourceLink = source => codeHashes.get(source.path) === source.contentHash ? sourceLink(source) : source;
  const knownNodes = [...documents.flatMap(document => document.nodes), ...modules.map(module => module.node), ...files, ...graft.nodes];
  const moduleLinks = resolveModuleLinks(modules);
  const importedLinks = new Set(graft.edges.map(edge => canonicalJson([edge.source, edge.target, edge.kind])));
  const ownEdges = moduleLinks.edges.filter(edge => !importedLinks.has(canonicalJson([edge.source, edge.target, edge.kind])));
  let documentDiagnostics = [];
  const structuralEdges = nodes => {
    const linked = resolveDocumentLinks(documents.map(document => ({ ...document, nodes: [] })), nodes);
    documentDiagnostics = linked.diagnostics;
    return [...linked.edges, ...ownEdges, ...graft.edges];
  };
  let interpreted;
  if (lens && lensInput) interpreted = applyLens(records, lens, lensInput, { knownNodes, structuralEdges, codeInputs, sourceLink: codeSourceLink });
  else {
    const references = resolveRecords(records, knownNodes);
    interpreted = { ...references, edges: [...references.edges, ...structuralEdges(references.nodes)], facets: [], findings: [], views: [], presentation: { description: "JSON·YAML·CSV·문서·코드 파일에서 추출한 지도입니다. 코드 연결은 정적 분석이며 실행 증거가 아닙니다. Unity 직렬화 YAML은 포함하지 않습니다." } };
  }
  const graph = createGraph({ repository: { name: repository.name, ...(repository.remoteUrl ? { remoteUrl: repository.remoteUrl } : {}), ...(repository.commit ? { commit: repository.commit } : {}), dirty: repository.dirty, sourceFingerprint: digest(canonicalJson(inputs)) }, nodes: interpreted.nodes, edges: interpreted.edges, facets: interpreted.facets, findings: interpreted.findings, views: interpreted.views ?? [], snapshots: [], lensDigest: lensInput?.contentHash ?? null, adapterVersions: { json: '0.1', ...(inputs.some(input => /\.ya?ml$/iu.test(input.path)) ? { yaml: '0.1' } : {}), ...(inputs.some(input => /\.csv$/iu.test(input.path)) ? { csv: '0.1' } : {}), ...(documents.length ? { markdown: '0.1' } : {}), ...(modules.length ? { code: '0.1' } : {}), ...(lens?.codeLinks.length ? { codeSupport: '0.1' } : {}), ...(lens ? { lens: '0.1' } : {}), ...(graftObservation ? { graft: graftAdapterVersion } : {}), references: '0.1' }, inputs }, digest);
  return { fingerprint, extraction: { stats: cache.stats, manifest: cache.manifest }, graph, presentation: interpreted.presentation, diagnostics: [...diagnostics, ...interpreted.diagnostics, ...documentDiagnostics, ...moduleLinks.diagnostics, ...graft.diagnostics], coverage };
}
