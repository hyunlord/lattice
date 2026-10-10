import type { ViewProjection } from './views-model.js';
import type { Node } from '../dist/core/model.js';
import type { ViewsContext } from './views-shared.js';
import { viewRoute, region, paging, valueText } from './views-shared.js';
import { element, anchor, pageNumber } from './explore-controls.js';
type RecordsView = Extract<ViewProjection, { type: 'gallery' | 'status'; }>;
export function humanValue(value: unknown, context: Pick<ViewsContext, 'nodes' | 'allNodes' | 'nodeHref'>): HTMLElement {
    const result = element('span', '', 'human-value');
    if (typeof value === 'string') {
        const node = (context.allNodes ?? context.nodes).find(node => node.id === value);
        result.append(node ? anchor(node.name, context.nodeHref(node.id)) : document.createTextNode(value || '미기재'));
    } else if (Array.isArray(value)) {
        if (!value.length) result.textContent = '미기재';
        else { const list = element('ul'); for (const item of value) { const row = element('li'); row.append(humanValue(item, context)); list.append(row); } result.append(list); }
    } else if (value !== null && typeof value === 'object') {
        const list = element('dl'); for (const [key, item] of Object.entries(value)) { list.append(element('dt', key)); const description = element('dd'); description.append(humanValue(item, context)); list.append(description); } result.append(list);
    } else result.textContent = value === null || value === undefined ? '미기재' : valueText(value);
    return result;
}
export function recordFilters(container: HTMLElement, context: ViewsContext, nodes: readonly Node[]): void {
    const form = element('form', '', 'filters'); const searchLabel = element('label', '이름·내용 검색'), input = element('input'); input.type = 'search'; input.name = 'q'; input.value = context.params.get('q') ?? ''; searchLabel.append(input);
    const kindLabel = element('label', '종류'), kind = element('select'); kind.name = 'kind'; const any = element('option', '모든 종류'); any.value = ''; kind.append(any);
    for (const id of [...new Set(nodes.map(node => node.kind))]) { const option = element('option', context.kindLabel(id)); option.value = id; kind.append(option); } kind.value = context.params.get('kind') ?? ''; kindLabel.append(kind);
    const submit = element('button', '검색'); submit.type = 'submit'; form.append(searchLabel, kindLabel, submit, anchor('필터 초기화', viewRoute(context, { q: '', kind: '', page: '0', selected: '' })));
    const update = () => { location.hash = viewRoute(context, { q: input.value, kind: kind.value, page: '0', selected: '' }); };
    kind.onchange = update; form.onsubmit = event => { event.preventDefault(); update(); }; container.append(form);
}
function relations(node: Node, context: ViewsContext, edgeKinds: readonly string[]): HTMLElement {
    const result = element('details', '', 'record-relations');
    const edges = (context.allEdges ?? context.edges).filter(edge => edgeKinds.includes(edge.kind) && (edge.source === node.id || edge.target === node.id));
    result.open = true; result.append(element('summary', `주요 관계 · ${edges.length}`));
    if (!edges.length) result.append(element('p', '이 종류의 관계 근거가 없습니다.', 'meta'));
    for (const edge of edges) {
        const other = edge.source === node.id ? edge.target : edge.source;
        const row = element('div'); row.append(element('span', String(edge.attributes?.['label'] ?? edge.kind) + ' · '), humanValue(other, context));
        const evidence = element('details'); evidence.append(element('summary', '관계 출처'), context.sources(edge.sources)); row.append(evidence); result.append(row);
    }
    return result;
}
export function renderRecords(container: HTMLElement, context: ViewsContext, view: RecordsView): void {
    const nodes = new Map((context.allNodes ?? context.nodes).map(node => [node.id, node]));
    recordFilters(container, context, view.rows.flatMap(row => { const node = nodes.get(row.nodeId); return node ? [node] : []; }));
    const query = (context.params.get('q') ?? '').trim().toLocaleLowerCase(), kind = context.params.get('kind');
    if (view.type === 'status') {
        const controls = element('div', '', 'filters');
        for (const column of view.columns.filter(column => column.role === 'status')) {
            const label = element('label', column.label), select = element('select'), any = element('option', '모든 상태'); any.value = ''; select.append(any);
            const counts = new Map<string, number>(); for (const row of view.rows) { const value = valueText(row.values[column.id]); counts.set(value, (counts.get(value) ?? 0) + 1); }
            for (const [value, count] of counts) { const option = element('option', `${value} · ${count}`); option.value = value; select.append(option); }
            select.name = 'status-' + column.id; select.value = context.params.get(select.name) ?? ''; select.onchange = () => { location.hash = viewRoute(context, { [select.name]: select.value, page: '0' }); }; label.append(select); controls.append(label);
            container.append(element('p', [...counts].map(([value, count]) => `${value}: ${count}`).join(' · '), 'meta'));
        }
        container.append(controls);
    }
    const rows = view.rows.filter(row => view.columns.every(column => !context.params.get('status-' + column.id) || context.params.get('status-' + column.id) === valueText(row.values[column.id]))).filter(row => { const node = nodes.get(row.nodeId); return (!kind || node?.kind === kind) && (!query || `${node?.name} ${row.nodeId} ${JSON.stringify(row.values)}`.toLocaleLowerCase().includes(query)); });
    container.append(element('p', `${rows.length} / ${view.rows.length}개`, 'meta'));
    if (!rows.length) { container.append(element('p', '필터에 맞는 항목이 없습니다. 검색어나 종류를 바꾸거나 필터를 초기화하세요.', 'empty')); return; }
    const page = pageNumber(context.params.get('page'), rows.length, 24), visible = rows.slice(page * 24, (page + 1) * 24);
    if (view.type === 'gallery') {
        const cards = element('div', '', 'record-gallery');
        for (const row of visible) {
            const node = nodes.get(row.nodeId); const card = element('article', '', 'panel record-card'); const title = element('h2'); title.append(anchor(node?.name ?? row.nodeId, context.nodeHref(row.nodeId))); card.append(title);
            if (node) card.append(element('span', context.kindLabel(node.kind), 'badge'));
            for (const column of view.columns) { const field = element('div', '', column.role === 'badge' || column.role === 'status' ? 'record-tag' : 'record-field'); field.append(element('strong', column.label), humanValue(row.values[column.id], context)); card.append(field); }
            if (node && view.edgeKinds?.length) card.append(relations(node, context, view.edgeKinds)); cards.append(card);
        }
        container.append(cards);
    } else {
        const table = element('table', '', 'view-data-table status-table'); table.append(element('caption', '노드별 상태와 근거. 대응 링크는 구현 동등성을 보증하지 않습니다.'));
        const head = element('thead'), heading = element('tr');
        for (const label of ['노드', ...view.columns.map(column => column.label), '근거']) { const cell = element('th', label); cell.scope = 'col'; heading.append(cell); } head.append(heading); table.append(head); const body = element('tbody');
        for (const row of visible) {
            const node = nodes.get(row.nodeId), tr = element('tr'), title = element('th'); title.scope = 'row'; title.append(anchor(node?.name ?? row.nodeId, context.nodeHref(row.nodeId))); tr.append(title);
            for (const column of view.columns) { const cell = element('td'); cell.append(humanValue(row.values[column.id], context)); tr.append(cell); }
            const source = element('td'); if (node) { if (view.edgeKinds?.length) source.append(relations(node, context, view.edgeKinds)); const evidence = element('details'); evidence.append(element('summary', '노드 출처'), context.sources(node.sources)); source.append(evidence); } tr.append(source); body.append(tr);
        }
        table.append(body); container.append(region(table, '상태와 근거 표'));
    }
    paging(container, context, { total: rows.length, size: 24, key: 'page' });
}
