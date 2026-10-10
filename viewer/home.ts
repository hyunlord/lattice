import type { Node as GraphNode, Finding, Source, Snapshot, Facet } from '../dist/core/model.js';
import type { BrowserGraph, Presentation } from './data.js';
import { element, anchor, action, pager } from './explore-controls.js';
import { valueKey, valueLabel as typedLabel } from './list-model.js';
import { changedAreas, sourceInventory, nodeIdentity } from './history-model.js';
export type HomeContext = {
    readonly graph: BrowserGraph; readonly nodes: readonly GraphNode[]; readonly findings: readonly Finding[];
    readonly kinds: Presentation['kinds']; readonly presentation: Presentation; readonly layer: string; readonly snapshots: readonly Snapshot[];
    readonly readSnapshot: (snapshot: Snapshot) => Promise<BrowserGraph>; readonly isCurrent: () => boolean;
    readonly heading: (title: string, description: string) => void; readonly kindLabel: (kind: string) => string;
    readonly facetLabel: (key: string) => string; readonly valueLabel: (key: string, value: unknown) => string;
    readonly sources: (sources: readonly Source[]) => HTMLElement; readonly findingView: (finding: Finding) => HTMLElement;
    readonly nodeHref: (id: string) => string; readonly listHref: (params: Record<string, string>) => string;
    readonly changesHref: (base: string, head: string) => string;
};
function section(title: string): HTMLElement { const result = element('section', '', 'panel section home-section'); result.append(element('h2', title)); return result; }
function pages<T>(container: HTMLElement, records: readonly T[], render: (record: T) => HTMLElement, size = 10): void {
    const host = element('div'); host.tabIndex = -1; container.append(host);
    const draw = (page: number, focus = false) => {
        host.replaceChildren();
        for (const record of records.slice(page * size, (page + 1) * size)) host.append(render(record));
        if (records.length > size) pager(host, { total: records.length, page, size, change: next => draw(next, true) });
        if (focus) host.focus();
    };
    draw(0);
}
function inventory(context: HomeContext): HTMLElement {
    const result = section('종류별 목록'); const counts = new Map<string, number>();
    for (const node of context.nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    const ordered = [...new Set([...context.kinds.map(kind => kind.id), ...counts.keys()])].filter(kind => counts.has(kind));
    pages(result, ordered, kind => { const row = element('div', '', 'count-row'); row.append(anchor(context.kindLabel(kind), context.listHref({ kind })), element('strong', String(counts.get(kind)), 'mono')); return row; });
    if (!context.nodes.length) result.append(element('p', '이 층에 표시할 노드가 없습니다. 목록에서 층과 빌드 입력을 확인하세요.', 'empty'));
    return result;
}
function distributions(context: HomeContext): HTMLElement {
    const result = section('분류 분포'); const ids = new Set(context.nodes.map(node => node.id));
    const groups = new Map<string, Map<string, { value: Facet['value']; ids: Set<string>; }>>();
    for (const facet of context.graph.facets) {
        if (!ids.has(facet.nodeId)) continue;
        let group = groups.get(facet.key); if (!group) { group = new Map(); groups.set(facet.key, group); }
        const key = valueKey(facet.value); let bucket = group.get(key);
        if (!bucket) { bucket = { value: facet.value, ids: new Set() }; group.set(key, bucket); }
        bucket.ids.add(facet.nodeId);
    }
    if (!groups.size) result.append(element('p', '이 층에는 렌즈 분류가 없습니다. 종류별 목록에서 원본 속성을 확인할 수 있습니다.', 'empty'));
    else result.append(element('p', '각 값에 해당하는 고유 노드 수입니다. 한 노드는 여러 값에 속할 수 있습니다.', 'meta'));
    pages(result, [...groups], ([key, buckets]) => {
        const block = element('div', '', 'distribution'); block.append(element('h3', context.facetLabel(key)));
        const labels = new Map<string, number>(); for (const bucket of buckets.values()) { const label = context.valueLabel(key, bucket.value); labels.set(label, (labels.get(label) ?? 0) + 1); }
        pages(block, [...buckets], ([identity, bucket]) => {
            const row = element('div', '', 'home-bucket'); const line = element('div', '', 'count-row');
            const label = context.valueLabel(key, bucket.value); const text = (labels.get(label) ?? 0) > 1 ? `${label} · ${typedLabel(bucket.value)}` : label;
            line.append(anchor(text || '(빈 문자열)', context.listHref({ facet: key, value: identity, valueType: 'json' })), element('strong', String(bucket.ids.size), 'mono'));
            const bar = element('div', '', 'bar'); bar.setAttribute('aria-hidden', 'true'); const fill = element('span'); fill.style.width = `${bucket.ids.size / Math.max(ids.size, 1) * 100}%`; bar.append(fill); row.append(line, bar); return row;
        });
        return block;
    }, 5);
    return result;
}
function findings(context: HomeContext): HTMLElement {
    const result = section('발견과 근거');
    result.append(element('p', '자동 발견은 숨김 종류를 포함한 추출 노드 전체에서 같은 층의 연결을 계산합니다. 렌즈 규칙의 범위는 각 발견의 근거에서 확인하세요.', 'meta'));
    if (!context.findings.length) { result.append(element('p', '현재 층에 생성된 발견이 없습니다. 이는 모든 도메인 조건을 검사했다는 뜻은 아닙니다.', 'empty')); return result; }
    pages(result, context.findings, finding => {
        const row = element('div', '', 'home-finding'); row.append(element('p', finding.ruleId.startsWith('auto:') ? '자동 구조 분석' : '렌즈 규칙', 'meta'), context.findingView(finding)); return row;
    });
    return result;
}
function currentSources(container: HTMLElement, context: HomeContext): void {
    container.append(element('h3', '현재 소스 분포'), element('p', '현재 표시된 노드의 출처 폴더별 수입니다. 여러 폴더에 근거가 있는 노드는 각 폴더에 한 번씩 셉니다.', 'meta'));
    const areas = sourceInventory(context.nodes);
    pages(container, areas, area => { const row = element('div', '', 'count-row'); row.append(element('code', area.directory), element('strong', String(area.count), 'mono')); return row; });
    if (!areas.length) container.append(element('p', '표시된 노드에 기록된 소스가 없습니다.', 'empty'));
}
function snapshotLabel(snapshot: Snapshot): string { return `${snapshot.commit?.slice(0, 12) || '커밋 없음'} · 스냅샷 ${snapshot.id.slice(0, 12)} · ${snapshot.coverage}`; }
async function recent(container: HTMLElement, context: HomeContext): Promise<void> {
    const before = context.snapshots.at(-2), after = context.snapshots.at(-1);
    if (!before || !after) {
        container.append(element('p', context.snapshots.length ? '내보낸 스냅샷이 하나뿐이므로 변화 집중도를 비교할 수 없습니다.' : '내보낸 이력이 없습니다. 변화 집중도를 계산하려면 두 개 이상의 스냅샷이 필요합니다.', 'muted'));
        if (after) container.append(element('p', snapshotLabel(after), 'meta'));
        currentSources(container, context); return;
    }
    container.append(element('p', '내보낸 이력에서 마지막으로 관측된 두 스냅샷을 비교합니다. 전체 Git 이력이나 커밋 시간순을 뜻하지 않습니다.', 'meta'));
    const coverage = element('div', '', 'home-coverage'); coverage.append(element('p', `기준: ${snapshotLabel(before)}`), element('p', `비교: ${snapshotLabel(after)}`), anchor('두 스냅샷 비교', context.changesHref(before.id, after.id)), element('p', '비교 화면은 내용 차이를 보여 주며, 출처 경로만 이동한 노드는 내용 변경으로 세지 않습니다.', 'meta')); container.append(coverage);
    if (after.graphHash !== context.graph.hash) container.append(element('p', '최근 스냅샷은 현재 표시된 그래프와 다릅니다. 아래 수치는 이 두 스냅샷 사이의 변화입니다.', 'meta'));
    const output = element('div'); container.append(output);
    const load = async () => {
        output.replaceChildren(element('p', '스냅샷을 읽는 중…', 'muted')); output.setAttribute('aria-busy', 'true');
        try {
            const [base, head] = await Promise.all([context.readSnapshot(before), context.readSnapshot(after)]);
            if (!context.isCurrent()) return;
            output.replaceChildren(); const hidden = new Set(context.kinds.filter(kind => kind.hidden).map(kind => kind.id));
            const areas = changedAreas(base, head, context.layer, hidden); const current = new Map(context.nodes.map(node => [nodeIdentity(node), node]));
            output.append(element('p', '추가·삭제·내용 변경·출처 경로 이동 노드를 출처 폴더별로 셉니다. 이동한 노드는 이전·이후 폴더 모두에 포함됩니다.', 'meta'));
            if (!areas.length) output.append(element('p', '이 두 스냅샷에서 현재 층의 노드 내용 변화나 출처 경로 이동이 없습니다. 관계·분류·발견 변화는 비교 화면에서 확인하세요.', 'empty'));
            pages(output, areas, area => {
                const detail = element('details', '', 'home-area'); detail.append(element('summary', `${area.directory} · ${area.count}개 변경 노드`));
                pages(detail, area.changes, change => {
                    const row = element('div', '', 'home-change'); const record = change.current ?? change.previous; if (!record) return row;
                    const live = change.current ? current.get(nodeIdentity(change.current)) : undefined;
                    row.append(element('span', change.status, 'badge'), live ? anchor(record.name, context.nodeHref(live.id)) : element('span', record.name), element('code', record.id, 'meta'));
                    const evidence = element('details'); evidence.append(element('summary', '출처'));
                    if (change.previous) evidence.append(element('h4', '이전 출처'), context.sources(change.previous.sources));
                    if (change.current) evidence.append(element('h4', '이후 출처'), context.sources(change.current.sources));
                    row.append(evidence); return row;
                });
                return detail;
            });
        } catch (error) {
            if (!context.isCurrent()) return;
            output.replaceChildren(element('p', `스냅샷을 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}`, 'empty'), action('스냅샷 다시 읽기', () => { void load(); }));
        } finally { if (context.isCurrent()) output.removeAttribute('aria-busy'); }
    };
    await load();
}
export async function renderHome(container: HTMLElement, context: HomeContext): Promise<void> {
    context.heading(context.presentation.name || context.graph.repository.name, context.presentation.description || '데이터를 분류하고 발견의 근거를 확인합니다.');
    const summary = element('div', '', 'summary');
    for (const [count, label] of [[context.nodes.length, '노드'], [new Set(context.nodes.map(node => node.kind)).size, '종류'], [context.findings.length, '발견']] as const) {
        const item = element('span'); item.append(element('strong', String(count)), document.createTextNode(label)); summary.append(item);
    }
    container.append(summary);
    const curated = context.presentation.home;
    if (curated) {
        const entries = section('지도에서 알아보기'); entries.classList.add('home-entries'); const ids = new Set(context.nodes.map(node => node.id));
        for (const id of curated.viewIds) {
            const view = context.graph.views.find(view => view.id === id); const inputs = view?.query['nodeIds']; if (!view || !Array.isArray(inputs) || !inputs.some(id => typeof id === 'string' && ids.has(id))) continue;
            const entry = element('article'); entry.append(anchor(view.label, '#/views/' + encodeURIComponent(id) + '?' + new URLSearchParams({ origin: 'lens', layer: context.layer })));
            if (view.description) entry.append(element('p', view.description)); entries.append(entry);
        }
        container.append(entries); if (curated.inventory !== false) container.append(inventory(context)); if (curated.distributions === true) container.append(distributions(context)); if (curated.findings !== false) container.append(findings(context)); return;
    }
    const columns = element('div', '', 'two-column home-overview'); columns.append(inventory(context), distributions(context)); container.append(columns, findings(context));
    const changes = section('최근 변화 집중도'); container.append(changes); await recent(changes, context);
}
