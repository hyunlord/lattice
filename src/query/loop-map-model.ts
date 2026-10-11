import { overviewDependencyGroups } from './structural-dependency-groups.js';
import { plain } from '../adapters/markdown-inline.js';
import type { Node, Edge, Facet } from '../core/model.js';
import type { LoopMap, LoopNode, LoopStage, LoopInterpretation, LoopRelationGroup, LoopItem } from './loop-map-types.js';
import type { LoopConfig } from './loop-config.js';
import type { MediaManifest } from './media-model.js';
import { buildStructuralOverview, structuralSummary, structuralCategoryLabel } from './structural-map-model.js';
export type LoopPresentation = {
    name?: string; loop?: LoopConfig;
    kinds: readonly { id: string; label?: string; }[];
    facets?: Record<string, { label?: string; values?: Record<string, string>; }>;
    detail?: { summaryFields?: readonly { label: string; path: readonly string[]; }[]; summaryFieldsByKind?: Readonly<Record<string, readonly { label: string; path: readonly string[]; }[]>>; relationships?: readonly { label: string; edgeKinds: readonly string[]; direction: 'incoming' | 'outgoing' | 'both'; }[]; };
    interpretations?: readonly { targetId: string; summary: string; status: string; sources: readonly { path: string; line?: number; url?: string; }[]; }[];
    mediaManifest?: MediaManifest;
};
export function buildLoopMap(inputNodes: readonly Node[], inputEdges: readonly Edge[], facets: readonly Facet[], presentation: LoopPresentation, repositoryName: string, options: { readonly projection?: 'full' | 'overview'; } = {}): LoopMap {
    const config = presentation.loop;
    const kinds = new Set(inputNodes.map(node => node.kind));
    const automatic = !config?.stages.length || !config.stages.some(stage => stage.kinds.some(kind => kinds.has(kind)));
    const structuralKinds = new Set(['module', 'file', 'package', 'document']);
    const projected = automatic && options.projection === 'overview' && (kinds.has('module') || kinds.has('file'));
    const nodes = projected ? inputNodes.filter(node => structuralKinds.has(node.kind)) : inputNodes;
    const ids = projected ? new Set(nodes.map(node => node.id)) : undefined;
    const edges = ids ? inputEdges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) : inputEdges;
    const byId = new Map(nodes.map(n => [n.id, n]));
    const outgoing = new Map<string, Edge[]>(), incoming = new Map<string, Edge[]>();
    for (const edge of edges) {
        const from = outgoing.get(edge.source) ?? []; from.push(edge); outgoing.set(edge.source, from);
        const to = incoming.get(edge.target) ?? []; to.push(edge); incoming.set(edge.target, to);
    }
    const facetIndex = new Map<string, Facet[]>();
    for (const facet of facets) { const id = facet.nodeId; if (ids && !ids.has(id)) continue; const entries = facetIndex.get(id) ?? []; entries.push(facet); facetIndex.set(id, entries); }
    const interpretations = new Map<string, NonNullable<LoopPresentation['interpretations']>[number]>();
    for (const note of presentation.interpretations ?? []) if (!interpretations.has(note.targetId)) interpretations.set(note.targetId, note);
    const kindName = (kind: string) => presentation.kinds.find(k => k.id === kind)?.label ?? ({ module: '모듈', file: '파일', package: '패키지', type: '타입', function: '함수', class: '클래스', method: '메서드', interface: '인터페이스', enum: '열거형', struct: '구조체', trait: '트레이트' }[kind] ?? kind);
    const display = (key: string, value: unknown): string => typeof value === 'string' ? presentation.facets?.[key]?.values?.[value] ?? value : Array.isArray(value) ? value.map(v => display(key, v)).join(' · ') : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    const summary = (n: Node) => (config?.summaryFields ?? ['cardText', 'description', 'concept']).map(k => n.attributes[k]).find((v): v is string => typeof v === 'string') ?? '';
    const interpretation = (id: string): LoopInterpretation | undefined => { const note = interpretations.get(id); return note ? { summary: plain(note.summary), stale: note.status === 'stale', evidence: note.sources } : undefined; };
    const structuralNodes = nodes.filter(node => structuralKinds.has(node.kind) && (node.kind !== 'file' || !kinds.has('module')));
    const folderMap = automatic ? buildStructuralOverview(structuralNodes, edges) : undefined;
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
        const nodeFacets = facetIndex.get(n.id) ?? [];
        const status = nodeFacets.find(f => f.key === config?.statusFacet)?.value;
        const fieldSource = { ...n.attributes, facet: Object.fromEntries(nodeFacets.map(f => [f.key, f.value])) };
        const fields = (presentation.detail?.summaryFieldsByKind?.[n.kind] ?? presentation.detail?.summaryFields ?? []).flatMap(f => { let v: unknown = fieldSource; for (const part of f.path) v = v && typeof v === 'object' ? Reflect.get(v, part) : undefined; const value = display(f.path.at(-1) ?? '', v); return value ? [{ label: f.label, value }] : []; });
        if (automatic && n.sources[0]) fields.unshift({ label: '파일', value: n.sources[0].path });
        const note = interpretation(n.id), media = presentation.mediaManifest?.[n.id], baseStyle = config?.kindStyles?.[n.kind];
        const variant = baseStyle?.variants?.find(v => n.attributes[v.field] === v.value);
        const style = { ...baseStyle, ...variant };
        return { id: n.id, name: ['module', 'file'].includes(n.kind) ? (n.sources[0]?.path.split('/').at(-1) ?? n.name) : n.name, kind: n.kind, kindLabel: variant?.label ?? (n.kind === 'package' && n.attributes['category'] ? structuralCategoryLabel(n) : kindName(n.kind)), summary: summary(n) || (automatic ? structuralSummary([n], [], n.sources[0]?.path.split('/').slice(0, -1).join('/') || '.') : ''), status: status === 'present' || status === 'absent' ? status : 'unknown', fields, relationGroups: groups, catalogSummary: groups.slice(0, 2).map(g => `${g.label} ${g.items.length}`).join(' · '), ordinal: typeof n.attributes['order'] === 'number' ? n.attributes['order'] - 1 : ordinal, ...(style?.shape ? { kindShape: style.shape } : {}), ...(style?.color ? { kindColor: style.color } : {}), ...(note ? { interpretation: note } : {}), ...(media?.status === 'available' ? { media } : {}) };
    });

    const groupNodes = (members: readonly Node[], field?: string) => { const groups = new Map<string, { id: string; }[]>(); for (const n of members) { const title = field ? display(field, n.attributes[field]) || kindName(n.kind) : kindName(n.kind); const items = groups.get(title) ?? []; items.push({ id: n.id }); groups.set(title, items); } return [...groups].map(([title, items]) => ({ title, items })); };
    const relatedSystemIds = new Set((config?.stages ?? []).flatMap(stage => stage.systemIds));
    const systemKinds = new Set(nodes.filter(n => relatedSystemIds.has(n.id) || relatedSystemIds.has(String(n.attributes['originalId'] ?? ''))).map(n => n.kind));
    const systemNodes = new Set(nodes.filter(n => systemKinds.has(n.kind)).map(n => n.id));
    const stages: LoopStage[] = folderMap ? folderMap.stages.map(stage => {
        const all = stage.id.startsWith('all:') || folderMap.structuralScope.default === 'all';
        const id = stage.id.startsWith('all:') ? stage.id.slice(4) : stage.id;
        const scoped = interpretation(`overview:${all ? 'all' : 'production'}:${stage.id}`);
        const candidate = scoped ?? interpretation(id.startsWith('directory:') ? `folder:${id.slice('directory:'.length)}` : id);
        const paths = new Set((stage.descendantNodeIds ?? stage.nodeIds).flatMap(id => byId.get(id)?.sources.map(source => source.path) ?? []));
        const covered = new Set(candidate?.evidence.map(source => source.path));
        const exact = !scoped && !all && !id.startsWith('directory:') || covered.size === paths.size;
        const note = candidate?.evidence.length && exact && candidate.evidence.every(source => paths.has(source.path)) ? candidate : undefined;
        const filePreviews = stage.filePreviews?.map(file => {
            const fileNote = interpretation(file.id), sources = new Set(byId.get(file.id)?.sources.map(source => source.path));
            const evidence = new Set(fileNote?.evidence.map(source => source.path));
            if (!fileNote?.evidence.length || evidence.size !== sources.size || fileNote.evidence.some(source => !sources.has(source.path))) return file;
            return { ...file, ...(fileNote.stale ? {} : { summary: fileNote.summary }), interpretation: fileNote };
        });
        const { summaryDetail: _detail, summaryDetails: _details, ...withoutDetail } = stage;
        return { ...(note && !note.stale ? withoutDetail : stage), ...(filePreviews ? { filePreviews } : {}), ...(note ? { ...(note.stale ? {} : { summary: note.summary }), interpretation: note } : {}) };
    }) : (config?.stages ?? []).map(stage => {
        const members = nodes.filter(n => stage.kinds.includes(n.kind));
        const systems = new Set(nodes.filter(n => stage.systemIds.includes(n.id) || stage.systemIds.includes(String(n.attributes['originalId'] ?? ''))).map(n => n.id));
        const influences = (direction: 'in' | 'out') => edges.filter(e => systemNodes.has(e.source) && systemNodes.has(e.target) && systems.has(direction === 'in' ? e.target : e.source) && !systems.has(direction === 'in' ? e.source : e.target) && typeof e.attributes?.['label'] === 'string').flatMap(e => { const other = byId.get(direction === 'in' ? e.source : e.target); return other ? [{ name: other.name, description: String(e.attributes?.['label']) }] : []; });
        return { id: stage.id, title: stage.title, summary: stage.summary, unit: stage.unit, nodeIds: members.map(n => n.id), groups: groupNodes(members, stage.groupBy), incoming: influences('in'), outgoing: influences('out') };
    });
    const structuralDependencyGroups = folderMap ? overviewDependencyGroups(folderMap).map(group => {
        const candidate = interpretation(group.id);
        const paths = new Set(group.nodeIds.flatMap(id => byId.get(id)?.sources.map(source => source.path) ?? []));
        const covered = new Set(candidate?.evidence.map(source => source.path));
        const exact = paths.size === covered.size && [...covered].every(path => paths.has(path));
        const note = candidate?.evidence.length && (exact || candidate.stale) ? candidate : undefined;
        return { ...group, ...(note ? { interpretation: note } : {}) };
    }) : undefined;
    return { ...(structuralDependencyGroups ? { structuralDependencyGroups } : {}), ...(folderMap ? { structural: true, structuralSourceRoot: folderMap.structuralSourceRoot, structuralEntryStageIds: folderMap.structuralEntryStageIds, structuralScope: folderMap.structuralScope, verifiedCycleStageGroups: folderMap.verifiedCycleStageGroups, rootStageIds: folderMap.rootStageIds, defaultStage: folderMap.defaultStage } : {}), showStatus: loopNodes.some(n => n.status !== 'unknown'), ...(config?.subtitle ? { subtitle: config.subtitle } : {}), ...(config?.defaultStage ? { defaultStage: config.defaultStage } : {}), title: config?.title ?? `${repositoryName} 지도`, lead: (config?.lead ?? (automatic ? structuralSummary([], nodes, '.') : '')) || '덩어리를 눌러 역할과 연결을 살펴보세요. 화살표 숫자는 가져다 쓰는 파일 수입니다.', ...(config?.center ? { center: config.center } : { center: { title: repositoryName, description: '구조와 의존 관계' } }), stages, flows: folderMap ? folderMap.flows : config?.flows ?? [], nodes: loopNodes, statusLabels: { present: '지금 빌드에 있음', absent: '설계에 있음', unknown: '실행 상태 미판정', ...config?.statusLabels }, kindOrder: config?.catalogKinds ?? [...new Set(loopNodes.map(n => n.kind))], strips: (config?.strips ?? []).map(s => ({ title: s.title, description: s.description, groups: s.kinds.map(kind => ({ title: kindName(kind), nodeIds: nodes.filter(n => n.kind === kind).map(n => n.id) })) })), ...(config?.places ? { places: { title: config.places.title, description: config.places.description, nodeIds: nodes.filter(n => config.places?.kinds.includes(n.kind)).map(n => n.id) } } : {}) };
}
