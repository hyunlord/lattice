import type { ViewProjection } from './views-model.js';
import type { ViewsContext } from './views-shared.js';
import { viewRoute, panel, region, selection, paging, valueText } from './views-shared.js';
import { element, anchor, pageNumber } from './explore-controls.js';
import { canvas } from './explore-canvas.js';
export function renderDistribution(container: HTMLElement, context: ViewsContext, view: Extract<ViewProjection, { type: 'distribution'; }>): void {
    const table = element('table', '', 'view-distribution'); table.append(element('caption', `${view.buckets.length}개 값 · 노드 ${view.coverage.selected}개`)); const head = element('thead'); const header = element('tr'); for (const title of ['값', '노드 수', '비율']) { const th = element('th', title); th.scope = 'col'; header.append(th); } head.append(header); table.append(head);
    const page = pageNumber(context.params.get('page'), view.buckets.length, 30); const body = element('tbody');
    for (const bucket of view.buckets.slice(page * 30, (page + 1) * 30)) { const row = element('tr'), title = element('th'); title.scope = 'row'; title.append(anchor(bucket.label, viewRoute(context, { bucket: bucket.key, detailPage: '0', edgePage: '0' }))); const count = element('td', String(bucket.count), 'mono'); const amount = element('td'); const percent = view.coverage.selected ? bucket.count / view.coverage.selected * 100 : 0; const bar = element('span', '', 'view-bar'); const fill = element('span'); fill.style.width = `${percent}%`; bar.append(fill); bar.setAttribute('aria-hidden', 'true'); amount.append(element('span', `${percent.toFixed(1)}%`, 'mono'), bar); row.append(title, count, amount); body.append(row); }
    table.append(body); container.append(region(table, '분포 값과 노드 수')); paging(container, context, { total: view.buckets.length, size: 30, key: 'page' });
    if (!view.buckets.length) container.append(element('p', '선택한 층에 분포 입력이 없습니다. 아래 쿼리와 입력 범위를 확인하세요.', 'empty'));
    const bucket = context.params.get('bucket'); if (bucket !== null) { const detail = panel('선택한 값'); const selected = view.buckets.find(item => item.key === bucket); if (selected) { detail.append(element('p', selected.label)); selection(detail, context, selected); } else detail.append(element('p', '선택한 값을 현재 층에서 찾을 수 없습니다.')); container.append(detail); }
}
export function renderTable(container: HTMLElement, context: ViewsContext, view: Extract<ViewProjection, { type: 'table'; }>): void {
    const nodes = new Map(context.nodes.map(node => [node.id, node])); const table = element('table', '', 'view-data-table'); table.append(element('caption', `쿼리 결과 ${view.rows.length}개`)); const head = element('thead'), header = element('tr');
    for (const title of ['노드', ...view.columns.map(column => column.label)]) { const th = element('th', title); th.scope = 'col'; header.append(th); } head.append(header); table.append(head); const body = element('tbody'); const page = pageNumber(context.params.get('page'), view.rows.length, 30);
    for (const record of view.rows.slice(page * 30, (page + 1) * 30)) { const row = element('tr'), title = element('th'); title.scope = 'row'; title.append(anchor(nodes.get(record.nodeId)?.name ?? record.nodeId, context.nodeHref(record.nodeId))); row.append(title); for (const column of view.columns) row.append(element('td', valueText(record.values[column.id]))); body.append(row); }
    table.append(body); container.append(region(table, '쿼리 결과 표, 가로로 스크롤할 수 있습니다')); paging(container, context, { total: view.rows.length, size: 30, key: 'page' }); if (!view.rows.length) container.append(element('p', '선택한 층에 표 입력이 없습니다.', 'empty'));
}
export function renderCycle(container: HTMLElement, context: ViewsContext, view: Extract<ViewProjection, { type: 'cycle' | 'graph'; }>): () => void {
    if (view.type === 'graph') {
        const label = element('label', '중심 노드'), focus = element('select'); const any = element('option', '전체 노드'); any.value = ''; focus.append(any);
        for (const node of view.nodes) { const option = element('option', node.name); option.value = node.id; focus.append(option); } focus.name = 'focus'; focus.setAttribute('aria-label', '중심 노드'); focus.value = context.params.get('focus') ?? '';
        focus.onchange = () => { location.hash = viewRoute(context, { focus: focus.value, page: '0' }); }; label.append(focus); container.append(label);
        const id = context.params.get('focus'); if (id && view.nodes.some(node => node.id === id)) { const edges = view.edges.filter(edge => edge.source === id || edge.target === id), ids = new Set([id, ...edges.flatMap(edge => [edge.source, edge.target])]); view = { ...view, nodes: view.nodes.filter(node => ids.has(node.id)), edges }; }
    }
    const page = pageNumber(context.params.get('page'), view.nodes.length, 50); const nodes = view.nodes.slice(page * 50, (page + 1) * 50); const ids = new Set(nodes.map(node => node.id)); const edges = view.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target));
    container.append(element('p', `쿼리 노드 ${view.nodes.length}개 · 관계 ${view.edges.length}개. 지도에는 현재 페이지 노드 ${nodes.length}개와 그 사이 관계 ${edges.length}개를 표시합니다. 모든 관계는 아래 근거 목록에서 확인할 수 있습니다. 닫힌 순환의 존재를 가정하지 않습니다.`, 'meta'));
    const cleanup = nodes.length ? canvas(container, { nodes: nodes.map(node => ({ id: node.id, label: node.name, kind: node.kind, count: 1, cluster: false, facet: '', pinned: false, facetValue: '' })), edges: edges.map(edge => ({ source: edge.source, target: edge.target, label: String(edge.attributes?.['label'] ?? edge.kind), directed: edge.directed, count: 1 })), kinds: [...new Set(view.nodes.map(node => node.kind))].sort(), kindLabel: context.kindLabel, selected: context.params.get('selected') ?? '', choose: id => { location.hash = context.nodeHref(id); } }) : () => { };
    paging(container, context, { total: view.nodes.length, size: 50, key: 'page' });
    const evidence = panel(view.type === 'graph' ? '개별 노드와 연결' : '순환 보기의 노드와 연결'); selection(evidence, context, { nodeIds: view.nodes.map(node => node.id), edgeIds: view.edges.map(edge => edge.id) }); if (!view.nodes.length) evidence.append(element('p', '선택한 층에 순환 보기 입력이 없습니다.')); else if (!view.edges.length) evidence.append(element('p', '이 쿼리에는 연결 근거가 없습니다.')); container.append(evidence); return cleanup;
}
