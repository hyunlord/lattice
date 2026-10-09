import { element, anchor, action, pager } from './explore-controls.js';
import { projectList, cellValue, valueLabel } from './list-model.js';
import { listControls, listRoute, type ListContext } from './list-controls.js';
export type { ListContext } from './list-controls.js';
export function renderList(container: HTMLElement, context: ListContext): void {
    context.heading('노드 목록', '이름·ID·태그를 검색하고 종류·분류·속성으로 좁혀 보세요. 열 제목으로 정렬할 수 있습니다.');
    listControls(container, context);
    const result = projectList(context.nodes, context.facets, context.kinds, context.params);
    if (result.unsupported) container.append(element('p', result.unsupported, 'panel section'));
    if (!result.nodes.length) { container.append(element('p', '조건에 맞는 노드가 없습니다. 검색어나 필터를 바꾸거나 초기화하세요.', 'empty')); return; }
    const size = 40; const pages = Math.max(1, Math.ceil(result.nodes.length / size)); const page = Math.min(pages, Math.max(1, Number.parseInt(context.params.get('page') ?? '1', 10) || 1));
    const table = element('table', '', 'list-table'); table.append(element('caption', `${result.nodes.length}개 중 ${(page - 1) * size + 1}–${Math.min(page * size, result.nodes.length)}개 · 미기재 값은 정렬 방향에 관계없이 마지막`));
    const head = element('thead'); const header = element('tr');
    const sortedHeader = (id: string, title: string) => {
        const th = element('th'); th.scope = 'col'; const selected = result.sort === id; th.setAttribute('aria-sort', selected ? result.direction === 'asc' ? 'ascending' : 'descending' : 'none');
        const label = `${title}${selected ? result.direction === 'asc' ? ' ↑' : ' ↓' : ''}`;
        const button = action(label, () => { location.hash = listRoute(context, { sort: id, dir: selected && result.direction === 'asc' ? 'desc' : 'asc', page: '' }); });
        button.setAttribute('aria-label', `${title}, ${selected && result.direction === 'asc' ? '내림차순' : '오름차순'} 정렬`); th.append(button); return th;
    };
    header.append(sortedHeader('name', '이름 / ID'), sortedHeader('kind', '종류'));
    for (const column of result.columns) header.append(sortedHeader(column.id, column.type === 'facet' ? context.facetLabel(column.key) : column.label));
    for (const label of ['분류', '출처']) { const th = element('th', label); th.scope = 'col'; header.append(th); } head.append(header); table.append(head);
    const body = element('tbody');
    for (const node of result.nodes.slice((page - 1) * size, page * size)) {
        const row = element('tr'); const name = element('td', '', 'node-name'); name.append(anchor(node.name, context.nodeHref(node.id)), element('code', node.id, 'node-id')); row.append(name, element('td', context.kindLabel(node.kind)));
        for (const column of result.columns) {
            const entry = cellValue(node, column, context.facets); const cell = element('td');
            if (entry.value !== null && typeof entry.value === 'object') { const detail = element('details'); detail.append(element('summary', '구조 값'), element('pre', JSON.stringify(entry.value, null, 2))); cell.append(detail); }
            else cell.append(element('span', column.type === 'facet' && entry.value !== undefined ? context.valueLabel(column.key, entry.value) : valueLabel(entry.value)));
            if (column.type === 'facet' && entry.sources.length) { const evidence = element('details'); evidence.append(element('summary', '분류 근거'), context.sources(entry.sources)); cell.append(evidence); }
            row.append(cell);
        }
        const classification = element('td'); for (const facet of context.facets.filter(item => item.nodeId === node.id)) classification.append(element('div', `${context.facetLabel(facet.key)}: ${context.valueLabel(facet.key, facet.value)}`, 'meta'));
        const source = element('td'); source.append(context.sources(node.sources)); row.append(classification, source); body.append(row);
    }
    table.append(body);
    const hint = element('p', '열이 화면을 벗어나면 표를 가로로 스크롤하세요. 표에 초점을 두고 ← → 키로도 이동할 수 있습니다. 이름은 왼쪽에 고정됩니다.', 'meta list-scroll-hint'); hint.id = 'list-scroll-hint';
    const region = element('div', '', 'table-region list-region'); region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', '검색 결과 표'); region.setAttribute('aria-describedby', hint.id); region.append(table); container.append(hint, region);
    pager(container, { total: result.nodes.length, page: page - 1, size, change: next => { location.hash = listRoute(context, { page: String(next + 1) }); } });
}
