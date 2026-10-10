import type { Node, Edge, Facet } from '../core/model.js';
import type { LoopMap, LoopNode, LoopStage, LoopInterpretation, LoopRelationGroup, LoopItem } from './loop-map-types.js';
import type { LoopConfig } from './loop-config.js';
import type { MediaManifest } from './media-model.js';
import { buildStructuralMap, productionSource, structuralSummary } from './structural-map-model.js';
export type LoopPresentation = {
    name?: string; loop?: LoopConfig;
    kinds: readonly { id: string; label?: string; }[];
    facets?: Record<string, { label?: string; values?: Record<string, string>; }>;
    detail?: { summaryFields?: readonly { label: string; path: readonly string[]; }[]; summaryFieldsByKind?: Readonly<Record<string, readonly { label: string; path: readonly string[]; }[]>>; relationships?: readonly { label: string; edgeKinds: readonly string[]; direction: 'incoming' | 'outgoing' | 'both'; }[]; };
    interpretations?: readonly { targetId: string; summary: string; status: string; sources: readonly { path: string; line?: number; url?: string; }[]; }[];
    mediaManifest?: MediaManifest;
};
export function buildLoopMap(nodes: readonly Node[], edges: readonly Edge[], facets: readonly Facet[], presentation: LoopPresentation, repositoryName: string): LoopMap {
    const config = presentation.loop;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const outgoing = new Map<string, Edge[]>(), incoming = new Map<string, Edge[]>();
    for (const edge of edges) { outgoing.set(edge.source, [...outgoing.get(edge.source) ?? [], edge]); incoming.set(edge.target, [...incoming.get(edge.target) ?? [], edge]); }
    const kindName = (kind: string) => presentation.kinds.find(k => k.id === kind)?.label ?? ({ module: '모듈', file: '파일', package: '패키지', type: '타입', function: '함수', class: '클래스', method: '메서드', interface: '인터페이스', enum: '열거형', struct: '구조체', trait: '트레이트' }[kind] ?? kind);
    const display = (key: string, value: unknown): string => typeof value === 'string' ? presentation.facets?.[key]?.values?.[value] ?? value : Array.isArray(value) ? value.map(v => display(key, v)).join(' · ') : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    const summary = (n: Node) => (config?.summaryFields ?? ['cardText', 'description', 'concept']).map(k => n.attributes[k]).find((v): v is string => typeof v === 'string') ?? '';
    const interpretation = (id: string): LoopInterpretation | undefined => { const note = presentation.interpretations?.find(n => n.targetId === id); return note ? { summary: note.summary, stale: note.status === 'stale', evidence: note.sources } : undefined; };
    const automatic = !config?.stages.length || !config.stages.some(stage => nodes.some(n => stage.kinds.includes(n.kind)));
    const structuralNodes = nodes.some(node => node.kind === 'module') ? nodes.filter(node => node.kind !== 'file') : nodes;
    const folderMap = automatic ? buildStructuralMap(structuralNodes, edges) : undefined;
    const catalog = config?.catalogKinds?.length && !automatic ? nodes.filter(n => config.catalogKinds?.includes(n.kind)) : nodes.filter(n => ['module', 'file', 'package', 'type', 'function', 'class', 'method', 'interface', 'enum', 'struct', 'trait'].includes(n.kind));
    const selected = catalog.length ? catalog : nodes;
    const traverse = (id: string, steps: NonNullable<LoopConfig['relationGroups']>[number]['steps'], displayStep = steps.length - 1, viaPrefix = '→'): LoopItem[] => {
        let paths = [[id]];
        for (const step of steps) {
            const next = paths.flatMap(path => {
                const from = path.at(-1);
                return from ? (step.direction === 'in' ? incoming : outgoing).get(from)?.filter(e => step.edgeKinds.includes(e.kind)).map(e => [...path, step.direction === 'in' ? e.source : e.target]) ?? [] : [];
            });
            paths = [...new Map(next.map(path => [JSON.stringify(path), path])).values()];
        }
        return paths.flatMap(path => {
            const target = path[displayStep + 1];
            if (!target || target === id || path.at(-1) === id || !byId.has(target)) return [];
            const via = path.slice(1).filter((_, index) => index !== displayStep).flatMap(key => { const n = byId.get(key); return n ? [{ id: n.id, name: n.name }] : []; });
            return [{ id: target, ...(via.length ? { via, note: `${viaPrefix} ${via.map(n => n.name).join(' → ')}`.trim() } : {}) }];
        });
    };
    const loopNodes: LoopNode[] = selected.map((n, ordinal) => {
        let groups: LoopRelationGroup[] = (config?.relationGroups ?? []).filter(g => !g.kinds?.length || g.kinds.includes(n.kind)).map<LoopRelationGroup>(g => ({ side: g.side === 'left' ? 'incoming' : 'outgoing', label: g.label, items: traverse(n.id, g.steps, g.displayStep, g.viaPrefix) })).filter(g => g.items.length);
        if (!config?.relationGroups.length) groups = [
            { side: 'incoming' as const, label: '이 모듈을 사용하는 곳', items: (incoming.get(n.id) ?? []).filter(e => e.kind === 'imports').map(e => ({ id: e.source })) },
            { side: 'outgoing' as const, label: '참조하는 모듈', items: (outgoing.get(n.id) ?? []).filter(e => e.kind === 'imports').map(e => ({ id: e.target })) },
            { side: 'outgoing' as const, label: '정의한 타입·함수', items: (outgoing.get(n.id) ?? []).filter(e => e.kind === 'contains').map(e => ({ id: e.target })) },
        ].filter(g => g.items.length > 0).map(g => ({ ...g, items: [...new Map(g.items.filter(i => byId.has(i.id)).map(item => [item.id, item])).values()] }));
        const status = facets.find(f => f.nodeId === n.id && f.key === config?.statusFacet)?.value;
        const fieldSource = { ...n.attributes, facet: Object.fromEntries(facets.filter(f => f.nodeId === n.id).map(f => [f.key, f.value])) };
        const fields = (presentation.detail?.summaryFieldsByKind?.[n.kind] ?? presentation.detail?.summaryFields ?? []).flatMap(f => { let v: unknown = fieldSource; for (const part of f.path) v = v && typeof v === 'object' ? Reflect.get(v, part) : undefined; const value = display(f.path.at(-1) ?? '', v); return value ? [{ label: f.label, value }] : []; });
        if (automatic && n.sources[0]) fields.unshift({ label: '파일', value: n.sources[0].path });
        const note = interpretation(n.id), media = presentation.mediaManifest?.[n.id], baseStyle = config?.kindStyles?.[n.kind];
        const variant = baseStyle?.variants?.find(v => n.attributes[v.field] === v.value);
        const style = { ...baseStyle, ...variant };
        return { id: n.id, name: ['module', 'file'].includes(n.kind) ? (n.sources[0]?.path.split('/').at(-1) ?? n.name) : n.name, kind: n.kind, kindLabel: variant?.label ?? kindName(n.kind), summary: summary(n) || (automatic ? structuralSummary([n], [], n.sources[0]?.path.split('/').slice(0, -1).join('/') || '.') : ''), status: status === 'present' || status === 'absent' ? status : 'unknown', fields, relationGroups: groups, catalogSummary: groups.slice(0, 2).map(g => `${g.label} ${g.items.length}`).join(' · '), ordinal: typeof n.attributes['order'] === 'number' ? n.attributes['order'] - 1 : ordinal, ...(style?.shape ? { kindShape: style.shape } : {}), ...(style?.color ? { kindColor: style.color } : {}), ...(note ? { interpretation: note } : {}), ...(media?.status === 'available' ? { media } : {}) };
    });
    const structuralFocus = automatic ? loopNodes.filter(n => n.kind === 'module').map(n => ({ id: n.id, production: productionSource(byId.get(n.id)?.sources[0]?.path ?? n.name), degree: new Set([...(outgoing.get(n.id) ?? []).filter(e => e.kind === 'imports').map(e => e.target), ...(incoming.get(n.id) ?? []).filter(e => e.kind === 'imports').map(e => e.source)]).size })).sort((a, b) => Number(b.production) - Number(a.production) || b.degree - a.degree || a.id.localeCompare(b.id))[0]?.id : undefined;
    const groupNodes = (members: readonly Node[], field?: string) => { const groups = new Map<string, { id: string; }[]>(); for (const n of members) { const title = field ? display(field, n.attributes[field]) || kindName(n.kind) : kindName(n.kind); groups.set(title, [...groups.get(title) ?? [], { id: n.id }]); } return [...groups].map(([title, items]) => ({ title, items })); };
    const relatedSystemIds = new Set((config?.stages ?? []).flatMap(stage => stage.systemIds));
    const systemKinds = new Set(nodes.filter(n => relatedSystemIds.has(n.id) || relatedSystemIds.has(String(n.attributes['originalId'] ?? ''))).map(n => n.kind));
    const systemNodes = new Set(nodes.filter(n => systemKinds.has(n.kind)).map(n => n.id));
    const stages: LoopStage[] = folderMap ? folderMap.stages.map(stage => { const note = interpretation(stage.id); return { ...stage, ...(note ? { summary: note.summary, interpretation: note } : {}) }; }) : (config?.stages ?? []).map(stage => {
        const members = nodes.filter(n => stage.kinds.includes(n.kind));
        const systems = new Set(nodes.filter(n => stage.systemIds.includes(n.id) || stage.systemIds.includes(String(n.attributes['originalId'] ?? ''))).map(n => n.id));
        const influences = (direction: 'in' | 'out') => edges.filter(e => systemNodes.has(e.source) && systemNodes.has(e.target) && systems.has(direction === 'in' ? e.target : e.source) && !systems.has(direction === 'in' ? e.source : e.target) && typeof e.attributes?.['label'] === 'string').flatMap(e => { const other = byId.get(direction === 'in' ? e.source : e.target); return other ? [{ name: other.name, description: String(e.attributes?.['label']) }] : []; });
        return { id: stage.id, title: stage.title, summary: stage.summary, unit: stage.unit, nodeIds: members.map(n => n.id), groups: groupNodes(members, stage.groupBy), incoming: influences('in'), outgoing: influences('out') };
    });
    return { ...(structuralFocus ? { defaultFocus: structuralFocus } : {}), ...(folderMap ? { structural: true, rootStageIds: folderMap.rootStageIds, defaultStage: folderMap.defaultStage } : {}), showStatus: loopNodes.some(n => n.status !== 'unknown'), ...(config?.subtitle ? { subtitle: config.subtitle } : {}), ...(config?.defaultStage ? { defaultStage: config.defaultStage } : {}), title: config?.title ?? `${repositoryName} 지도`, lead: (config?.lead ?? (automatic ? structuralSummary([], nodes, '.') : '')) || '덩어리를 눌러 역할과 연결을 살펴보세요. 화살표 숫자는 가져다 쓰는 파일 수입니다.', ...(config?.center ? { center: config.center } : { center: { title: repositoryName, description: '구조와 의존 관계' } }), stages, flows: folderMap ? folderMap.flows : config?.flows ?? [], nodes: loopNodes, statusLabels: { present: '지금 빌드에 있음', absent: '설계에 있음', unknown: '실행 상태 미판정', ...config?.statusLabels }, kindOrder: config?.catalogKinds ?? [...new Set(loopNodes.map(n => n.kind))], strips: (config?.strips ?? []).map(s => ({ title: s.title, description: s.description, groups: s.kinds.map(kind => ({ title: kindName(kind), nodeIds: nodes.filter(n => n.kind === kind).map(n => n.id) })) })), ...(config?.places ? { places: { title: config.places.title, description: config.places.description, nodeIds: nodes.filter(n => config.places?.kinds.includes(n.kind)).map(n => n.id) } } : {}) };
}
