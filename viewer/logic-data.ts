import { createPackedLoader } from './packed-data.js';
import type { Node, Edge, Repository } from '../dist/core/model.js';
import { logicNodes, logicFlow, logicLookupBucket, type LogicNode, type LogicPageOptions, type LogicCallOptions, type LogicFlowOptions, type logicEntrypoints, type logicCalls } from './logic-model.js';
import { parseGraph, object } from './data.js';
export type LogicProvider = {
    readonly entrypoints: (options?: LogicPageOptions) => Promise<ReturnType<typeof logicEntrypoints>>;
    readonly calls: (options: LogicCallOptions) => Promise<ReturnType<typeof logicCalls>>;
    readonly flow: (options: LogicFlowOptions) => Promise<ReturnType<typeof logicFlow>>;
    readonly name: (id: string) => string;
};
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
function paging(options: LogicPageOptions) {
    return { offset: Number.isSafeInteger(options.offset) ? Math.max(0, options.offset ?? 0) : 0, limit: Number.isSafeInteger(options.limit) ? Math.max(1, Math.min(200, options.limit ?? 50)) : 50 };
}
function page<T>(items: readonly T[], total: number, options: LogicPageOptions) {
    const { offset, limit } = paging(options);
    return { items: [...items], total, offset, limit, truncated: offset > 0 || offset + limit < total, nextOffset: offset + limit < total ? offset + limit : null };
}
/** Fetches only discovery pages and requested function neighborhoods, bound to the current graph hash. */
export function createLogicProvider(graphHash: string, suffix = '', expectedRepository?: Repository): LogicProvider {
    const transport = createPackedLoader('./', suffix);
    const requests = new Map<string, Promise<Record<string, unknown>>>(), names = new Map<string, string>(), descriptions = new Map<string, LogicNode>();
    const read = (path: string): Promise<Record<string, unknown>> => {
        if (!/^records\/\d+\/\d+\/logic\.json$/u.test(path) && !/^logic\/(?:index\.json|entrypoints\/\d+\.json|lookup\/[a-f0-9]{2}\.json|nodes\/[a-f0-9]{64}\.json|calls\/[a-f0-9]{64}-(?:all-)?(?:in|out)-\d+\.json)$/u.test(path)) return Promise.reject(new Error('올바르지 않은 호출 정보 경로입니다.'));
        const cached = requests.get(path); if (cached) return cached;
        const pending = (async () => {
            const value: unknown = await transport.json(path);
            if (!object(value) || value['graphHash'] !== graphHash) throw new Error('호출 정보의 출처가 현재 지도와 다릅니다. 새로고침하세요.');
            return value;
        })();
        requests.set(path, pending); void pending.catch(() => { if (requests.get(path) === pending) requests.delete(path); }); return pending;
    };
    const index = async () => {
        const value = await read('logic/index.json');
        const repository = value['repository'];
        if (expectedRepository && (!object(repository) || repository['commit'] !== expectedRepository.commit || repository['sourceFingerprint'] !== expectedRepository.sourceFingerprint || repository['dirty'] !== expectedRepository.dirty)) throw new Error('호출 정보의 소스가 현재 지도와 다릅니다.');
        if (value['schemaVersion'] !== 1 || value['pageSize'] !== 100 || !integer(value['entrypointCount']) || !integer(value['callableCount']) || !object(value['packageNames'])) throw new Error('호출 정보 목록 형식이 올바르지 않습니다.');
        for (const [id, name] of Object.entries(value['packageNames'])) if (typeof name === 'string') names.set(id, name);
        return value;
    };
    const records = async (nodes: unknown, edges: unknown) => {
        const metadata = await index();
        const graph = parseGraph({ schemaVersion: 1, hash: graphHash, repository: metadata['repository'], nodes, edges, facets: [], findings: [], views: [] });
        for (const node of graph.nodes) names.set(node.id, node.name);
        return graph;
    };
    const describe = async (value: unknown): Promise<LogicNode> => {
        if (!object(value) || !strings(value['packageIds'])) throw new Error('함수 정보 형식이 올바르지 않습니다.');
        const graph = await records([value['node']], []), item = logicNodes(graph)[0];
        if (!item) throw new Error('함수를 찾을 수 없습니다.');
        const result = { ...item, packageIds: value['packageIds'] }; descriptions.set(item.node.id, result); return result;
    };
    const detail = async (id: string) => {
        const bucket = await read(`logic/lookup/${logicLookupBucket(id)}.json`), mapping = bucket['records'];
        if (!object(mapping) || !Object.hasOwn(mapping, id) || typeof mapping[id] !== 'string') throw new Error('함수 ID를 찾을 수 없습니다.');
        const value = await read(mapping[id]); const node = await describe(value['node']);
        if (node.node.id !== id) throw new Error('함수 ID가 요청과 다릅니다.');
        return { value, node };
    };
    const edgePage = async (value: unknown, options: LogicPageOptions) => {
        if (!object(value) || !integer(value['total']) || !strings(value['pages'])) throw new Error('호출 페이지 형식이 올바르지 않습니다.');
        const { offset, limit } = paging(options), total = value['total'];
        if (value['pages'].length !== Math.max(0, Math.ceil(total / 100) - 1)) throw new Error('호출 페이지 수가 올바르지 않습니다.');
        const edges: Edge[] = [], related = new Map<string, Node>();
        for (let part = Math.floor(offset / 100); part <= Math.floor((Math.min(total, offset + limit) - 1) / 100); part++) {
            const path = value['pages'][part - 1], data = part === 0 ? value : path ? await read(path) : undefined;
            if (!data || !Array.isArray(data['items']) || data['items'].length !== Math.min(100, total - part * 100)) throw new Error('호출 페이지 크기가 올바르지 않습니다.');
            const parsed = await records(data['nodes'], data['items']);
            if (parsed.edges.some(edge => edge.kind !== 'calls' || !edge.directed || !['exact', 'estimated'].includes(String(edge.attributes?.['resolution'])))) throw new Error('올바르지 않은 정적 호출 정보입니다.');
            edges.push(...parsed.edges.slice(Math.max(0, offset - part * 100), Math.min(100, offset + limit - part * 100)));
            for (const node of parsed.nodes) related.set(node.id, node);
        }
        const ids = new Set(edges.flatMap(edge => [edge.source, edge.target]));
        return { result: page(edges, total, options), related: [...related.values()].filter(node => ids.has(node.id)) };
    };
    const calls = async (options: LogicCallOptions): Promise<ReturnType<typeof logicCalls>> => {
        const { value, node } = await detail(options.id), direction = options.direction ?? 'both';
        const incoming = direction === 'out' ? { result: page<Edge>([], 0, options), related: [] } : await edgePage(value[options.includeEstimated ? 'allIncoming' : 'incoming'], options);
        const outgoing = direction === 'in' ? { result: page<Edge>([], 0, options), related: [] } : await edgePage(value[options.includeEstimated ? 'allOutgoing' : 'outgoing'], options);
        const related = new Map([...incoming.related, ...outgoing.related].map(node => [node.id, node]));
        return { found: true, node, direction, incoming: incoming.result, outgoing: outgoing.result, relatedNodes: [...related.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), basis: 'static-call-graph' };
    };
    return {
        name: id => names.get(id) ?? id,
        calls,
        entrypoints: async (options = {}) => {
            const metadata = await index(), total = metadata['entrypointCount'];
            if (!integer(total)) throw new Error('진입점 개수가 올바르지 않습니다.');
            const { offset, limit } = paging(options), items: LogicNode[] = [];
            for (let part = Math.floor(offset / 100); part <= Math.floor((Math.min(total, offset + limit) - 1) / 100); part++) {
                const value = await read(`logic/entrypoints/${part}.json`), entries = value['items'];
                if (!Array.isArray(entries) || entries.length !== Math.min(100, total - part * 100)) throw new Error('진입점 페이지 크기가 올바르지 않습니다.');
                for (const entry of entries.slice(Math.max(0, offset - part * 100), Math.min(100, offset + limit - part * 100))) items.push(await describe(entry));
            }
            return page(items, total, options);
        },
        flow: async options => {
            const depth = Math.max(0, Math.min(10, options.depth ?? 3)), maxNodes = Math.max(1, Math.min(500, options.maxNodes ?? 100)), maxEdges = Math.max(1, Math.min(500, options.maxEdges ?? 100));
            const queue = [{ id: options.id, depth: 0 }], visited = new Set([options.id]), nodes = new Map<string, Node>(), edges = new Map<string, Edge>();
            let clipped = false, edgeBudgetExceeded = false, acceptedEdges = 0;
            for (let cursor = 0; cursor < queue.length; cursor++) {
                const current = queue[cursor]; if (!current) continue;
                const { node } = await detail(current.id); nodes.set(current.id, node.node);
                if (current.depth >= depth) { const result = await calls({ id: current.id, direction: 'out', limit: 1, includeEstimated: options.includeEstimated ?? false }); if (result.outgoing.total) clipped = true; continue; }
                for (let offset = 0; ; offset += 100) {
                    const result = await calls({ id: current.id, direction: 'out', offset, limit: 100, includeEstimated: options.includeEstimated ?? false });
                    for (const endpoint of result.relatedNodes) nodes.set(endpoint.id, endpoint);
                    for (const edge of result.outgoing.items) {
                        edges.set(edge.id, edge);
                        if (acceptedEdges >= maxEdges) { edgeBudgetExceeded = true; break; }
                        if (!visited.has(edge.target)) {
                            if (visited.size >= maxNodes) continue;
                            visited.add(edge.target); queue.push({ id: edge.target, depth: current.depth + 1 });
                        }
                        acceptedEdges++;
                    }
                    if (edgeBudgetExceeded || result.outgoing.nextOffset === null) break;
                }
            }
            const result = logicFlow({ nodes: [...nodes.values()], edges: [...edges.values()] }, options);
            return { ...result, nodes: result.nodes.map(item => ({ ...(descriptions.get(item.node.id) ?? item), depth: item.depth })), truncated: result.truncated || clipped, truncationReasons: [...new Set([...result.truncationReasons, ...(clipped ? ['depth' as const] : [])])].sort() };
        },
    };
}
