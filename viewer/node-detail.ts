import type { Node, Source, Snapshot, Finding } from '../dist/core/model.js';
import type { Presentation, BrowserGraph } from './data.js';
import type { DetailIndex, DetailPages } from './node-detail-transport.js';
import type { NodeDetailLoader, NodeDetailRecord } from './node-detail-data.js';
import { element as el, anchor as link, action, pager } from './explore-controls.js';
import { humanValue } from './views-records.js';
import { nodeIdentity, compareRecords, snapshotComparisons } from './history-model.js';
import { renderNodeHistory } from './node-history.js';
type Context = {
    readonly loader: NodeDetailLoader; readonly index: DetailIndex; readonly record: NodeDetailRecord;
    readonly presentation: Presentation; readonly snapshots: readonly Snapshot[]; readonly params: URLSearchParams;
    readonly current: () => boolean; readonly nodeHref: (id: string) => string; readonly homeHref: (id: string, layer: string) => string;
    readonly sources: (sources: readonly Source[]) => HTMLElement; readonly finding: (finding: Finding) => HTMLElement;
    readonly layerLabel: (layer: string) => string; readonly kindLabel: (kind: string) => string; readonly facetLabel: (key: string) => string; readonly valueLabel: (key: string, value: unknown) => string;
    readonly functionLogic: (host: HTMLElement, id: string) => void;
};
function section(title: string): HTMLElement { const result = el('section', '', 'panel section'); result.append(el('h2', title)); return result; }
function attributes(node: Node): HTMLElement { const result = el('dl', '', 'attributes'); for (const [key, value] of Object.entries(node.attributes)) { const row = el('div', '', 'attribute'); row.append(el('dt', key)); const description = el('dd'); description.append(value !== null && typeof value === 'object' ? el('pre', JSON.stringify(value, null, 2)) : el('span', String(value ?? ''))); row.append(description); result.append(row); } return result; }
function collection(host: HTMLElement, title: string, descriptor: DetailPages, context: Context, render: (graph: BrowserGraph, area: HTMLElement) => void): void {
    const block = section(`${title} · ${descriptor.total}`), area = el('div'); block.append(area); host.append(block); let request = 0;
    const draw = async (page: number, focus = false): Promise<void> => {
        const version = ++request; area.setAttribute('aria-busy', 'true');
        try { const data = descriptor.total ? await context.loader.page(context.index, descriptor, page) : undefined; if (!context.current() || version !== request) return; area.replaceChildren(); if (data) render(data, area); else area.append(el('p', '기록된 항목이 없습니다.', 'empty')); if (descriptor.total > 20) pager(area, { total: descriptor.total, page, size: 20, change: next => { void draw(next, true); } }); if (focus) { area.tabIndex = -1; area.focus(); } }
        catch (error) { if (context.current() && version === request) area.replaceChildren(el('p', error instanceof Error ? error.message : String(error), 'empty'), action('다시 읽기', () => { void draw(page); })); }
        finally { if (version === request) area.removeAttribute('aria-busy'); }
    };
    void draw(0);
}
export function renderNodeDetail(host: HTMLElement, context: Context): void {
    const node = context.record.graph.nodes[0]; if (!node) return;
    const layer = String(node.attributes['layer'] ?? ''), layerLabel = context.layerLabel(layer);
    host.append(link('← 지도', context.homeHref(node.id, layer)), el('h1', node.name), el('p', `${context.kindLabel(node.kind)}${layerLabel ? ` · ${layerLabel}` : ''}`, 'meta'), el('code', node.id, 'detail-id'));
    const actions = el('div', '', 'actions'), status = el('span', '', 'meta'); status.setAttribute('role', 'status'); actions.append(link('이웃 탐색', context.homeHref(node.id, layer)), action('링크 복사', () => { void navigator.clipboard.writeText(location.href).then(() => { status.textContent = '링크를 복사했습니다.'; }, () => { status.textContent = '주소 표시줄의 URL을 복사하세요.'; }); }), status); host.append(actions);
    if (['function', 'method'].includes(node.kind)) context.functionLogic(host, node.id);
    const human = context.presentation.detail;
    if (human) {
        const summary = section('요약'); host.append(summary);
        const drawSummary = (facets: BrowserGraph['facets']): void => { summary.replaceChildren(el('h2', '요약')); for (const field of human.summaryFieldsByKind?.[node.kind] ?? human.summaryFields) { let value: unknown = { ...node.attributes, facet: Object.fromEntries(facets.map(facet => [facet.key, facet.value])) }; for (const key of field.path) value = value !== null && typeof value === 'object' ? Reflect.get(value, key) : undefined; if (value === undefined || value === null || value === '') continue; const row = el('div', '', 'record-field'); row.append(el('strong', field.label), humanValue(value, { nodes: [node], nodeHref: context.nodeHref })); summary.append(row); } };
        drawSummary([]);
        const wanted = new Set((human.summaryFieldsByKind?.[node.kind] ?? human.summaryFields).filter(field => field.path[0] === 'facet').flatMap(field => field.path[1] ? [field.path[1]] : []));
        if (wanted.size && context.record.facets.total) void (async () => { const selected: BrowserGraph['facets'] = []; for (let page = 0; page < context.record.facets.pages.length && wanted.size && context.current(); page++) { const data = await context.loader.page(context.index, context.record.facets, page); for (const facet of data.facets) if (wanted.has(facet.key)) { selected.push(facet); wanted.delete(facet.key); } } if (context.current()) drawSummary(selected); })().catch(error => { if (context.current()) summary.append(el('p', error instanceof Error ? error.message : String(error), 'empty')); });
    }
    const provenance = section('원본 출처'); provenance.append(context.sources(node.sources)); host.append(provenance);
    const raw = section('속성'); raw.append(attributes(node)); if (!Object.keys(node.attributes).length) raw.append(el('p', '기록된 속성이 없습니다.', 'empty'));
    if (human?.rawAttributes === 'collapsed') { const disclosure = el('details', '', 'section'); disclosure.append(el('summary', '원시 속성 및 분류'), raw); host.append(disclosure); } else host.append(raw);
    collection(host, '분류', context.record.facets, context, (graph, area) => { for (const facet of graph.facets) { const row = el('div', '', 'record-field'); row.append(el('strong', context.facetLabel(facet.key)), el('span', context.valueLabel(facet.key, facet.value))); const evidence = el('details'); evidence.append(el('summary', '분류 출처'), context.sources(facet.sources)); row.append(evidence); area.append(row); } });
    collection(host, '관련 발견', context.record.findings, context, (graph, area) => { for (const finding of graph.findings) area.append(context.finding(finding)); });
    for (const [direction, label] of [['outgoing', '나가는 연결'], ['incoming', '들어오는 연결'], ['undirected', '방향 없는 연결']] as const) collection(host, label, context.record.relations[direction], context, (graph, area) => {
        const names = new Map(graph.nodes.map(item => [item.id, item])), list = el('ul', '', 'neighbors');
        for (const edge of graph.edges) { const id = edge.source === node.id ? edge.target : edge.source, target = names.get(id), row = el('li'); const humanLabel = human?.relationships.find(relation => relation.edgeKinds.includes(edge.kind) && (relation.direction !== 'incoming' && edge.source === node.id || relation.direction !== 'outgoing' && edge.target === node.id))?.label; row.append(el('span', `${humanLabel ?? String(edge.attributes?.['label'] || edge.kind || edge.field)} · `), link(target?.name ?? id, context.nodeHref(id))); const neighborLayer = String(target?.attributes['layer'] ?? ''); if (neighborLayer !== layer) row.append(el('span', ' · ' + (context.layerLabel(neighborLayer)), 'badge')); if (humanLabel && edge.attributes?.['label']) row.append(el('p', String(edge.attributes['label']))); const evidence = el('details'); evidence.append(el('summary', '연결 출처'), context.sources(edge.sources)); row.append(evidence); list.append(row); }
        area.append(list);
    });
    const readSnapshot = async (snapshot: Snapshot): Promise<BrowserGraph> => { const index = await context.loader.index(snapshot); if (!index) throw new Error('스냅샷 상세 목록이 없습니다.'); const record = await context.loader.node(index, nodeIdentity(node), true); return record?.graph ?? { schemaVersion: 1, hash: index.graphHash, repository: index.repository, nodes: [], edges: [], facets: [], findings: [], views: [] }; };
    void renderNodeHistory(host, { node, snapshots: context.snapshots, readSnapshot, isCurrent: context.current, sources: context.sources, changesHref: (before, after) => context.nodeHref(node.id) + '?' + new URLSearchParams({ before, after }) });
    const before = context.snapshots.find(snapshot => snapshot.id === context.params.get('before')), after = context.snapshots.find(snapshot => snapshot.id === context.params.get('after'));
    if (before && after) {
        const compare = section('이전·이후 노드 비교'); host.append(compare);
        void Promise.all([readSnapshot(before), readSnapshot(after)]).then(([left, right]) => { if (!context.current()) return; const a = left.nodes[0], b = right.nodes[0]; compare.append(el('p', compareRecords(snapshotComparisons(left, a ? [a] : [], layer).nodes, snapshotComparisons(right, b ? [b] : [], layer).nodes).length === 0 ? '노드 내용 유지' : '노드 내용 변경')); for (const [title, record, snapshot] of [['이전', a, before], ['이후', b, after]] as const) { compare.append(el('h3', `${title} · ${snapshot.commit?.slice(0, 12) ?? snapshot.id.slice(0, 12)}`)); if (record) compare.append(el('pre', JSON.stringify({ id: record.id, kind: record.kind, name: record.name, attributes: record.attributes }, null, 2)), context.sources(record.sources)); else compare.append(el('p', '관측되지 않음')); } }, error => { if (context.current()) compare.append(el('p', error instanceof Error ? error.message : String(error), 'empty')); });
    }
}
