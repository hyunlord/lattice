import { publicTypeUsage } from './public-type-usage.mjs';
import { resolveMediaAssets } from './assets.mjs';
import { parseMediaConfig } from '../dist/query/media-model.js';
import type { Options, RepositoryReader, SourceLink } from './types.mjs';
import type { DocumentDiagnostic, NodeDraft } from '../dist/index.js';
import { canonicalJson, createGraph, codeStructure, resolveRecords, resolveDocumentLinks, resolveModuleLinks, automaticFindings } from '../dist/index.js';
import { applyLens } from '../dist/lens/index.js';
import { collectInputs } from './inputs.mjs';
import { observeRepository } from './observation.mjs';
import { digest } from './storage.mjs';
import { extractionCache } from './extraction-cache.mjs';
import { buildGraft } from './graft.mjs';
import { readInterpretations, readDraftStatus } from './interpretation.mjs';
import { graftAdapterVersion } from '../dist/index.js';
import { discoverBuildPackages, resolveBuildPackageImports } from '../dist/adapters/build-manifests.js';
import { reconcileLogicGraft } from '../dist/adapters/logic-graft.js';
import { analyzeLogic } from '../dist/adapters/logic-analysis.js';
import { logicParserVersion, parseLogicFacts } from './logic-parser.mjs';
import { decodeLogicFacts } from './logic-facts-decode.mjs';

