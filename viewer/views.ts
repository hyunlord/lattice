import { automaticViews, distributionFields, normalizeView } from './views-model.js';
import type { ViewsContext } from './views-shared.js';
import { renderRecords } from './views-records.js';
import { element, anchor } from './explore-controls.js';
import { renderMatrix } from './views-matrix.js';
import { renderDistribution, renderTable, renderCycle } from './views-data.js';
export type { ViewsContext } from './views-shared.js';
export function renderViews(container: HTMLElement, context: ViewsContext): () => void {
    const automatic = automaticViews(context.nodes, context.edges, context.params.get('field') ?? '@kind');
    const options = [...automatic.map(view => ({ view, origin: 'auto' })), ...context.views.filter(view => normalizeView(view, context.nodes, context.edges).coverage.selected > 0).map(view => ({ view, origin: 'lens' }))];
    let id: string; try { id = decodeURIComponent(context.id); } catch { id = context.id; }
    const origin = context.params.get('origin');
    const selected = id ? options.find(option => option.view.id === id && (origin ? option.origin === origin : option.origin === 'lens')) ?? (!origin ? options.find(option => option.view.id === id) : undefined) : options[0];
    context.heading(selected?.view.label ?? '보기', selected?.view.description ?? '행렬·분포·순환·표에서 현재 층의 입력과 연결을 확인합니다.');
    const controls = element('div', '', 'filters view-controls'); const label = element('label', '보기'); const selector = element('select'); selector.name = 'view'; if (!selected) { const missing = element('option', '보기를 선택하세요'); missing.value = ''; missing.disabled = true; missing.selected = true; selector.append(missing); }
    for (const [index, option] of options.entries()) { const entry = element('option', `${option.origin === 'auto' ? '자동' : '렌즈'} · ${option.view.label}`); entry.value = String(index); entry.selected = option === selected; selector.append(entry); }
    selector.onchange = () => { const option = options[Number(selector.value)]; if (option) location.hash = context.href(option.view.id, { origin: option.origin }); }; label.append(selector); controls.append(label); container.append(controls);
    if (!selected) {
        container.append(element('p', '현재 층에 이 보기의 입력이 없습니다. 다른 층에서 열거나 위 목록을 선택하세요.', 'empty'));
        const missing = context.views.find(view => view.id === id), ids = missing?.query['nodeIds'];
        if (Array.isArray(ids)) for (const layer of [...new Set((context.allNodes ?? context.nodes).filter(node => ids.includes(node.id)).map(node => String(node.attributes['layer'] ?? '')))]) container.append(anchor(context.layerLabel?.(layer) ?? layer, context.href(id, { origin: 'lens', layer })));
        return () => { };
    }
    const active = { ...context, id: selected.view.id, params: new URLSearchParams(context.params) }; active.params.set('origin', selected.origin);
    if (selected.origin === 'auto' && selected.view.type === 'distribution') { const fieldLabel = element('label', '분포 필드'); const field = element('select'); field.name = 'field'; for (const name of distributionFields(context.nodes)) { const option = element('option', name === '@kind' ? '종류' : name); option.value = name; field.append(option); } field.value = context.params.get('field') ?? '@kind'; field.onchange = () => { location.hash = context.href(selected.view.id, { origin: 'auto', field: field.value }); }; fieldLabel.append(field); controls.append(fieldLabel); }
    const projection = normalizeView(selected.view, context.nodes, context.edges); const scope = element('p', `입력 범위: 현재 층 ${projection.coverage.selected} / 전체 쿼리 ${projection.coverage.total}개 · 다른 층 또는 없는 입력 ${projection.coverage.excluded}개`, 'meta view-coverage'); container.append(scope);
    let cleanup = () => { };
    switch (projection.type) {
        case 'matrix': renderMatrix(container, active, selected.origin === 'auto' ? { ...projection, rows: projection.rows.map(axis => ({ ...axis, label: context.kindLabel(axis.label) })), columns: projection.columns.map(axis => ({ ...axis, label: context.kindLabel(axis.label) })) } : projection); break;
        case 'distribution': renderDistribution(container, active, selected.origin === 'auto' && (context.params.get('field') ?? '@kind') === '@kind' ? { ...projection, buckets: projection.buckets.map(bucket => ({ ...bucket, label: context.kindLabel(bucket.label) })) } : projection); break;
        case 'gallery': case 'status': renderRecords(container, active, projection); break;
        case 'graph': cleanup = renderCycle(container, active, projection); break;
        case 'table': renderTable(container, active, projection); break;
        case 'cycle': cleanup = renderCycle(container, active, projection); break;
        case 'unsupported': container.append(element('p', `보기 입력을 해석할 수 없습니다: ${projection.reason}`, 'empty')); break;
        default: { const exhaustive: never = projection; return exhaustive; }
    }
    const query = element('details', '', 'panel section'); query.append(element('summary', '보기 쿼리와 출처'), element('pre', JSON.stringify(selected.view.query, null, 2)), context.sources(selected.view.sources)); container.append(query); return cleanup;
}
