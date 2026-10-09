import type { Node as GraphNode, Edge, Facet } from '../dist/core/model.js';
export type ExploreContext = {
    readonly nodes: readonly GraphNode[]; readonly edges: readonly Edge[]; readonly facets: readonly Facet[];
    readonly params: URLSearchParams; readonly kindLabel: (kind: string) => string; readonly facetLabel: (key: string) => string;
    readonly valueLabel: (key: string, value: unknown) => string; readonly nodeHref: (id: string) => string;
    readonly href: (params: Record<string, string>) => string;
};
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
    const result = document.createElement(tag); result.textContent = text; result.className = className; return result;
}
export function action(text: string, run: () => void): HTMLButtonElement { const result = element('button', text); result.type = 'button'; result.onclick = run; return result; }
export function anchor(text: string, href: string): HTMLAnchorElement { const result = element('a', text); result.href = href; return result; }
export function route(context: ExploreContext, changes: Record<string, string>): string { return context.href({ ...Object.fromEntries(context.params), ...changes }); }
export function pageNumber(raw: string | null, total: number, size: number): number { return Math.min(Math.max(0, Math.floor(Number(raw) || 0)), Math.max(0, Math.ceil(total / size) - 1)); }
export function pager(container: HTMLElement, options: { readonly total: number; readonly page: number; readonly size: number; readonly change: (page: number) => void; }): void {
    const bar = element('div', '', 'pagination'); const { total, page, size, change } = options;
    bar.append(element('span', total ? `${page * size + 1}–${Math.min(total, (page + 1) * size)} / ${total}` : '0 / 0', 'mono'));
    const buttons = element('div'); const previous = action('이전', () => change(page - 1)); previous.disabled = page === 0;
    const next = action('다음', () => change(page + 1)); next.disabled = (page + 1) * size >= total; buttons.append(previous, next); bar.append(buttons); container.append(bar);
}
function field(form: HTMLElement, name: string, label: string, value: string): HTMLInputElement {
    const wrap = element('label', label); const input = element('input'); input.name = name; input.value = value; wrap.append(input); form.append(wrap); return input;
}
function select(form: HTMLElement, name: string, label: string, options: readonly (readonly [string, string])[], value: string): HTMLSelectElement {
    const wrap = element('label', label); const input = element('select'); input.name = name;
    for (const [id, text] of options) { const option = element('option', text); option.value = id; input.append(option); }
    input.value = value; wrap.append(input); form.append(wrap); return input;
}
export function controls(container: HTMLElement, context: ExploreContext): void {
    const { params } = context; const form = element('form', '', 'filters explore-filters');
    select(form, 'kind', '종류', [['', '모든 종류'], ...[...new Set(context.nodes.map(node => node.kind))].sort().map(kind => [kind, context.kindLabel(kind)] satisfies [string, string])], params.get('kind') ?? '');
    select(form, 'edgeKind', '관계 종류', [['', '모든 관계'], ...[...new Set(context.edges.map(edge => edge.kind))].sort().map(kind => [kind, kind] satisfies [string, string])], params.get('edgeKind') ?? '');
    field(form, 'q', '노드 검색', params.get('q') ?? '');
    const facets = [...new Set(context.facets.map(facet => facet.key))].sort();
    const facet = select(form, 'facet', '분류', [['', '모든 분류'], ...facets.map(key => [key, context.facetLabel(key)] satisfies [string, string])], params.get('facet') ?? '');
    const values = select(form, 'value', '분류 값', [['', '모든 값']], '');
    const update = () => { values.replaceChildren(); const blank = element('option', '모든 값'); blank.value = ''; values.append(blank); const items = new Map(context.facets.filter(item => item.key === facet.value).map(item => [JSON.stringify(item.value), context.valueLabel(item.key, item.value)])); for (const [id, label] of items) { const option = element('option', label); option.value = id; values.append(option); } };
    update(); values.value = params.get('value') ?? ''; facet.onchange = update;
    select(form, 'group', '묶기', [['kind', '종류'], ['folder', '폴더']], params.get('group') === 'folder' ? 'folder' : 'kind');
    const submit = element('button', '필터 적용'); submit.type = 'submit'; form.append(submit, anchor('초기화', context.href({})));
    form.onsubmit = event => { event.preventDefault(); const changes: Record<string, string> = { expanded: '', groupPage: '', nodePage: '', edgePage: '', selected: '' }; for (const [key, value] of new FormData(form)) if (typeof value === 'string') changes[key] = value; location.hash = route(context, changes); };
    container.append(form);
    const details = element('details', '', 'panel section explore-query'); details.open = Boolean(params.get('mode')); details.append(element('summary', '경로 · 영향 범위'));
    const query = element('form', '', 'filters');
    field(query, 'from', '시작 노드 ID', params.get('from') ?? ''); field(query, 'to', '도착 노드 ID', params.get('to') ?? '');
    select(query, 'mode', '탐색', [['path', '최단 경로'], ['neighbors', '이웃 / 영향 범위']], params.get('mode') === 'neighbors' ? 'neighbors' : 'path');
    const hops = field(query, 'hops', '연결 단계', params.get('hops') ?? '1'); hops.type = 'number'; hops.min = '0'; hops.max = String(context.nodes.length); hops.step = '1';
    select(query, 'direction', '영향 방향', [['out', '나가는 연결'], ['in', '들어오는 연결'], ['both', '양방향']], params.get('direction') ?? 'out');
    const run = element('button', '탐색 실행'); run.type = 'submit'; query.append(run, anchor('탐색 해제', route(context, { mode: '', from: '', to: '', selected: '', expanded: '', nodePage: '', groupPage: '' })));
    query.onsubmit = event => { event.preventDefault(); const changes: Record<string, string> = { expanded: '', groupPage: '', nodePage: '', selected: '' }; for (const [key, value] of new FormData(query)) if (typeof value === 'string') changes[key] = value; location.hash = route(context, changes); }; details.append(query, element('p', '아래 노드의 시작·도착 버튼으로 ID를 선택할 수 있습니다. 경로는 방향을 따르며 현재 필터 안에서 계산합니다.', 'meta')); container.append(details);
}
