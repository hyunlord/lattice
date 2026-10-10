import type { Node, Edge, Facet } from '../core/model.js';
import { buildStructuralMap } from './structural-map-model.js';
export type PictureStatus = 'present' | 'absent' | 'unknown';
export type PictureMapConfig = { readonly hubKinds: readonly string[]; readonly membershipEdgeKinds: readonly string[]; readonly influenceEdgeKinds: readonly string[]; readonly primaryFacet?: string; readonly statusFacet?: string; readonly statusLabels?: Partial<Record<PictureStatus, string>>; readonly summaryFields?: readonly string[]; readonly hubOrder?: readonly string[]; };
export type PictureNode = { readonly id: string; readonly name: string; readonly kind: string; readonly summary: string; readonly status: PictureStatus; readonly memberships: readonly { id: string; name: string; }[]; readonly relations: readonly { id: string; name: string; label: string; }[]; };
export type PictureHub = { readonly id: string; readonly name: string; readonly nodes: readonly PictureNode[]; };
export type PictureEdge = { readonly source: string; readonly target: string; readonly count: number; readonly descriptions: readonly string[]; };
export type PictureMap = { readonly hubs: readonly PictureHub[]; readonly edges: readonly PictureEdge[]; readonly statusLabels: Readonly<Record<PictureStatus, string>>; };
export function pictureMapConfig(value: unknown): PictureMapConfig | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const list = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
    const hubs: unknown = Reflect.get(value, 'hubKinds'), members: unknown = Reflect.get(value, 'membershipEdgeKinds'), edges: unknown = Reflect.get(value, 'influenceEdgeKinds');
    if (!list(hubs) || !list(members) || !list(edges)) return undefined;
    const primary: unknown = Reflect.get(value, 'primaryFacet'), status: unknown = Reflect.get(value, 'statusFacet'), summaries: unknown = Reflect.get(value, 'summaryFields'), order: unknown = Reflect.get(value, 'hubOrder'), labels: unknown = Reflect.get(value, 'statusLabels');
    const statusLabels: Partial<Record<PictureStatus, string>> = {};
    if (labels && typeof labels === 'object') for (const key of ['present', 'absent', 'unknown'] as const) { const label: unknown = Reflect.get(labels, key); if (typeof label === 'string') statusLabels[key] = label; }
    return { hubKinds: hubs, membershipEdgeKinds: members, influenceEdgeKinds: edges, ...(typeof primary === 'string' ? { primaryFacet: primary } : {}), ...(typeof status === 'string' ? { statusFacet: status } : {}), ...(list(summaries) ? { summaryFields: summaries } : {}), ...(list(order) ? { hubOrder: order } : {}), statusLabels };
}
export function buildPictureMap(nodes: readonly Node[], edges: readonly Edge[], facets: readonly Facet[], config?: PictureMapConfig, relationshipLabels: Readonly<Record<string, string>> = {}): PictureMap {
    if (config && !nodes.some(node => config?.hubKinds.includes(node.kind))) config = undefined;
    if (!config && nodes.some(n => ['module', 'file'].includes(n.kind))) {
        const structural = buildStructuralMap(nodes, edges);
        const byId = new Map(nodes.map(n => [n.id, n]));
        const roots = structural.stages.filter(s => structural.rootStageIds.includes(s.id));
        const owner = (id: string) => roots.filter(s => id === s.id || s.id === 'folder:.' || id.startsWith(s.id + '/')).sort((a, b) => b.id.length - a.id.length)[0];
        const hubs = roots.map(s => ({
            id: s.id, name: s.title, nodes: (s.descendantNodeIds ?? s.nodeIds).flatMap(id => {
                const n = byId.get(id); if (!n) return [];
                const path = n.sources[0]?.path ?? n.name;
                const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
                if (owner('folder:' + folder)?.id !== s.id) return [];
                return [{ id: n.id, name: n.name, kind: n.kind, summary: '', status: 'unknown' as const, memberships: [{ id: s.id, name: s.title }], relations: [] }];
            })
        }));
        const grouped = new Map<string, { source: string; target: string; files: Set<string>; }>();
        for (const flow of structural.flows) {
            const source = owner(flow.source)?.id, target = owner(flow.target)?.id;
            if (!source || !target || source === target) continue;
            const key = JSON.stringify([source, target]), value = grouped.get(key) ?? { source, target, files: new Set<string>() };
            for (const file of flow.sourceFiles ?? []) value.files.add(file);
            grouped.set(key, value);
        }
        return { hubs, edges: [...grouped.values()].map(e => ({ source: e.source, target: e.target, count: e.files.size, descriptions: [...e.files].sort() })), statusLabels: { present: '실행 있음', absent: '설계만 있음', unknown: '상태 미판정' } };
    }
    const byId = new Map(nodes.map(node => [node.id, node]));
    const labels = { present: '실행 있음', absent: '설계만 있음', unknown: '상태 미판정', ...config?.statusLabels };
    const hubs = new Map<string, { id: string; name: string; nodes: PictureNode[]; }>();
    const memberships = new Map<string, string[]>();
    const facet = (id: string, key: string | undefined) => key ? facets.find(value => value.nodeId === id && value.key === key)?.value : undefined;
    if (config) {
        for (const node of nodes) if (config.hubKinds.includes(node.kind)) hubs.set(node.id, { id: node.id, name: node.name, nodes: [] });
        for (const edge of edges) if (config.membershipEdgeKinds.includes(edge.kind) && byId.has(edge.source) && hubs.has(edge.target)) memberships.set(edge.source, [...new Set([...(memberships.get(edge.source) ?? []), edge.target])]);
    } else {
        const paths = new Set<string>();
        for (const node of [...nodes].sort((a, b) => (a.kind === 'module' ? -1 : 1) - (b.kind === 'module' ? -1 : 1))) {
            if (!['module', 'file'].includes(node.kind)) continue;
            const path = node.sources[0]?.path ?? node.name;
            if (paths.has(path)) continue; paths.add(path);
            const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '루트', id = 'folder:' + folder;
            if (!hubs.has(id)) hubs.set(id, { id, name: folder, nodes: [] });
            memberships.set(node.id, [id]);
        }
        if (!hubs.size) for (const node of nodes) { const id = 'kind:' + node.kind; if (!hubs.has(id)) hubs.set(id, { id, name: node.kind, nodes: [] }); memberships.set(node.id, [id]); }
    }
    for (const [id, memberIds] of memberships) {
        const node = byId.get(id); if (!node) continue;
        const primary = facet(id, config?.primaryFacet);
        const ordered = [...memberIds].sort((a, b) => Number(b === primary) - Number(a === primary) || a.localeCompare(b));
        const status = facet(id, config?.statusFacet);
        const summary = (config?.summaryFields ?? ['cardText', 'description']).map(field => node.attributes[field]).find(value => typeof value === 'string');
        const relations = edges.filter(edge => (edge.source === id || edge.target === id) && !config?.membershipEdgeKinds.includes(edge.kind)).flatMap(edge => { const other = byId.get(edge.source === id ? edge.target : edge.source); return other ? [{ id: other.id, name: other.name, label: relationshipLabels[edge.kind] ?? (typeof edge.attributes?.['label'] === 'string' && edge.attributes['label'] !== edge.kind ? edge.attributes['label'] : '') }] : []; }).slice(0, 5);
        hubs.get(ordered[0] ?? '')?.nodes.push({ id, name: node.name, kind: node.kind, summary: typeof summary === 'string' ? summary : '', status: status === 'present' || status === 'absent' ? status : 'unknown', memberships: ordered.flatMap(id => { const hub = hubs.get(id); return hub ? [{ id, name: hub.name }] : []; }), relations });
    }
    const aggregated = new Map<string, { source: string; target: string; count: number; descriptions: string[]; }>();
    for (const edge of edges) {
        if (config ? !config.influenceEdgeKinds.includes(edge.kind) : edge.kind !== 'imports') continue;
        const source = config ? edge.source : memberships.get(edge.source)?.[0], target = config ? edge.target : memberships.get(edge.target)?.[0];
        if (!source || !target || source === target || !hubs.has(source) || !hubs.has(target)) continue;
        const key = JSON.stringify([source, target]), result = aggregated.get(key) ?? { source, target, count: 0, descriptions: [] };
        result.count++;
        const description = edge.attributes?.['label'];
        result.descriptions.push(typeof description === 'string' ? description : `${byId.get(edge.source)?.name ?? source} → ${byId.get(edge.target)?.name ?? target}`);
        aggregated.set(key, result);
    }
    const rank = (id: string) => { const index = config?.hubOrder?.indexOf(id) ?? -1; return index < 0 ? Number.MAX_SAFE_INTEGER : index; };
    return { hubs: [...hubs.values()].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name)), edges: [...aggregated.values()].map(edge => ({ ...edge, descriptions: [...new Set(edge.descriptions)] })), statusLabels: labels };
}
