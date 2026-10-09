import type { ViewProjection, Axis } from './views-model.js';
import type { ViewsContext } from './views-shared.js';
import { viewRoute, panel, region, selection, paging } from './views-shared.js';
import { element, anchor, pageNumber } from './explore-controls.js';
export function renderMatrix(container: HTMLElement, context: ViewsContext, view: Extract<ViewProjection, { type: 'matrix'; }>): void {
    if (!view.rows.length || !view.columns.length) { container.append(element('p', '선택한 층에 행렬 입력이 없습니다. 아래 쿼리와 입력 범위를 확인하세요.', 'empty')); return; }
    const rowPage = pageNumber(context.params.get('rowPage'), view.rows.length, 20), columnPage = pageNumber(context.params.get('columnPage'), view.columns.length, 20);
    const rows = view.rows.slice(rowPage * 20, (rowPage + 1) * 20), columns = view.columns.slice(columnPage * 20, (columnPage + 1) * 20);
    const axisLink = (axis: Axis, dimension: string) => anchor(axis.label, viewRoute(context, { axis: dimension, value: axis.key, row: '', column: '', detailPage: '0', edgePage: '0' }));
    const table = element('table', '', 'matrix'); table.append(element('caption', `${view.rows.length}행 × ${view.columns.length}열 · ${view.mode === 'edges' ? '행 → 열 연결 수' : '분류에 속한 노드 수'} · 축과 숫자를 선택하면 근거를 확인할 수 있습니다.`));
    const header = element('tr'); const corner = element('th', '출발 ↓ / 도착 →'); corner.scope = 'col'; header.append(corner);
    for (const column of columns) { const cell = element('th'); cell.scope = 'col'; cell.append(axisLink(column, 'column')); header.append(cell); }
    const head = element('thead'); head.append(header); table.append(head); const body = element('tbody');
    const byCell = new Map<string, typeof view.cells>(); for (const cell of view.cells) { const key = JSON.stringify([cell.row, cell.column]); byCell.set(key, [...(byCell.get(key) ?? []), cell]); }
    for (const row of rows) {
        const tr = element('tr'); const heading = element('th'); heading.scope = 'row'; heading.append(axisLink(row, 'row')); tr.append(heading);
        for (const column of columns) {
            const matches = byCell.get(JSON.stringify([row.key, column.key])) ?? []; const count = matches.reduce((sum, cell) => sum + cell.count, 0); const td = element('td');
            if (count) { const link = anchor(String(count), viewRoute(context, { row: row.key, column: column.key, axis: '', value: '', detailPage: '0', edgePage: '0' })); link.className = 'matrix-cell'; link.setAttribute('aria-label', `${row.label} → ${column.label}: ${count}`); td.append(link); } else { td.textContent = '—'; td.className = 'muted'; } tr.append(td);
        } body.append(tr);
    }
    table.append(body); container.append(region(table, '행렬, 가로로 스크롤할 수 있습니다'));
    const controls = element('div', '', 'view-axis-pages'); const rowControl = element('div'); rowControl.append(element('h3', '행 범위')); paging(rowControl, context, { total: view.rows.length, size: 20, key: 'rowPage' }); const columnControl = element('div'); columnControl.append(element('h3', '열 범위')); paging(columnControl, context, { total: view.columns.length, size: 20, key: 'columnPage' }); controls.append(rowControl, columnControl); container.append(controls);
    const row = context.params.get('row'), column = context.params.get('column'), axis = context.params.get('axis'), value = context.params.get('value');
    if (axis === 'row' || axis === 'column') { const selected = (axis === 'row' ? view.rows : view.columns).find(item => item.key === value); const detail = panel('선택한 분류'); if (selected) { detail.append(element('p', selected.label)); selection(detail, context, { nodeIds: selected.nodeIds, edgeIds: [] }); } else detail.append(element('p', '선택한 축을 현재 층에서 찾을 수 없습니다.')); container.append(detail); }
    else if (row !== null && column !== null && row && column) { const selected = view.cells.filter(cell => cell.row === row && cell.column === column); const detail = panel('선택한 연결'); if (!selected.length) detail.append(element('p', '이 칸에는 연결이 없습니다.')); else { detail.append(element('p', `${view.rows.find(item => item.key === row)?.label ?? row} → ${view.columns.find(item => item.key === column)?.label ?? column}`)); for (const cell of selected) if (cell.label) detail.append(element('p', cell.label)); selection(detail, context, { nodeIds: [...new Set(selected.flatMap(cell => cell.nodeIds))], edgeIds: [...new Set(selected.flatMap(cell => cell.edgeIds))] }); } container.append(detail); }
}
