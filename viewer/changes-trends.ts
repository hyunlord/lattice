import { element } from './explore-controls.js';
import { facetTrends, type HistoryEntry } from './history-projections.js';
import { valueLabel as typedLabel } from './list-model.js';
import { changeSection, historyPages, snapshotLabel, type ChangesContext } from './changes-shared.js';
export function renderTrends(container: HTMLElement, entries: readonly HistoryEntry[], context: ChangesContext): void {
    const section = changeSection('분류별 스냅샷 추이');
    section.append(element('p', '내보낸 모든 스냅샷의 목록 순서입니다. 시간 간격이나 커밋 선후 관계를 뜻하지 않습니다. 값마다 고유 노드 수를 세며 여러 값에 속한 노드는 중복될 수 있습니다. 불러오기 실패는 0이 아닌 미확인으로 표시합니다.', 'meta'));
    const hidden = new Set(context.kinds.filter(kind => kind.hidden).map(kind => kind.id));
    const trends = facetTrends(entries, context.layer, hidden);
    if (!trends.length) section.append(element('p', '불러온 스냅샷의 이 층에는 분류가 없습니다. 렌즈가 없는 저장소에서도 위의 종류 개수와 노드·연결 변화를 비교할 수 있습니다.', 'empty'));
    historyPages(section, trends, trend => {
        const block = element('div', '', 'history-trend'); block.append(element('h3', context.facetLabel(trend.key)));
        const max = Math.max(1, ...trend.buckets.flatMap(bucket => bucket.counts.filter((count): count is number => count !== null)));
        historyPages(block, trend.buckets, bucket => {
            const group = element('div', '', 'history-bucket');
            const label = bucket.value === undefined ? '(미기재)' : context.valueLabel(trend.key, bucket.value);
            group.append(element('h4', `${label || '(빈 문자열)'} · ${typedLabel(bucket.value)}`));
            const table = element('table', '', 'history-trend-table'); table.append(element('caption', `${context.facetLabel(trend.key)} / ${label} · 고유 노드 수`));
            const head = element('thead'); const headings = element('tr');
            for (const text of ['스냅샷', '노드 수']) { const cell = element('th', text); cell.scope = 'col'; headings.append(cell); } head.append(headings); table.append(head);
            const body = element('tbody');
            entries.forEach((entry, index) => {
                const row = element('tr'); const name = element('th', snapshotLabel(entry.snapshot, index)); name.scope = 'row';
                const count = bucket.counts[index]; const cell = element('td', count === null || count === undefined ? '미확인' : String(count));
                if (count !== null && count !== undefined) { const bar = element('span', '', 'view-bar'); bar.setAttribute('aria-hidden', 'true'); const fill = element('span'); fill.style.width = `${count / max * 100}%`; bar.append(fill); cell.append(bar); }
                row.append(name, cell); body.append(row);
            }); table.append(body); group.append(table); return group;
        }, 5); return block;
    }, 3); container.append(section);
}
