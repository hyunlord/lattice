import type { Node, Facet, Source } from '../dist/core/model.js';
import type { Presentation } from './data.js';
import { element, anchor } from './explore-controls.js';
import { projectList, valueKey } from './list-model.js';
export type ListContext = {
    readonly nodes: readonly Node[]; readonly facets: readonly Facet[]; readonly kinds: Presentation['kinds']; readonly params: URLSearchParams;
    readonly kindLabel: (kind: string) => string; readonly facetLabel: (key: string) => string; readonly valueLabel: (key: string, value: unknown) => string;
    readonly sources: (sources: readonly Source[]) => HTMLElement; readonly nodeHref: (id: string) => string;
    readonly href: (params: Record<string, string>) => string; readonly heading: (title: string, description: string) => void;
};
export function listRoute(context: ListContext, changes: Record<string, string>): string { return context.href({ ...Object.fromEntries(context.params), ...changes }); }
function select(form: HTMLElement, name: string, label: string): HTMLSelectElement { const wrap = element('label', label); const input = element('select'); input.name = name; wrap.append(input); form.append(wrap); return input; }
function options(input: HTMLSelectElement, choices: readonly (readonly [string, string])[], selected: string): void {
    input.replaceChildren(); for (const [value, label] of choices) { const option = element('option', label); option.value = value; input.append(option); }
    if (selected && !choices.some(([value]) => value === selected)) { const unknown = element('option', `${selected} (현재 범위에 없음)`); unknown.value = selected; input.append(unknown); }
    input.value = selected;
}
export function listControls(container: HTMLElement, context: ListContext): void {
    const { params } = context; const form = element('form', '', 'list-filters'); form.setAttribute('role', 'search');
    const basic = element('div', '', 'filters list-basic'); form.append(basic);
    const advanced = element('details', '', 'list-advanced'); advanced.open = matchMedia('(min-width: 640px)').matches || Boolean(params.get('facet') || params.get('field') || params.get('sort') && params.get('sort') !== 'name' || params.get('dir') === 'desc');
    advanced.append(element('summary', '분류·속성·정렬')); const fields = element('div', '', 'filters list-advanced-fields'); advanced.append(fields); form.append(advanced);
    const search = element('label', '검색', 'search'); const input = element('input'); input.type = 'search'; input.name = 'q'; input.value = params.get('q') ?? ''; input.placeholder = '이름, ID, 태그, 속성 검색'; search.append(input); basic.append(search);
    const kind = select(basic, 'kind', '종류'); options(kind, [['', '전체 종류'], ...[...new Set(context.nodes.map(node => node.kind))].sort().map(key => [key, context.kindLabel(key)] satisfies [string, string])], params.get('kind') ?? '');
    const facet = select(fields, 'facet', '분류'); options(facet, [['', '분류 없음'], ...[...new Set(context.facets.map(item => item.key))].sort().map(key => [key, context.facetLabel(key)] satisfies [string, string])], params.get('facet') ?? '');
    const facetValue = select(fields, 'value', '분류 값'); const field = select(fields, 'field', '속성'); const fieldValue = select(fields, 'fieldValue', '속성 값');
    const legacyRaw = params.get('valueType') !== 'json' ? params.get('value') : null;
    const legacyKeys = [...new Set(context.facets.filter(item => item.key === params.get('facet') && (typeof item.value === 'string' ? item.value : JSON.stringify(item.value)) === legacyRaw).map(item => valueKey(item.value)))];
    const initialFacetValue = legacyRaw ? legacyKeys.length === 1 ? legacyKeys[0] ?? '' : '@legacy' : params.get('value') ?? '';
    const sort = select(fields, 'sort', '정렬 기준'); const direction = select(fields, 'dir', '정렬 방향'); options(direction, [['asc', '오름차순'], ['desc', '내림차순']], params.get('dir') ?? (params.get('sort') === 'name-desc' ? 'desc' : 'asc'));
    const formParams = () => { const result = new URLSearchParams(params); for (const [key, value] of new FormData(form)) if (typeof value === 'string') result.set(key, value); if (facetValue.value === '@legacy' && legacyRaw !== null) { result.set('value', legacyRaw); result.delete('valueType'); } else result.set('valueType', 'json'); result.delete('page'); return result; };
    const refresh = (initial = false) => {
        const state = initial ? params : formParams(); const projection = projectList(context.nodes, context.facets, context.kinds, state);
        options(field, [['', '속성 없음'], ...projection.fields.map(item => [item.id, item.label] satisfies [string, string])], state.get('field') ?? '');
        const selectedFacetValue = initial ? initialFacetValue : facetValue.value;
        const legacyOption: [string, string][] = selectedFacetValue === '@legacy' && legacyRaw !== null ? [['@legacy', `${legacyRaw} (기존 링크 · 모든 형식)`]] : [];
        options(facetValue, [['', '모든 값'], ...legacyOption, ...projection.facetValues.map(item => [item.key, item.label] satisfies [string, string])], selectedFacetValue); facetValue.disabled = !facet.value;
        options(fieldValue, [['', '모든 값'], ...projection.fieldValues.map(item => [item.key, item.label] satisfies [string, string])], state.get('fieldValue') ?? ''); fieldValue.disabled = !field.value;
        const columns = new Map([...projection.fields, ...projection.columns].map(item => [item.id, item.label]));
        options(sort, [['name', '이름'], ['id', 'ID'], ['kind', '종류'], ...[...columns].map(([key, label]) => [key, label] satisfies [string, string])], projection.sort);
    };
    refresh(true);
    facet.onchange = () => { facetValue.value = ''; refresh(); }; field.onchange = () => { fieldValue.value = ''; refresh(); }; kind.onchange = () => refresh();
    const submit = element('button', '적용'); submit.type = 'submit'; basic.append(submit, anchor('초기화', context.href({})));
    form.onsubmit = event => { event.preventDefault(); location.hash = context.href(Object.fromEntries(formParams())); }; container.append(form);
    const active = element('div', '', 'actions list-active-filters');
    for (const [key, label] of [['q', '검색'], ['kind', '종류'], ['facet', '분류'], ['field', '속성']] satisfies [string, string][]) {
        const value = params.get(key); if (!value) continue;
        const text = key === 'kind' ? context.kindLabel(value) : key === 'facet' ? `${context.facetLabel(value)}${params.get('value') ? ` = ${params.get('value')}` : ''}` : key === 'field' ? `${value}${params.get('fieldValue') ? ` = ${params.get('fieldValue')}` : ''}` : value;
        const changes: Record<string, string> = { [key]: '', page: '' }; if (key === 'facet') { changes['value'] = ''; changes['valueType'] = ''; } if (key === 'field') changes['fieldValue'] = '';
        active.append(anchor(`${label}: ${text} · 해제`, listRoute(context, changes)));
    }
    if (active.childElementCount) { active.setAttribute('aria-label', '적용한 필터'); container.append(active); }
}
