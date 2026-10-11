import { object } from './data.js';
import type { Repository } from '../dist/core/model.js';
import type { LoopMap, LoopNode, LoopStage, LoopFlow } from './loop-map-types.js';
export type OverviewLayer = { readonly id: string; readonly label: string; readonly path: string; readonly deferred: boolean; readonly model: LoopMap; };
export type Overview = { readonly schemaVersion: 1; readonly hash: string; readonly repository: Repository; readonly defaultLayer: string; readonly limitations: readonly { readonly language: string; readonly fileCount: number; }[]; readonly kinds: readonly { readonly id: string; readonly label?: string; }[]; readonly layers: readonly OverviewLayer[]; };
const string = (value: unknown): value is string => typeof value === 'string';
function list<T>(value: unknown, check: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(check); }
function repository(value: unknown): value is Repository { return object(value) && string(value['name']) && string(value['sourceFingerprint']) && typeof value['dirty'] === 'boolean' && (value['commit'] === undefined || string(value['commit'])) && (value['remoteUrl'] === undefined || string(value['remoteUrl'])); }
function node(value: unknown): value is LoopNode { return object(value) && string(value['id']) && string(value['name']) && string(value['kind']) && string(value['summary']) && ['present', 'absent', 'unknown'].includes(String(value['status'])) && list(value['fields'], (field): field is { label: string; value: string | string[]; } => object(field) && string(field['label']) && (string(field['value']) || list(field['value'], string))) && list(value['relationGroups'], (group): group is LoopNode['relationGroups'][number] => object(group) && ['incoming', 'outgoing'].includes(String(group['side'])) && string(group['label']) && list(group['items'], (item): item is { id: string; } => object(item) && string(item['id']))); }
function stage(value: unknown): value is LoopStage { return object(value) && ['id', 'title', 'summary', 'unit'].every(key => string(value[key])) && list(value['nodeIds'], string) && list(value['groups'], (group): group is LoopStage['groups'][number] => object(group) && string(group['title']) && list(group['items'], (item): item is { id: string; } => object(item) && string(item['id']))) && list(value['incoming'], influence) && list(value['outgoing'], influence) && (value['childIds'] === undefined || list(value['childIds'], string)) && (value['descendantNodeIds'] === undefined || list(value['descendantNodeIds'], string)); }
function influence(value: unknown): value is { name: string; description: string; } { return object(value) && string(value['name']) && string(value['description']); }
function flow(value: unknown): value is LoopFlow { return object(value) && string(value['source']) && string(value['target']) && string(value['label']) && (value['sourceFiles'] === undefined || list(value['sourceFiles'], string)) && (value['projectSourceFiles'] === undefined || list(value['projectSourceFiles'], string)); }
export function loopModel(value: unknown): value is LoopMap {
    if (!object(value)) return false;
    const labels = value['statusLabels'];
    if (!string(value['lead']) || !list(value['nodes'], node) || !list(value['stages'], stage) || !list(value['flows'], flow) || !object(labels) || !['present', 'absent', 'unknown'].every(key => string(labels[key]))) return false;
    const scope = value['structuralScope'];
    return (value['rootStageIds'] === undefined || list(value['rootStageIds'], string)) && (scope === undefined || object(scope) && ['production', 'all'].includes(String(scope['default'])) && typeof scope['productionCount'] === 'number' && typeof scope['auxiliaryCount'] === 'number' && list(scope['allRootStageIds'], string) && string(scope['allDefaultStage']));
}
function layer(value: unknown): value is OverviewLayer { return object(value) && string(value['id']) && string(value['label']) && string(value['path']) && /^overview\/[a-f0-9]{64}\.json$/u.test(value['path']) && typeof value['deferred'] === 'boolean' && loopModel(value['model']); }
export function parseOverview(value: unknown): Overview {
    if (!object(value) || value['schemaVersion'] !== 1 || !string(value['hash']) || !repository(value['repository']) || !string(value['defaultLayer']) || !list(value['layers'], layer) || !value['layers'].some(layer => layer.id === value['defaultLayer']) || !list(value['kinds'], (kind): kind is { id: string; label?: string; } => object(kind) && string(kind['id']) && (kind['label'] === undefined || string(kind['label'])))) throw new Error('첫 화면 데이터 형식이 올바르지 않습니다.');
    const limitations = value['limitations'];
    const parsedLimitations = limitations === undefined ? [] : list(limitations, (item): item is { language: string; fileCount: number; } => object(item) && string(item['language']) && typeof item['fileCount'] === 'number' && Number.isSafeInteger(item['fileCount']) && item['fileCount'] > 0) ? limitations : undefined;
    if (!parsedLimitations) throw new Error('지원 범위 안내 형식이 올바르지 않습니다.');
    return { schemaVersion: 1, limitations: parsedLimitations, hash: value['hash'], repository: value['repository'], defaultLayer: value['defaultLayer'], layers: value['layers'], kinds: value['kinds'] };
}
export function createOverviewLoader(suffix = '') {
    const models = new Map<string, Promise<LoopMap>>();
    return {
        async read(): Promise<Overview | undefined> {
            const response = await fetch('./overview.json' + suffix);
            if (response.status === 404) return undefined;
            if (!response.ok) throw new Error(`overview.json HTTP ${response.status}`);
            return parseOverview(await response.json());
        },
        model(overview: Overview, layer: OverviewLayer): Promise<LoopMap> {
            const key = overview.hash + ':' + layer.path, prior = models.get(key); if (prior) return prior;
            const pending = (async () => {
                const response = await fetch('./' + layer.path + suffix);
                if (!response.ok) throw new Error(`첫 화면 상세 HTTP ${response.status}`);
                const value: unknown = await response.json();
                if (!object(value) || value['schemaVersion'] !== 1 || value['hash'] !== overview.hash || !repository(value['repository']) || value['repository'].sourceFingerprint !== overview.repository.sourceFingerprint || value['repository'].commit !== overview.repository.commit || !loopModel(value['model'])) throw new Error('첫 화면과 상세의 소스가 다릅니다. 지도를 새로 고치세요.');
                return value['model'];
            })();
            models.set(key, pending); pending.catch(() => models.delete(key)); return pending;
        },
    };
}
