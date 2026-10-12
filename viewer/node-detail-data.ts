import type { Repository, Snapshot } from '../dist/core/model.js';
import { detailIdKey, detailIdentityKey, detailLabelKey, type DetailBinding, type DetailIndex, type DetailPages, type DetailRef } from './node-detail-transport.js';
import { nodeIdentity } from './history-model.js';
import { logicLookupBucket } from './logic-model.js';
import { object, parseGraph, type BrowserGraph } from './data.js';
export type NodeDetailRecord = { readonly graph: BrowserGraph; readonly presentationRelations?: readonly { readonly label: string; readonly pages: DetailPages; }[]; readonly facets: DetailPages; readonly findings: DetailPages; readonly relations: { readonly incoming: DetailPages; readonly outgoing: DetailPages; readonly undirected: DetailPages; }; };
function path(value: unknown): value is string { return typeof value === 'string' && /^details\/[a-zA-Z0-9_./-]+\.json$/u.test(value) && !value.split('/').includes('..'); }
function ref(value: unknown): value is DetailRef { return object(value) && Array.isArray(value['parts']) && value['parts'].length > 0 && value['parts'].every(part => object(part) && path(part['path']) && typeof part['key'] === 'string'); }
function pages(value: unknown): value is DetailPages { return object(value) && Number.isSafeInteger(value['total']) && Number(value['total']) >= 0 && Array.isArray(value['pages']) && value['pages'].length === Math.ceil(Number(value['total']) / 20) && value['pages'].every(ref); }
function bound(value: unknown, expected: { readonly graphHash: string; readonly repository?: Repository; }): asserts value is Record<string, unknown> & DetailBinding {
    if (!object(value) || value['schemaVersion'] !== 1 || value['graphHash'] !== expected.graphHash || !object(value['repository'])) throw new Error('노드 상세의 소스가 다릅니다. 지도를 새로 고치세요.');
    const repository = value['repository'];
    if (typeof repository['name'] !== 'string' || typeof repository['dirty'] !== 'boolean' || typeof repository['sourceFingerprint'] !== 'string' || expected.repository && (repository['commit'] !== expected.repository.commit || repository['sourceFingerprint'] !== expected.repository.sourceFingerprint || repository['dirty'] !== expected.repository.dirty)) throw new Error('노드 상세의 소스가 다릅니다. 지도를 새로 고치세요.');
}
export function createNodeDetailLoader(expected: { readonly hash: string; readonly repository: Repository; }, suffix = '') {
    const pending = new Map<string, Promise<unknown>>();
    let transport: Promise<ReturnType<typeof import('./packed-data.js')['createPackedLoader']>> | undefined;
    const readPacked = (file: string) => (transport ??= import('./packed-data.js').then(module => module.createPackedLoader('./', suffix))).then(loader => loader.json(file));
    const read = (file: string, optional = false, binding?: { readonly graphHash: string; readonly repository?: Repository; }): Promise<unknown> => {
        if (!path(file)) return Promise.reject(new Error('노드 상세 경로가 올바르지 않습니다.'));
        const cached = pending.get(file); if (cached) return cached;
        const request = (async () => { let value: unknown; try { value = await readPacked(file); } catch (error) { if (optional && error instanceof Error && /HTTP 404:/u.test(error.message)) return undefined; throw error; } if (binding) bound(value, binding); return value; })();
        pending.set(file, request); void request.then(value => { if (value === undefined) pending.delete(file); }, () => pending.delete(file));
        // Keep navigation memory bounded; active promises remain owned by their callers.
        if (pending.size > 32) { const first = pending.keys().next().value; if (first) pending.delete(first); }
        return request;
    };
    const index = async (snapshot?: Snapshot): Promise<DetailIndex | undefined> => {
        const value = await read(snapshot ? `details/snapshots/${snapshot.id}/index.json` : 'details/index.json', !snapshot, snapshot ? { graphHash: snapshot.graphHash } : { graphHash: expected.hash, repository: expected.repository });
        if (value === undefined) return undefined;
        bound(value, snapshot ? { graphHash: snapshot.graphHash } : { graphHash: expected.hash, repository: expected.repository });
        if (snapshot && value.repository.commit !== snapshot.commit) throw new Error('스냅샷 상세의 소스가 다릅니다.');
        if (typeof value['lookupRoot'] !== 'string' || !path(value['lookupRoot'] + '/00.json') || value['pageSize'] !== 20 || !Number.isSafeInteger(value['nodeCount'])) throw new Error('노드 상세 목록 형식이 올바르지 않습니다.');
        return value as DetailIndex;
    };
    const record = async (binding: DetailIndex, reference: DetailRef): Promise<unknown> => {
        if (!ref(reference)) throw new Error('노드 상세 조각 참조가 올바르지 않습니다.');
        const chunks: string[] = [];
        for (const part of reference.parts) { const value = await read(part.path, false, binding); bound(value, binding); if (!object(value['records']) || !Object.hasOwn(value['records'], part.key) || typeof value['records'][part.key] !== 'string') throw new Error('노드 상세 조각이 없습니다.'); chunks.push(String(value['records'][part.key])); }
        return JSON.parse(chunks.join('')) as unknown;
    };
    const graph = (value: unknown, binding: DetailIndex): BrowserGraph => {
        const result = parseGraph(value); bound({ schemaVersion: 1, graphHash: result.hash, repository: result.repository }, binding); return result;
    };
    const lookupRecord = async (binding: DetailIndex, key: string): Promise<unknown> => {
        const lookup = await read(`${binding.lookupRoot}/${logicLookupBucket(key)}.json`, false, binding); bound(lookup, binding);
        if (!Array.isArray(lookup['ranges']) || !lookup['ranges'].every(item => object(item) && typeof item['first'] === 'string' && typeof item['last'] === 'string' && item['first'] <= item['last'] && ref(item['ref']))) throw new Error('노드 상세 색인 형식이 올바르지 않습니다.');
        const range = lookup['ranges'].find((item: unknown) => object(item) && typeof item['first'] === 'string' && typeof item['last'] === 'string' && item['first'] <= key && key <= item['last']);
        if (!range) return undefined;
        if (!object(range) || !ref(range['ref'])) throw new Error('노드 상세 색인 참조가 올바르지 않습니다.');
        const mapping = await record(binding, range['ref']); if (!object(mapping)) throw new Error('노드 상세 색인이 올바르지 않습니다.');
        if (!Object.hasOwn(mapping, key)) return undefined; const reference = mapping[key]; if (!ref(reference)) throw new Error('노드 상세 참조가 올바르지 않습니다.');
        return record(binding, reference);
    };
    const label = async (binding: DetailIndex, id: string) => {
        const value = await lookupRecord(binding, detailLabelKey(id)); if (value === undefined) return undefined; if (!object(value)) throw new Error('노드 표시명 형식이 올바르지 않습니다.'); const data = graph(value['graph'], binding); if (data.nodes.length !== 1 || data.nodes[0]?.id !== id) throw new Error('노드 표시명의 항목이 다릅니다.'); return data.nodes[0];
    };
    const node = async (binding: DetailIndex, id: string, identity = false): Promise<NodeDetailRecord | undefined> => {
        const value = await lookupRecord(binding, identity ? detailIdentityKey(id) : detailIdKey(id)); if (value === undefined) return undefined;
        if (!object(value) || !pages(value['facets']) || !pages(value['findings']) || !object(value['relations']) || !pages(value['relations']['incoming']) || !pages(value['relations']['outgoing']) || !pages(value['relations']['undirected'])) throw new Error('노드 상세 형식이 올바르지 않습니다.');
        const result = graph(value['graph'], binding);
        if (result.nodes.length !== 1 || (identity ? nodeIdentity(result.nodes[0]!) !== id : result.nodes[0]?.id !== id)) throw new Error('노드 상세의 항목이 다릅니다.');
        const presentationRelations = value['presentationRelations'];
        if (presentationRelations !== undefined && (!Array.isArray(presentationRelations) || !presentationRelations.every(item => object(item) && typeof item['label'] === 'string' && pages(item['pages'])))) throw new Error('사람용 관계 목록이 올바르지 않습니다.');
        return { graph: result, ...(presentationRelations === undefined ? {} : { presentationRelations: presentationRelations as { label: string; pages: DetailPages; }[] }), facets: value['facets'], findings: value['findings'], relations: { incoming: value['relations']['incoming'], outgoing: value['relations']['outgoing'], undirected: value['relations']['undirected'] } };
    };
    const page = async (binding: DetailIndex, collection: DetailPages, number: number): Promise<BrowserGraph> => {
        const reference = collection.pages[number]; if (!reference) throw new Error('노드 상세 페이지가 없습니다.'); const value = await record(binding, reference); if (!object(value)) throw new Error('노드 상세 페이지 형식이 올바르지 않습니다.'); const result = graph(value['graph'], binding);
        if (value['findingRefs'] !== undefined) { if (!Array.isArray(value['findingRefs']) || value['findingRefs'].length > 20 || !value['findingRefs'].every(ref)) throw new Error('발견 상세 참조가 올바르지 않습니다.'); for (const reference of value['findingRefs']) { const shared = await record(binding, reference); if (!object(shared)) throw new Error('발견 상세 형식이 올바르지 않습니다.'); const data = graph(shared['graph'], binding); result.findings.push(...data.findings); } }
        return result;
    };
    const retryable = async <T>(run: () => Promise<T>): Promise<T> => { try { return await run(); } catch (error) { pending.clear(); throw error; } };
    return { label: (binding: DetailIndex, id: string) => retryable(() => label(binding, id)), index: (snapshot?: Snapshot) => retryable(() => index(snapshot)), node: (binding: DetailIndex, id: string, identity = false) => retryable(() => node(binding, id, identity)), page: (binding: DetailIndex, collection: DetailPages, number: number) => retryable(() => page(binding, collection, number)) };
}
export type NodeDetailLoader = ReturnType<typeof createNodeDetailLoader>;
