import type { Node, Snapshot, Source } from '../dist/core/model.js';
import type { BrowserGraph } from './data.js';
import { action, anchor, element, pager } from './explore-controls.js';
import { nodeIdentity } from './history-model.js';
import { nodeTimeline, type HistoryEntry, type NodeObservation } from './history-projections.js';

export type NodeHistoryContext = {
    readonly node: Node;
    readonly snapshots: readonly Snapshot[];
    readonly readSnapshot: (snapshot: Snapshot) => Promise<BrowserGraph>;
    readonly isCurrent: () => boolean;
    readonly sources: (sources: readonly Source[]) => HTMLElement;
    readonly changesHref: (base: string, head: string, identity: string) => string;
};
const statusLabels = {
    unknown: '확인 불가', 'first-observed': '처음 관측', present: '존재 · 내용 유지',
    absent: '관측되지 않음', added: '추가', removed: '삭제', changed: '내용 변경',
} as const;
function snapshotLabel(snapshot: Snapshot): string {
    return `${snapshot.commit?.slice(0, 12) ?? '커밋 없음'} · ${snapshot.id.slice(0, 12)} · ${snapshot.coverage}`;
}
function evidence(observation: NodeObservation, context: NodeHistoryContext): HTMLElement {
    const detail = element('details'); detail.append(element('summary', '이전·이후 출처'));
    detail.append(element('h4', '이전 출처'));
    detail.append(observation.previous ? context.sources(observation.previous.sources) : element('p', '이 관측에 비교 가능한 이전 노드가 없습니다.', 'meta'));
    detail.append(element('h4', '이후 출처'));
    detail.append(observation.node ? context.sources(observation.node.sources) : element('p', '이 스냅샷에 노드가 없습니다.', 'meta'));
    return detail;
}
function observationRow(observation: NodeObservation, context: NodeHistoryContext): HTMLElement {
    const row = element('li', '', 'node-history-entry');
    const label = observation.status === 'present' && !observation.previous ? '존재 · 이전 비교 불가' : statusLabels[observation.status];
    row.append(element('h3', label), element('p', snapshotLabel(observation.snapshot), 'meta'));
    if (observation.error) row.append(element('p', observation.error, 'empty'));
    if (observation.status === 'unknown') {
        row.append(element('p', '읽지 못한 스냅샷입니다. 이 구간을 건너뛰어 변경 여부를 추정하지 않습니다.', 'meta')); return row;
    }
    if (observation.firstObserved) row.append(element('p', '내보낸 이력에서 처음 확인된 기록입니다. 실제 생성 시점은 알 수 없습니다.', 'meta'));
    if (observation.status === 'present' && !observation.previous) row.append(element('p', '이전 관측을 읽지 못해 그 사이의 변경 여부는 알 수 없습니다.', 'meta'));
    if (observation.sourceMoved) row.append(element('p', '출처 경로 이동 · 내용 변경과 별도로 표시합니다.', 'badge'));
    const before = observation.previousSnapshot;
    if (before && ['added', 'removed', 'changed'].includes(observation.status)) row.append(anchor('이전·이후 비교', context.changesHref(before.id, observation.snapshot.id, nodeIdentity(context.node))));
    if (observation.node || observation.previous) row.append(evidence(observation, context));
    return row;
}
export async function renderNodeHistory(container: HTMLElement, context: NodeHistoryContext): Promise<void> {
    const section = element('section', '', 'panel section node-history'); section.append(element('h2', '노드 변경 이력'));
    section.append(element('p', '내보낸 스냅샷의 관측 순서입니다. 커밋 시간순이나 전체 Git 이력이 아니며, 같은 층·종류·원본 ID를 비교합니다. 네임스페이스만 달라진 ID는 같은 노드로 봅니다.', 'meta'));
    container.append(section);
    if (!context.snapshots.length) { section.append(element('p', '내보낸 스냅샷이 없어 노드 변경 이력을 확인할 수 없습니다.', 'empty')); return; }
    if (context.snapshots.length === 1) section.append(element('p', '스냅샷이 하나뿐입니다. 존재 여부만 확인하며 변경을 비교하지 않습니다.', 'meta'));
    const output = element('div'); section.append(output);
    const load = async (): Promise<void> => {
        output.replaceChildren(element('p', '노드 이력을 읽는 중…', 'muted')); output.setAttribute('aria-busy', 'true');
        const entries = await Promise.all(context.snapshots.map(async (snapshot): Promise<HistoryEntry> => {
            try { return { snapshot, graph: await context.readSnapshot(snapshot) }; }
            catch (error) { return { snapshot, error: error instanceof Error ? error.message : String(error) }; }
        }));
        if (!context.isCurrent()) return;
        const observations = nodeTimeline(entries, context.node); output.replaceChildren(); output.removeAttribute('aria-busy');
        const unknown = observations.filter(observation => observation.status === 'unknown').length;
        if (unknown) output.append(element('p', `${unknown}개 스냅샷을 읽지 못했습니다. 확인 가능한 관측만 표시합니다.`, 'empty'), action('노드 이력 다시 읽기', () => { void load(); }));
        if (!unknown && !observations.some(observation => observation.node)) output.append(element('p', '내보낸 스냅샷에서 이 노드를 찾지 못했습니다. 현재 그래프는 이 이력에 포함되지 않을 수 있습니다.', 'empty'));
        const changes = observations.filter(observation => ['added', 'removed', 'changed'].includes(observation.status)).length;
        output.append(element('p', `${observations.length}개 관측 · 확인된 내용 변화 ${changes}건`, 'meta'));
        if (!changes && context.snapshots.length > 1) output.append(element('p', '연속해서 읽을 수 있는 스냅샷 사이에서 추가·삭제·내용 변경이 확인되지 않았습니다. 출처 이동과 읽지 못한 구간은 별도로 표시합니다.', 'meta'));
        const listArea = element('div'); output.append(listArea);
        const draw = (page: number, focus = false): void => {
            listArea.replaceChildren(); const list = element('ol', '', 'node-history-list'); list.start = page * 8 + 1;
            observations.slice(page * 8, (page + 1) * 8).forEach(observation => list.append(observationRow(observation, context)));
            listArea.append(list); if (observations.length > 8) pager(listArea, { total: observations.length, page, size: 8, change: next => draw(next, true) });
            if (focus) { list.tabIndex = -1; list.focus(); }
        };
        draw(0);
    };
    await load();
}
