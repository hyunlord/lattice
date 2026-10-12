import { object } from './data.js';
import type { Repository } from '../dist/core/model.js';
import type { LoopMap, LoopNode, LoopStage, LoopFlow } from './loop-map-types.js';
export type OverviewLayer = { readonly id: string; readonly label: string; readonly path: string; readonly deferred: boolean; readonly parts?: string; readonly model: LoopMap; };
export type Overview = { readonly schemaVersion: 1; readonly hash: string; readonly repository: Repository; readonly defaultLayer: string; readonly limitations: readonly { readonly language: string; readonly fileCount: number; }[]; readonly kinds: readonly { readonly id: string; readonly label?: string; }[]; readonly layers: readonly OverviewLayer[]; };
const count = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const string = (value: unknown): value is string => typeof value === 'string';
function list<T>(value: unknown, check: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(check); }
function repository(value: unknown): value is Repository { return object(value) && string(value['name']) && string(value['sourceFingerprint']) && typeof value['dirty'] === 'boolean' && (value['commit'] === undefined || string(value['commit'])) && (value['remoteUrl'] === undefined || string(value['remoteUrl'])); }
function node(value: unknown): value is LoopNode { return object(value) && string(value['id']) && string(value['name']) && string(value['kind']) && string(value['summary']) && ['present', 'absent', 'unknown'].includes(String(value['status'])) && list(value['fields'], (field): field is { label: string; value: string | string[]; } => object(field) && string(field['label']) && (string(field['value']) || list(field['value'], string))) && list(value['relationGroups'], (group): group is LoopNode['relationGroups'][number] => object(group) && ['incoming', 'outgoing'].includes(String(group['side'])) && string(group['label']) && list(group['items'], (item): item is { id: string; } => object(item) && string(item['id']))); }
function stage(value: unknown): value is LoopStage { return object(value) && ['id', 'title', 'summary', 'unit'].every(key => string(value[key])) && list(value['nodeIds'], string) && list(value['groups'], (group): group is LoopStage['groups'][number] => object(group) && string(group['title']) && list(group['items'], (item): item is { id: string; } => object(item) && string(item['id']))) && list(value['incoming'], influence) && list(value['outgoing'], influence) && (value['childIds'] === undefined || list(value['childIds'], string)) && (value['descendantNodeIds'] === undefined || list(value['descendantNodeIds'], string)) && (value['nodeCount'] === undefined || count(value['nodeCount'])) && (value['descendantNodeCount'] === undefined || count(value['descendantNodeCount'])); }
function influence(value: unknown): value is { name: string; description: string; } { return object(value) && string(value['name']) && string(value['description']); }
function flow(value: unknown): value is LoopFlow { return object(value) && string(value['source']) && string(value['target']) && string(value['label']) && (value['sourceFiles'] === undefined || list(value['sourceFiles'], string)) && (value['projectSourceFiles'] === undefined || list(value['projectSourceFiles'], string)) && (value['count'] === undefined || count(value['count'])) && (value['projectCount'] === undefined || count(value['projectCount'])); }
export function loopModel(value: unknown): value is LoopMap {
    if (!object(value)) return false;
    const labels = value['statusLabels'];
    if (!string(value['lead']) || !list(value['nodes'], node) || !list(value['stages'], stage) || !list(value['flows'], flow) || !object(labels) || !['present', 'absent', 'unknown'].every(key => string(labels[key]))) return false;
    const pages = value['structuralDependencyPages'];
    if (value['structuralProjection'] !== undefined && value['structuralProjection'] !== 'summary') return false;
    if (pages !== undefined && (!Array.isArray(pages) || !pages.every(page => object(page) && list(page['stageIds'], string) && object(page['nodeCounts']) && Object.values(page['nodeCounts']).every(count) && list(page['flows'], flow) && list(page['relatedFlows'], flow) && list(page['displayFlows'], flow) && Array.isArray(page['actualCycles']) && page['actualCycles'].every(cycle => list(cycle, string))))) return false;
    const scope = value['structuralScope'];
    return (value['rootStageIds'] === undefined || list(value['rootStageIds'], string)) && (scope === undefined || object(scope) && ['production', 'all'].includes(String(scope['default'])) && typeof scope['productionCount'] === 'number' && typeof scope['auxiliaryCount'] === 'number' && list(scope['allRootStageIds'], string) && string(scope['allDefaultStage']));
}
function layer(value: unknown): value is OverviewLayer { return object(value) && string(value['id']) && string(value['label']) && string(value['path']) && /^overview\/[a-f0-9]{64}\.json$/u.test(value['path']) && (value['parts'] === undefined || string(value['parts']) && /^overview-parts\/[a-f0-9]{64}$/u.test(value['parts'])) && typeof value['deferred'] === 'boolean' && loopModel(value['model']); }
export function parseOverview(value: unknown): Overview {
    if (!object(value) || value['schemaVersion'] !== 1 || !string(value['hash']) || !repository(value['repository']) || !string(value['defaultLayer']) || !list(value['layers'], layer) || !value['layers'].some(layer => layer.id === value['defaultLayer']) || !list(value['kinds'], (kind): kind is { id: string; label?: string; } => object(kind) && string(kind['id']) && (kind['label'] === undefined || string(kind['label'])))) throw new Error('첫 화면 데이터 형식이 올바르지 않습니다.');
    const limitations = value['limitations'];
    const parsedLimitations = limitations === undefined ? [] : list(limitations, (item): item is { language: string; fileCount: number; } => object(item) && string(item['language']) && typeof item['fileCount'] === 'number' && Number.isSafeInteger(item['fileCount']) && item['fileCount'] > 0) ? limitations : undefined;
    if (!parsedLimitations) throw new Error('지원 범위 안내 형식이 올바르지 않습니다.');
    return { schemaVersion: 1, limitations: parsedLimitations, hash: value['hash'], repository: value['repository'], defaultLayer: value['defaultLayer'], layers: value['layers'], kinds: value['kinds'] };
}
function bucket(id: string): string { let value = 0; for (const char of id) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); }
export function createOverviewLoader(suffix = '') {
    const models = new Map<string, Promise<LoopMap>>();
    let transport: Promise<ReturnType<typeof import('./packed-data.js')['createPackedLoader']>> | undefined;
    const readPacked = (path: string) => (transport ??= import('./packed-data.js').then(module => module.createPackedLoader('./', suffix))).then(loader => loader.json(path));
    const lookups = new Map<string, Promise<Record<string, string>>>();
    const matches = (value: unknown, overview: Overview): value is Record<string, unknown> => object(value) && value['schemaVersion'] === 1 && value['hash'] === overview.hash && repository(value['repository']) && value['repository'].sourceFingerprint === overview.repository.sourceFingerprint && value['repository'].commit === overview.repository.commit;
    const partPath = async (overview: Overview, layer: OverviewLayer, key: string): Promise<string | undefined> => {
        const path = `${layer.parts}/lookup/${bucket(key)}.json`, cacheKey = overview.hash + ':' + path;
        let pending = lookups.get(cacheKey);
        if (!pending) {
            pending = (async () => {
                const value: unknown = await readPacked(path);
                if (!matches(value, overview) || !object(value['records']) || !Object.values(value['records']).every(item => string(item) && item.startsWith(`${layer.parts}/data/`) && /^overview-parts\/[a-f0-9]{64}\/data\/[a-f0-9]{64}\.json$/u.test(item))) throw new Error('첫 화면과 상세의 소스가 다릅니다. 지도를 새로 고치세요.');
                return value['records'] as Record<string, string>;
            })(); lookups.set(cacheKey, pending); pending.catch(() => lookups.delete(cacheKey));
        }
        const records = await pending;
        if (!Object.hasOwn(records, key) || !records[key]) { if (key.startsWith('focus:')) return undefined; throw new Error('이 지도 항목을 찾을 수 없습니다. 지도를 새로 고치세요.'); }
        return records[key];
    };
    return {
        async read(): Promise<Overview | undefined> {
            const response = await fetch('./overview.json' + suffix);
            if (response.status === 404) return undefined;
            if (!response.ok) throw new Error(`overview.json HTTP ${response.status}`);
            return parseOverview(await response.json());
        },
        async model(overview: Overview, layer: OverviewLayer, params?: URLSearchParams): Promise<LoopMap> {
            let path: string | undefined = layer.path;
            if (layer.parts && params) {
                const focus = params.get('view') === 'focus' ? params.get('item') ?? layer.model.defaultFocus : undefined;
                const scope = params.get('scope') ?? layer.model.structuralScope?.default ?? 'production';
                const key = params.get('view') === 'catalog' ? 'catalog' : focus ? 'focus:' + focus : params.get('stage') ? 'stage:' + params.get('stage') : 'page:' + JSON.stringify([scope, params.get('parent') ?? '', Math.max(0, Number(params.get('page')) || 0)]);
                path = await partPath(overview, layer, key);
            }
            if (path === undefined) {
                const id = params?.get('item') ?? layer.model.defaultFocus; if (!id) throw new Error('함수를 찾을 수 없습니다.');
                const key = overview.hash + ':function-focus:' + id, previous = models.get(key); if (previous) return previous;
                const pending = (async () => {
                    const [{ createLogicProvider }, { buildFunctionFocus }] = await Promise.all([import('./logic-data.js'), import('./loop-map-model.js')]);
                    const calls = await createLogicProvider(overview.hash, suffix, overview.repository).calls({ id, direction: 'both', limit: 50 });
                    if (!calls.found || !calls.node) throw new Error('함수를 찾을 수 없습니다.');
                    const nodes = [...new Map([calls.node.node, ...calls.relatedNodes].map(node => [node.id, node])).values()];
                    const edges = [...new Map([...calls.incoming.items, ...calls.outgoing.items].map(edge => [edge.id, edge])).values()];
                    const model = buildFunctionFocus(nodes, edges, { kinds: [...overview.kinds] }, overview.repository.name, id);
                    return { ...model, lead: `${model.lead} · 들어오는 호출 ${calls.incoming.items.length}/${calls.incoming.total}, 나가는 호출 ${calls.outgoing.items.length}/${calls.outgoing.total}` };
                })(); models.set(key, pending); void pending.catch(() => models.delete(key)); return pending;
            }
            const selectedPath = path;
            const key = overview.hash + ':' + selectedPath, prior = models.get(key); if (prior) return prior;
            const pending = (async () => {
                const value: unknown = await readPacked(selectedPath);
                if (!matches(value, overview) || !loopModel(value['model'])) throw new Error('첫 화면과 상세의 소스가 다릅니다. 지도를 새로 고치세요.');
                return value['model'];
            })();
            models.set(key, pending); pending.catch(() => models.delete(key)); return pending;
        },
    };
}
