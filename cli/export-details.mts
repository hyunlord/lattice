import { createHash } from 'node:crypto';
import type { Graph, Node, Edge, Facet, Finding } from '../dist/core/model.js';
import type { DetailRef, DetailPages } from '../dist/query/node-detail-transport.js';
import { detailIdKey, detailIdentityKey } from '../dist/query/node-detail-transport.js';
import { nodeIdentity } from '../dist/query/history-model.js';
import { logicLookupBucket } from '../dist/query/logic-model.js';
import { thinGraph } from './export-evidence.mjs';
const MAX_BYTES = 262144, PAGE_SIZE = 20;
/** A packet contains fragments of requested records, never a complete repository graph. */
export function writeNodeDetails(graph: Graph, write: (path: string, text: string) => void, scope = 'details'): void {
    const binding = { schemaVersion: 1, graphHash: graph.hash, repository: graph.repository };
    const root = `details/data/${createHash('sha256').update(JSON.stringify(binding)).digest('hex')}`, lookupRoot = `${root}/lookup`;
    const header = JSON.stringify(binding).slice(0, -1) + ',"records":{';
    let packet = 0, serial = 0, pending: string[] = [], bytes = Buffer.byteLength(header) + 2;
    const flush = () => {
        if (!pending.length) return;
        write(`${root}/packets/${packet++}.json`, header + pending.join(',') + '}}');
        pending = []; bytes = Buffer.byteLength(header) + 2;
    };
    const save = (value: unknown): DetailRef => {
        const text = JSON.stringify(value), parts: { path: string; key: string; }[] = [];
        for (let start = 0; start < text.length;) {
            let end = Math.min(text.length, start + 8192);
            if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
            const key = String(serial++), entry = `${JSON.stringify(key)}:${JSON.stringify(text.slice(start, end))}`, size = Buffer.byteLength(entry) + (pending.length ? 1 : 0);
            if (pending.length && (pending.length >= 128 || bytes + size > MAX_BYTES)) flush();
            if (bytes + Buffer.byteLength(entry) > MAX_BYTES) throw new Error('Node detail binding exceeds packet byte limit');
            parts.push({ path: `${root}/packets/${packet}.json`, key }); pending.push(entry); bytes += Buffer.byteLength(entry) + (pending.length > 1 ? 1 : 0); start = end;
        }
        return { parts };
    };
    const byId = new Map(graph.nodes.map(node => [node.id, node]));
    const incoming = new Map<string, Edge[]>(), outgoing = new Map<string, Edge[]>(), undirected = new Map<string, Edge[]>();
    const facets = new Map<string, Facet[]>(), findings = new Map<string, Finding[]>();
    const add = <T,>(map: Map<string, T[]>, id: string, value: T) => { const rows = map.get(id); if (rows) rows.push(value); else map.set(id, [value]); };
    for (const edge of graph.edges) {
        if (edge.directed) { add(outgoing, edge.source, edge); add(incoming, edge.target, edge); }
        else { add(undirected, edge.source, edge); if (edge.target !== edge.source) add(undirected, edge.target, edge); }
    }
    for (const facet of graph.facets) add(facets, facet.nodeId, facet);
    for (const finding of graph.findings) for (const id of new Set(finding.targetIds)) add(findings, id, finding);
    const minimal = (nodes: readonly Node[], edges: readonly Edge[] = [], facets: readonly Facet[] = [], findings: readonly Finding[] = []) => thinGraph({ schemaVersion: 1, hash: graph.hash, repository: graph.repository, nodes, edges, facets, findings, views: [], snapshots: [], inputs: [], adapterVersions: {}, lensDigest: graph.lensDigest }, write);
    const labels = (edges: readonly Edge[]) => [...new Set(edges.flatMap(edge => [edge.source, edge.target]))].flatMap(id => {
        const node = byId.get(id);
        return node ? [{ ...node, attributes: node.attributes['layer'] === undefined ? {} : { layer: node.attributes['layer'] }, sources: [] }] : [];
    });
    const pages = <T,>(rows: readonly T[], project: (part: readonly T[]) => unknown): DetailPages => {
        const references: DetailRef[] = [];
        for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) references.push(save({ graph: project(rows.slice(offset, offset + PAGE_SIZE)) }));
        return { total: rows.length, pages: references };
    };
    const findingRefs = new Map(graph.findings.map(finding => [finding.id, save({ graph: minimal([], [], [], [finding]) })]));
    const findingPages = (rows: readonly Finding[]): DetailPages => {
        const refs: DetailRef[] = [];
        for (let offset = 0; offset < rows.length; offset += PAGE_SIZE) refs.push(save({ graph: minimal([]), findingRefs: rows.slice(offset, offset + PAGE_SIZE).map(finding => findingRefs.get(finding.id)!) }));
        return { total: rows.length, pages: refs };
    };
    const buckets = new Map<string, [string, DetailRef][]>();
    const register = (key: string, ref: DetailRef) => { const bucket = logicLookupBucket(key), rows = buckets.get(bucket); if (rows) rows.push([key, ref]); else buckets.set(bucket, [[key, ref]]); };
    for (const node of graph.nodes) {
        const relations = (rows: readonly Edge[]) => pages(rows, part => minimal(labels(part), part));
        const ref = save({
            graph: minimal([node]), facets: pages(facets.get(node.id) ?? [], part => minimal([], [], part)), findings: findingPages(findings.get(node.id) ?? []),
            relations: { incoming: relations(incoming.get(node.id) ?? []), outgoing: relations(outgoing.get(node.id) ?? []), undirected: relations(undirected.get(node.id) ?? []) }
        });
        register(detailIdKey(node.id), ref); register(detailIdentityKey(nodeIdentity(node)), ref);
    }
    for (let index = 0; index < 256; index++) {
        const bucket = index.toString(16).padStart(2, '0'), rows = (buckets.get(bucket) ?? []).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        const ranges: { first: string; last: string; ref: DetailRef; }[] = [];
        for (let start = 0; start < rows.length; start += 128) {
            const part = rows.slice(start, start + 128), records: Record<string, DetailRef> = {};
            for (const [key, value] of part) if (!Object.hasOwn(records, key)) Object.defineProperty(records, key, { value, enumerable: true });
            ranges.push({ first: part[0]![0], last: part[part.length - 1]![0], ref: save(records) });
        }
        const text = JSON.stringify({ ...binding, ranges });
        if (Buffer.byteLength(text) > MAX_BYTES) throw new Error('Node detail lookup exceeds packet byte limit');
        write(`${lookupRoot}/${bucket}.json`, text); buckets.delete(bucket);
    }
    flush();
    write(`${scope}/index.json`, JSON.stringify({ ...binding, lookupRoot, pageSize: PAGE_SIZE, nodeCount: graph.nodes.length }));
}
