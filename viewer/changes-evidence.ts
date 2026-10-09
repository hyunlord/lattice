import type { Node as GraphNode, Edge, Facet, Finding } from '../dist/core/model.js';
import type { BrowserGraph } from './data.js';
import { element, anchor } from './explore-controls.js';
import { compareRecords, nodeIdentity, snapshotComparisons, type RecordChange } from './history-model.js';
import { findingTransitions } from './history-projections.js';
import { changeSection, historyPages, type ChangesContext } from './changes-shared.js';
type EvidenceRecord = GraphNode | Edge | Facet | Finding;
const lifecycleLabels = { 'new-failure': '신규 실패 (통과 → 실패)', 'resolved-failure': '해소된 실패 (실패 → 통과)', 'failure-observed': '실패 관측 시작 (이전 판정 미확인)', 'failure-unobserved': '실패 관측 중단 (해소 여부 미확인)', added: '규칙 추가', removed: '규칙 제거 (해소 판정 아님)', changed: '규칙·발견 변경' } as const;
function affected(record: EvidenceRecord, identity: string, graph: BrowserGraph): boolean {
    const matches = (id: string) => { const node = graph.nodes.find(item => item.id === id); return node !== undefined && nodeIdentity(node) === identity; };
    if ('name' in record) return nodeIdentity(record) === identity;
    if ('source' in record) return matches(record.source) || matches(record.target);
    if ('nodeId' in record) return matches(record.nodeId);
    return record.targetIds.some(matches);
}
function recordLabel(record: EvidenceRecord, graph: BrowserGraph, context: ChangesContext): string {
    const name = (id: string) => graph.nodes.find(node => node.id === id)?.name || id;
    if ('name' in record) return record.name;
    if ('source' in record) return `${name(record.source)} → ${name(record.target)} · ${record.attributes?.['label'] ?? record.kind}`;
    if ('nodeId' in record) return `${name(record.nodeId)} · ${context.facetLabel(record.key)}: ${context.valueLabel(record.key, record.value)}`;
    return `${record.ruleId} · ${record.message}`;
}
function evidence(record: EvidenceRecord | undefined, label: string, context: ChangesContext): HTMLElement {
    const result = element('div'); result.append(element('h3', label));
    if (!record) { result.append(element('p', '기록 없음', 'muted')); return result; }
    if ('gate' in record || 'ruleId' in record && 'targetIds' in record) {
        const gate = record.gate; result.append(element('p', gate ? `관문 ${gate.status} · ${gate.metric} ${gate.comparator} ${gate.threshold}` : '관문 없음 (발견만 표시)', 'meta'));
    }
    result.append(context.sources(record.sources));
    const raw = element('details'); raw.append(element('summary', '원본 레코드 JSON'), element('pre', JSON.stringify(record, null, 2))); result.append(raw); return result;
}
function disclosure(change: RecordChange<EvidenceRecord>, before: BrowserGraph, after: BrowserGraph, context: ChangesContext, status = change.status): HTMLElement {
    const record = change.current ?? change.previous; const result = element('details', '', 'change-record');
    if (!record) return result;
    result.append(element('summary', `${status} · ${recordLabel(record, change.current ? after : before, context)}`));
    if ('name' in record) {
        const identity = nodeIdentity(record); const current = context.nodes.find(node => nodeIdentity(node) === identity);
        if (current) result.append(anchor('현재 노드 보기', context.nodeHref(current.id)));
        else result.append(element('p', '현재 지도에 대응하는 노드가 없습니다.', 'meta'));
    }
    const pair = element('div', '', 'two-column'); pair.append(evidence(change.previous, '이전', context), evidence(change.current, '이후', context)); result.append(pair); return result;
}
export function renderEvidence(container: HTMLElement, before: BrowserGraph, after: BrowserGraph, context: ChangesContext): void {
    const hidden = new Set(context.kinds.filter(kind => kind.hidden).map(kind => kind.id));
    const select = (graph: BrowserGraph) => graph.nodes.filter(node => String(node.attributes['layer'] ?? '') === context.layer && !hidden.has(node.kind));
    const beforeNodes = select(before), afterNodes = select(after);
    const left = snapshotComparisons(before, beforeNodes, context.layer), right = snapshotComparisons(after, afterNodes, context.layer);
    const focus = context.params.get('node');
    const focused = (change: RecordChange<EvidenceRecord>) => !focus || (change.previous && affected(change.previous, focus, before)) || (change.current && affected(change.current, focus, after));
    const counts = changeSection('층별 개수 변화');
    const kinds = [...new Set([...beforeNodes, ...afterNodes].map(node => node.kind))].sort();
    historyPages(counts, kinds, kind => { const row = element('div', '', 'count-row'); row.append(element('span', context.kindLabel(kind)), element('code', `${beforeNodes.filter(node => node.kind === kind).length} → ${afterNodes.filter(node => node.kind === kind).length}`)); return row; });
    if (!kinds.length) counts.append(element('p', '선택한 층에 노드가 없습니다.', 'empty')); container.append(counts);
    const transitions = findingTransitions(before, after, context.layer).filter(item => focused({ id: item.ruleId, previous: item.previous, current: item.current, status: item.status }));
    const findings = changeSection(`발견 변화 · ${transitions.length}`);
    findings.append(element('p', '신규·해소는 같은 규칙의 통과 ↔ 실패 전환만 뜻합니다. 규칙 제거, 관문 없음, unknown은 해소로 세지 않습니다.', 'meta'));
    historyPages(findings, transitions, item => disclosure({ id: item.ruleId, previous: item.previous, current: item.current, status: item.status }, before, after, context, lifecycleLabels[item.status]));
    if (!transitions.length) findings.append(element('p', '내용 변화가 없습니다.', 'empty')); container.append(findings);
    const collections: readonly (readonly [string, readonly RecordChange<EvidenceRecord>[]])[] = [
        ['노드 변화', compareRecords(left.nodes, right.nodes)], ['연결 변화', compareRecords(left.edges, right.edges)], ['분류 변화', compareRecords(left.facets, right.facets)],
    ];
    for (const [title, records] of collections) {
        const filtered = records.filter(focused); const section = changeSection(`${title} · ${filtered.length}`);
        historyPages(section, filtered, record => disclosure(record, before, after, context));
        if (!filtered.length) section.append(element('p', '내용 변화가 없습니다.', 'empty')); container.append(section);
    }
}
