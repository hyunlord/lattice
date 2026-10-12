import { createHash } from 'node:crypto';
import type { Graph, Edge } from '../dist/core/model.js';
import { logicNodes, logicLookupBucket, rankedLogicFunctions } from '../dist/query/logic-model.js';
const PAGE_SIZE = 100;
/** Separate function records keep entry discovery and local call inspection independent of full graph download. */
export function writeLogic(graph: Graph, write: (path: string, text: string) => void): void {
    const nodes = logicNodes(graph), byId = new Map(nodes.map(item => [item.node.id, item.node])), ids = new Set(nodes.map(item => item.node.id));
    const incoming = new Map<string, Edge[]>(), outgoing = new Map<string, Edge[]>();
    for (const edge of [...graph.edges].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
        if (edge.kind !== 'calls' || !edge.directed || !ids.has(edge.source) || !ids.has(edge.target) || !['exact', 'estimated'].includes(String(edge.attributes?.['resolution']))) continue;
        for (const [map, id] of [[incoming, edge.target], [outgoing, edge.source]] as const) { const edges = map.get(id) ?? []; edges.push(edge); map.set(id, edges); }
    }
    const save = (path: string, data: object) => write(path, JSON.stringify({ graphHash: graph.hash, ...data }));
    const logicById = new Map(nodes.map(item => [item.node.id, item]));
    const entries = rankedLogicFunctions(graph).flatMap(node => { const item = logicById.get(node.id); return item?.entrypoints.length ? [item] : []; });
    save('logic/index.json', { schemaVersion: 1, repository: graph.repository, entrypointCount: entries.length, callableCount: nodes.length, pageSize: PAGE_SIZE, packageNames: Object.fromEntries(graph.nodes.filter(node => node.kind === 'package').map(node => [node.id, node.name])) });
    for (let offset = 0; offset < entries.length; offset += PAGE_SIZE) save(`logic/entrypoints/${offset / PAGE_SIZE}.json`, { items: entries.slice(offset, offset + PAGE_SIZE) });
    const buckets = new Map<string, Record<string, string>>();
    for (const item of nodes) {
        const id = item.node.id, key = createHash('sha256').update(id).digest('hex'), path = `logic/nodes/${key}.json`, bucket = logicLookupBucket(id);
        const records = buckets.get(bucket) ?? {}; Object.defineProperty(records, id, { value: path, enumerable: true }); buckets.set(bucket, records);
        const pages = (edges: readonly Edge[], direction: string) => {
            const paths: string[] = [];
            const related = (part: readonly Edge[]) => [...new Set(part.flatMap(edge => [edge.source, edge.target]))].flatMap(id => { const node = byId.get(id); return node ? [node] : []; });
            for (let offset = PAGE_SIZE; offset < edges.length; offset += PAGE_SIZE) { const page = `logic/calls/${key}-${direction}-${offset / PAGE_SIZE}.json`; save(page, { items: edges.slice(offset, offset + PAGE_SIZE), nodes: related(edges.slice(offset, offset + PAGE_SIZE)) }); paths.push(page); }
            return { total: edges.length, items: edges.slice(0, PAGE_SIZE), nodes: related(edges.slice(0, PAGE_SIZE)), pages: paths };
        };
        const ins = incoming.get(id) ?? [], outs = outgoing.get(id) ?? [];
        save(path, { node: item, incoming: pages(ins.filter(edge => edge.attributes?.['resolution'] === 'exact'), 'in'), outgoing: pages(outs.filter(edge => edge.attributes?.['resolution'] === 'exact'), 'out'), allIncoming: pages(ins, 'all-in'), allOutgoing: pages(outs, 'all-out') });
    }
    for (let bucket = 0; bucket < 256; bucket++) { const key = bucket.toString(16).padStart(2, '0'); save(`logic/lookup/${key}.json`, { records: buckets.get(key) ?? {} }); }
}