export function buildRepository(options: Options, historical?: RepositoryReader, observed?: ReturnType<typeof observeRepository>) {
    if (options.output !== undefined) throw new Error('build takes --root and --lens, not an output directory');
    const { root } = options;
    const { repository, lens, lensInput, coverage, selected, codeInputs, fingerprint, inputDiagnostics, graft: graftObservation } = observed ?? observeRepository(options, historical);
    const sourceUrls = new Map<string, string>();
    const sourceLink: SourceLink = source => {
        if (repository.dirty || !repository.remoteUrl || !repository.commit) return source;
        let url = sourceUrls.get(source.path);
        if (url === undefined) { url = `${repository.remoteUrl}/blob/${repository.commit}/${source.path.split('/').map(encodeURIComponent).join('/')}`; sourceUrls.set(source.path, url); }
        return { ...source, revision: repository.commit, url: `${url}#L${source.line}` };
    };
    const cache = extractionCache(root, options.cacheDir);
    const { records, documents, modules: extractedModules, files, inputs: recordInputs, diagnostics } = collectInputs({ selected, lens, sourceLink, cache });
    const modules = publicTypeUsage(extractedModules, selected.filter(input => input.format === 'code').map(input => input.input));
    const metadata = selected.map(selection => selection.input);
    const packages = discoverBuildPackages(metadata, modules.map(module => module.node));
    const packageNodes = packages.nodes.map(node => ({ ...node, sources: node.sources.map(sourceLink) }));
    const moduleByPath = new Map(modules.map(module => [module.node.sources[0]?.path, module]));
    const logicCache = extractionCache(root, options.cacheDir);
    const logicFacts = selected.flatMap(selection => {
        const module = moduleByPath.get(selection.path);
        return module ? [logicCache.extract(selection.input, { format: 'logic', selector: logicParserVersion }, () => parseLogicFacts(selection.input, module.language), decodeLogicFacts)] : [];
    });
    const rawLogic = analyzeLogic(logicFacts, modules, packageNodes, metadata);
    const rawGraft = buildGraft(graftObservation, selected, sourceLink);
    const reconciled = reconcileLogicGraft(rawLogic, rawGraft);
    const logic = { ...rawLogic, ...reconciled.logic }, graft = { ...rawGraft, ...reconciled.graft };
    const inputs = [...new Map([...recordInputs, ...codeInputs.map(({ path, contentHash }) => ({ path, contentHash })), ...(graftObservation?.input ? [{ path: graftObservation.input.path, contentHash: graftObservation.input.contentHash }] : [])].map(input => [input.path, input])).values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    const codeHashes = new Map(codeInputs.map(input => [input.path, input.contentHash]));
    const codeSourceLink: SourceLink = source => codeHashes.get(source.path) === source.contentHash ? sourceLink(source) : source;
    const coveredPaths = new Set(graft.coveredPaths);
    const extractedStructure = codeStructure(modules.filter(module => !module.node.sources.some(source => coveredPaths.has(source.path))));
    const logicModules = new Set(logic.coveredModuleIds);
    const removedDefinitions = new Set(extractedStructure.nodes.filter(node => node.kind === 'function' && typeof node.attributes['module'] === 'string' && logicModules.has(node.attributes['module'])).map(node => node.id));
    const structure = { nodes: extractedStructure.nodes.filter(node => !removedDefinitions.has(node.id)), edges: extractedStructure.edges.filter(edge => !removedDefinitions.has(edge.source) && !removedDefinitions.has(edge.target)) };
    const moduleLinks = resolveModuleLinks(modules, records);
    const knownNodes = [...documents.flatMap(document => document.nodes), ...modules.map(module => module.node), ...structure.nodes, ...logic.nodes, ...packageNodes, ...files, ...graft.nodes, ...moduleLinks.nodes];
    const importedLinks = new Set(graft.edges.map(edge => canonicalJson([edge.source, edge.target, edge.kind])));
    const ownEdges = moduleLinks.edges.filter(edge => !importedLinks.has(canonicalJson([edge.source, edge.target, edge.kind])));
    let documentDiagnostics: readonly DocumentDiagnostic[] = [];
    const structuralEdges = (nodes: readonly NodeDraft[]) => {
        const linked = resolveDocumentLinks(documents.map(document => ({ ...document, nodes: [] })), nodes);
        documentDiagnostics = linked.diagnostics;
        return [...linked.edges, ...ownEdges, ...moduleLinks.membershipEdges, ...structure.edges, ...logic.edges, ...packages.edges.map(edge => ({ ...edge, sources: edge.sources.map(sourceLink) })), ...resolveBuildPackageImports(packageNodes, modules), ...graft.edges];
    };
    let interpreted;
    // Adapter records and parsed lenses are data-only; library callers retain one-pass queries by default.
    if (lens && lensInput) interpreted = applyLens(records, lens, lensInput, { queryProbe: true, knownNodes, structuralEdges, codeInputs, sourceLink: codeSourceLink });
    else {
        const references = resolveRecords(records, knownNodes);
        interpreted = { ...references, edges: [...references.edges, ...structuralEdges(references.nodes)], facets: [], findings: [], views: [], presentation: { description: "JSON·YAML·CSV·문서·코드 파일에서 추출한 지도입니다. 코드 연결은 정적 분석이며 실행 증거가 아닙니다. Unity 직렬화 YAML은 포함하지 않습니다." } };
    }
    const unsupportedModules = modules.filter(module => module.node.attributes['extraction'] === 'file-only');
    const unsupportedDiagnostics = [...new Set(unsupportedModules.map(module => module.language))].sort().flatMap(language => {
        const unsupported = unsupportedModules.filter(module => module.language === language);
        const first = unsupported[0]?.node.sources[0];
        return first ? [{ code: 'unsupported-language', language, fileCount: unsupported.length, path: first.path, line: 1, message: `${language}: ${unsupported.length} source files are inventoried; definitions, imports, and calls are not supported.` }] : [];
    });
    const visibleInputDiagnostics = [...inputDiagnostics, ...unsupportedDiagnostics];
    const allDiagnostics = [...visibleInputDiagnostics, ...diagnostics, ...interpreted.diagnostics, ...documentDiagnostics, ...moduleLinks.diagnostics, ...packages.diagnostics, ...logic.diagnostics, ...graft.diagnostics];
    const findings = [...interpreted.findings, ...automaticFindings(interpreted.nodes, interpreted.edges, allDiagnostics, digest)];
    const graph = createGraph({ repository: { name: repository.name, ...(repository.remoteUrl ? { remoteUrl: repository.remoteUrl } : {}), ...(repository.commit ? { commit: repository.commit } : {}), dirty: repository.dirty, sourceFingerprint: digest(canonicalJson(inputs)) }, nodes: interpreted.nodes, edges: interpreted.edges, facets: interpreted.facets, findings, views: interpreted.views ?? [], snapshots: [], lensDigest: lensInput?.contentHash ?? null, adapterVersions: { buildManifests: '0.1', logic: logicParserVersion, automaticFindings: '0.1', json: '0.1', ...(inputs.some(input => /\.ya?ml$/iu.test(input.path)) ? { yaml: '0.1' } : {}), ...(inputs.some(input => /\.csv$/iu.test(input.path)) ? { csv: '0.1' } : {}), ...(documents.length ? { markdown: '0.1' } : {}), ...(modules.length ? { code: '0.2' } : {}), ...(lens?.codeLinks.length ? { codeSupport: '0.1' } : {}), ...(lens ? { lens: '0.1' } : {}), ...(graftObservation ? { graft: graftAdapterVersion } : {}), references: '0.1' }, inputs }, digest);
    const media = resolveMediaAssets(root, graph.nodes, parseMediaConfig(interpreted.presentation?.['media']));
    return { fingerprint, media, extraction: { stats: cache.stats, logicStats: logicCache.stats, manifest: [...cache.manifest, ...logicCache.manifest] }, graph, presentation: { ...interpreted.presentation, inputDiagnostics: visibleInputDiagnostics, logicStats: logic.stats, interpretations: readInterpretations(root, graph, historical), draftInterpretation: readDraftStatus(root, graph, historical) ?? null, mediaManifest: media.manifest }, diagnostics: allDiagnostics, coverage };
}
