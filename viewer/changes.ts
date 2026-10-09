import { element, anchor, action } from './explore-controls.js';
import type { HistoryEntry } from './history-projections.js';
import { changeSection, historyPages, historyHref, snapshotLabel, type ChangesContext } from './changes-shared.js';
import { renderEvidence } from './changes-evidence.js';
import { renderTrends } from './changes-trends.js';
export type { ChangesContext } from './changes-shared.js';
function selectors(container: HTMLElement, context: ChangesContext, base: string, head: string): void {
    const form = element('form', '', 'filters history-selectors');
    for (const [key, label, current] of [['base', '이전', base], ['head', '이후', head]] as const) {
        const wrap = element('label', label); const select = element('select'); select.name = key;
        if (!context.snapshots.some(snapshot => snapshot.id === current)) { const option = element('option', '이 주소의 스냅샷 없음'); option.value = current; select.append(option); }
        context.snapshots.forEach((snapshot, index) => { const option = element('option', snapshotLabel(snapshot, index)); option.value = snapshot.id; select.append(option); });
        select.value = current; wrap.append(select); form.append(wrap);
    }
    const submit = element('button', '비교'); submit.type = 'submit'; form.append(submit);
    form.onsubmit = event => { event.preventDefault(); const changes: Record<string, string> = {}; for (const [key, value] of new FormData(form)) if (typeof value === 'string') changes[key] = value; location.hash = historyHref(context, changes); }; container.append(form);
    const focus = context.params.get('node');
    if (focus) { const row = element('p', '', 'history-focus'); row.append(element('span', `노드 이력 범위: ${focus}`), anchor('전체 변화 보기', historyHref(context, { node: '' }))); container.append(row); }
}
function manifest(container: HTMLElement, entries: readonly HistoryEntry[], context: ChangesContext): void {
    const section = changeSection(`내보낸 스냅샷 · ${entries.length}`);
    section.append(element('p', '번호는 내보내기 목록의 순서입니다. 각 레코드에서 커밋·그래프·렌즈와 수집 범위를 확인하세요.', 'meta'));
    historyPages(section, entries.map((entry, index) => ({ entry, index })), ({ entry, index }) => {
        const row = element('details', '', 'change-record history-manifest'); row.append(element('summary', `${snapshotLabel(entry.snapshot, index)} · ${entry.error ? '불러오기 실패' : '불러옴'} · ${entry.snapshot.coverage}`));
        const list = element('dl');
        for (const [label, value] of [['커밋', entry.snapshot.commit ?? '(없음)'], ['그래프 해시', entry.snapshot.graphHash], ['렌즈 해시', entry.snapshot.lensHash ?? '(렌즈 없음)'], ['입력 지문', entry.snapshot.inputFingerprint], ['수집 범위', entry.snapshot.coverage], ['스냅샷 ID', entry.snapshot.id]]) list.append(element('dt', label), element('dd', value));
        row.append(list);
        if (entry.snapshot.coverage === 'current-lens-projection') row.append(element('p', '현재 렌즈를 과거 소스에 적용한 투영입니다. 당시 렌즈의 판정으로 해석하지 마세요.', 'home-coverage'));
        if (entry.error) row.append(element('p', entry.error, 'empty'));
        const links = element('div', '', 'actions'); links.append(anchor('이전으로 선택', historyHref(context, { base: entry.snapshot.id })), anchor('이후로 선택', historyHref(context, { head: entry.snapshot.id }))); row.append(links); return row;
    }); container.append(section);
}
export async function renderChanges(container: HTMLElement, context: ChangesContext): Promise<void> {
    context.heading('스냅샷 변화', '선택한 두 기록의 내용과 모든 기록의 분류 추이를 확인합니다. 노드는 같은 층·종류·원본 ID로 대응시킵니다.');
    if (!context.snapshots.length) { container.append(element('p', '내보낸 스냅샷이 없습니다. lattice diff로 Git 기록을 비교한 뒤 다시 내보내세요.', 'empty')); return; }
    const baseId = context.params.get('base') || context.snapshots[0]?.id || '';
    const headId = context.params.get('head') || context.snapshots.at(-1)?.id || '';
    selectors(container, context, baseId, headId);
    const loading = element('p', '스냅샷을 불러오고 있습니다…', 'muted'); loading.setAttribute('role', 'status'); container.append(loading);
    const results = await Promise.allSettled(context.snapshots.map(snapshot => context.readSnapshot(snapshot)));
    if (!context.isCurrent()) return; loading.remove();
    const entries: HistoryEntry[] = context.snapshots.map((snapshot, index) => {
        const result = results[index];
        return result?.status === 'fulfilled' ? { snapshot, graph: result.value } : { snapshot, error: result?.status === 'rejected' ? result.reason instanceof Error ? result.reason.message : String(result.reason) : '스냅샷 응답 없음' };
    });
    const gaps = entries.filter(entry => entry.error);
    if (gaps.length) { const warning = element('div', '', 'home-coverage'); warning.append(element('p', `${gaps.length}개 스냅샷을 불러오지 못했습니다. 추이의 미확인은 데이터 공백입니다.`), action('다시 시도', () => { if (!context.isCurrent()) return; container.replaceChildren(); void renderChanges(container, context); })); container.append(warning); }
    const before = entries.find(entry => entry.snapshot.id === baseId), after = entries.find(entry => entry.snapshot.id === headId);
    if (!before || !after) container.append(element('p', '이 주소의 스냅샷이 내보내기에 없습니다. 이전·이후를 다시 선택하세요.', 'empty'));
    else if (!before.graph || !after.graph) container.append(element('p', '선택한 비교 기록을 불러오지 못했습니다. 다른 기록을 선택하거나 다시 시도하세요.', 'empty'));
    else {
        if (baseId === headId) container.append(element('p', '같은 스냅샷을 비교하고 있습니다. 다른 기록을 선택하면 변화가 표시됩니다.', 'meta'));
        if (before.snapshot.lensHash !== after.snapshot.lensHash) container.append(element('p', '렌즈가 다른 두 기록입니다. 분류·발견 변화에는 규칙 변경도 포함될 수 있습니다.', 'home-coverage'));
        renderEvidence(container, before.graph, after.graph, context);
    }
    renderTrends(container, entries, context); manifest(container, entries, context);
}
