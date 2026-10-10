import type { Node as GraphNode, Facet, Finding, Source, Snapshot } from '../dist/core/model.js';
import { renderExplore } from './explore.js';
import { humanValue } from './views-records.js';
import { renderViews } from './views.js';
import { renderList } from './list.js';
import { renderHome } from './home.js';
import { renderChanges } from './changes.js';
import { renderNodeHistory } from './node-history.js';
import { valueKey } from './list-model.js';
import { pager } from './explore-controls.js';
import { parseGraph, parsePresentation, parseSnapshots, type BrowserGraph, type Presentation } from './data.js';
function required<T extends Element>(value: T | null): T { if (!value) throw new Error('Required viewer element is missing'); return value; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
const main = required(document.querySelector<HTMLElement>('#main'));
const theme = required(document.querySelector<HTMLSelectElement>('#theme'));
required(document.querySelector('.skip')).addEventListener('click', event => { event.preventDefault(); main.focus(); });
const media = matchMedia('(prefers-color-scheme: dark)');
let preference = 'system';
try { preference = localStorage.getItem('lattice-theme') || 'system'; } catch { /* Storage is optional on static hosts. */ }
if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
theme.value = preference;
function applyTheme() { document.documentElement.dataset['theme'] = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference; }
theme.addEventListener('change', () => { preference = theme.value; applyTheme(); try { localStorage.setItem('lattice-theme', preference); } catch { /* Keep the selected theme for this visit. */ } });
media.addEventListener('change', applyTheme);
applyTheme();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: unknown, className?: string) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
}
function link(text: unknown, href: string, className?: string) { const a = el('a', text, className); a.href = href; return a; }
function button(text: unknown, action: () => void) { const b = el('button', text); b.type = 'button'; b.addEventListener('click', action); return b; }
function display(value: unknown): string { return typeof value === 'string' ? value : JSON.stringify(value) ?? ''; }
function external(url: string | undefined) { try { const parsed = new URL(url ?? ''); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; } }
function nodeHref(id: string) { return '#/node/' + encodeURIComponent(id); }
function listHref(params: Record<string, string> = {}) { const query = new URLSearchParams({ ...(activeLayer ? { layer: activeLayer } : {}), ...params }); return '#/list' + (query.size ? '?' + query : ''); }
function section(title: string, className = 'panel section') { const box = el('section', undefined, className); box.append(el('h2', title)); return box; }
function empty(text: string) { return el('p', text, 'empty'); }
function sources(items: readonly Source[]) {
    const list = el('ul', undefined, 'sources');
    const unique = new Map(items.map(source => [source.path + ':' + source.line + source.pointer, source]));
    for (const source of unique.values()) {
        const row = el('li');
        const label = source.path + ':' + source.line + (source.endLine && source.endLine !== source.line ? '–' + source.endLine : '');
        const href = external(source.url);
        row.append(href ? link(label, href) : el('span', label));
        if (!href) row.append(el('span', ' · 로컬 출처', 'muted'));
        if (source.pointer) row.append(el('code', ' ' + source.pointer));
        list.append(row);
    }
    return list;
}
let graph: BrowserGraph;
let presentation: Presentation;
let nodes: Map<string, GraphNode>;
let visibleNodes: GraphNode[];
let facets: Map<string, Facet[]>;
let kinds: Presentation["kinds"];
let allVisibleNodes: GraphNode[];
let activeLayer = '';
let snapshots: Snapshot[] = [];
let renderVersion = 0;
let disposeScreen: (() => void) | undefined;
const snapshotGraphs = new Map<string, BrowserGraph>();
const layerOf = (node: GraphNode) => String(node.attributes['layer'] ?? '');
const layerLabel = (layer: string) => (Array.isArray(presentation.layers) ? presentation.layers.find(item => item.id === layer)?.label : presentation.layers?.[layer]?.label) || layer || '층 미지정';
function routeHref(path: string, params: Record<string, string> = {}) { const query = new URLSearchParams({ ...(activeLayer ? { layer: activeLayer } : {}), ...params }); return '#' + path + (query.size ? '?' + query : ''); }
function layerControl() {
    const layers = [...new Set(allVisibleNodes.map(layerOf))];
    if (layers.length < 2 && !layers[0]) return;
    const bar = el('div', undefined, 'filters layer-filter');
    const control = selectControl('데이터 층', 'layer', layers.map(value => [value, layerLabel(value)]), activeLayer);
    required(control.querySelector('select')).addEventListener('change', event => {
        if (!(event.target instanceof HTMLSelectElement)) return;
        const [path = '/home', search = ''] = (location.hash.slice(1) || '/home').split('?'); const params = new URLSearchParams(search);
        params.set('layer', event.target.value); params.delete('page');
        location.hash = '#' + (path.startsWith('/node/') ? '/home' : path) + '?' + params;
    });
    bar.append(control, el('span', '각 층의 노드와 발견을 따로 셉니다. 대응 링크는 동일 구현을 뜻하지 않습니다.', 'meta')); main.append(bar);
}
function layerFindings(data = graph, layer = activeLayer) {
    const ids = new Set(data.nodes.filter(node => layerOf(node) === layer).map(node => node.id));
    return data.findings.filter(finding => finding.targetIds.length ? finding.targetIds.some(id => ids.has(id)) : (!layer || finding.metrics?.['layer'] === layer));
}
const kindLabel = (kind: string) => kinds.find(item => item.id === kind)?.label || kind;
const facetLabel = (key: string) => presentation.facets?.[key]?.label || key;
const valueLabel = (key: string, value: unknown) => presentation.facets?.[key]?.values?.[display(value)] || display(value);

function pageHeading(title: string, description?: string) {
    const head = el('header', undefined, 'page-head');
    const h1 = el('h1', title); h1.tabIndex = -1; head.append(h1);
    if (description) head.append(el('p', description, 'muted'));
    const provenance = el('div', undefined, 'provenance');
    provenance.append(el('span', graph.repository.name));
    provenance.append(el('code', graph.repository.commit ? graph.repository.commit.slice(0, 12) : '커밋 정보 없음'));
    provenance.append(el('span', graph.repository.dirty ? '작업 트리 변경 포함' : '기록된 소스 스냅샷'));
    const hash = el('span', '그래프 ' + graph.hash.slice(0, 12)); hash.title = graph.hash; provenance.append(hash);
    provenance.append(el('span', document.querySelector('meta[name="lattice-generation"]') ? '로컬 지도 · 파일 변경 시 자동 갱신' : '정적 내보내기 · 이후 변경은 재빌드 필요'));
    head.append(provenance); main.append(head); layerControl();
}
function findingView(finding: Finding, compact = false) {
    const article = el('article', undefined, 'finding');
    const head = el('div', undefined, 'finding-head');
    const severity = { error: '오류', warning: '주의', info: '정보' }[finding.severity] || finding.severity;
    head.append(el('span', severity, 'badge severity-' + finding.severity));
    head.append(el('code', finding.ruleId));
    const basis = { computed: '계산 결과', 'authored-interpretation': '렌즈 작성자의 해석', 'source-support': '정적 소스 근거' }[finding.basis] || finding.basis;
    head.append(el('span', basis, 'meta'));
    article.append(head, el('p', finding.message));
    if (finding.intent) article.append(el('p', '의도: ' + finding.intent));
    if (finding.implementation) article.append(el('p', '구현: ' + finding.implementation));
    if (finding.gate) article.append(el('p', '관문 ' + ({ pass: '통과', fail: '실패', unknown: '미확인' }[finding.gate.status]) + ' · ' + finding.gate.metric + ' ' + finding.gate.comparator + ' ' + finding.gate.threshold, 'gate-' + finding.gate.status));
    if (Object.keys(finding.metrics).length) {
        const metrics = el('pre', JSON.stringify(finding.metrics, null, 2));
        if (compact) { const disclosure = el('details'); disclosure.append(el('summary', '계산 지표 ' + Object.keys(finding.metrics).length + '개'), metrics); article.append(disclosure); }
        else article.append(metrics);
    }
    if (finding.targetIds.length) {
        const detail = el('details'); detail.append(el('summary', '관련 노드 ' + finding.targetIds.length + '개'));
        const targets = el('ul', undefined, 'neighbors');
        for (const id of finding.targetIds) { const item = el('li'); item.append(link(nodes.get(id)?.name || id, nodeHref(id))); targets.append(item); }
        detail.append(targets); article.append(detail);
    }
    if (finding.sources.length) {
        const detail = el('details'); detail.append(el('summary', '출처 ' + finding.sources.length + '개'), sources(finding.sources)); article.append(detail);
    }
    return article;
}
function home(version: number) {
    void renderHome(main, {
        graph, nodes: visibleNodes, findings: layerFindings(), kinds, presentation, layer: activeLayer,
        snapshots, readSnapshot, isCurrent: () => version === renderVersion,
        heading: pageHeading, kindLabel, facetLabel, valueLabel, sources, findingView: finding => findingView(finding, true), nodeHref, listHref,
        changesHref: (base, head) => routeHref('/changes', { base, head }),
    });
}
function selectControl(label: string, name: string, values: readonly (readonly string[])[], selected: string) {
    const wrapper = el('label', label); const select = el('select'); select.name = name;
    for (const [value, title] of values) { const option = el('option', title); option.value = value ?? ''; option.selected = selected === value; select.append(option); }
    wrapper.append(select); return wrapper;
}
function listing(params: URLSearchParams) {
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    renderList(main, {
        nodes: visibleNodes, facets: graph.facets.filter(facet => visibleIds.has(facet.nodeId)), kinds, params,
        kindLabel, facetLabel, valueLabel, sources, nodeHref, href: listHref, heading: pageHeading
    });
}
function detail(id: string, version: number) {
    const node = nodes.get(id);
    main.append(link('← 목록으로', listHref(), 'breadcrumb'));
    if (!node) { pageHeading('노드를 찾을 수 없습니다', id); main.append(empty('ID가 변경되었거나 현재 내보내기에 없는 노드입니다. 목록에서 다시 검색하세요.')); return; }
    pageHeading(node.name, kindLabel(node.kind) + (layerOf(node) ? ' · ' + layerLabel(layerOf(node)) : '')); main.append(el('code', node.id, 'detail-id'));
    const actions = el('div', undefined, 'actions'); const status = el('span', '', 'meta'); status.setAttribute('role', 'status');
    actions.append(link('이웃 탐색', routeHref('/explore', { from: id, mode: 'neighbors', hops: '1', direction: 'both' })), button('링크 복사', async () => { try { await navigator.clipboard.writeText(location.href); status.textContent = '링크를 복사했습니다.'; } catch { status.textContent = '주소 표시줄의 URL을 복사하세요.'; } }), status); main.append(actions);
    const human = presentation.detail;
    if (human) {
        const context = { nodes: graph.nodes, nodeHref };
        const summary = section('요약');
        for (const field of human.summaryFields) { let value: unknown = { ...node.attributes, facet: Object.fromEntries((facets.get(id) ?? []).map(facet => [facet.key, facet.value])) }; for (const part of field.path) value = value !== null && typeof value === 'object' ? Reflect.get(value, part) : undefined; if (value === undefined || value === null || value === '') continue; const row = el('div', undefined, 'record-field'); row.append(el('strong', field.label), humanValue(value, context)); summary.append(row); }
        main.append(summary);
        for (const relation of human.relationships) {
            const matches = graph.edges.filter(edge => relation.edgeKinds.includes(edge.kind) && ((relation.direction !== 'incoming' && edge.source === id) || (relation.direction !== 'outgoing' && edge.target === id)));
            if (!matches.length) continue; const block = section(relation.label); const list = el('ul', undefined, 'neighbors');
            for (const edge of matches) { const target = edge.source === id ? edge.target : edge.source, row = el('li'); row.append(link(nodes.get(target)?.name ?? target, nodeHref(target))); const text = edge.attributes?.['label']; if (text && text !== edge.kind) row.append(el('p', text)); list.append(row); }
            block.append(list); main.append(block);
        }
    }
    const chips = el('div', undefined, 'facet-list'); for (const facet of facets.get(id) || []) chips.append(link(facetLabel(facet.key) + ': ' + valueLabel(facet.key, facet.value), listHref({ facet: facet.key, value: valueKey(facet.value), valueType: 'json' }), 'badge')); if (!human) main.append(chips);
    const provenance = section('원본 출처'); provenance.append(sources(node.sources)); main.append(provenance);
    const attributes = section('속성'); const values = el('dl', undefined, 'attributes');
    for (const [key, value] of Object.entries(node.attributes)) { const row = el('div', undefined, 'attribute'); row.append(el('dt', key)); const dd = el('dd'); dd.append(typeof value === 'object' && value !== null ? el('pre', JSON.stringify(value, null, 2)) : el('span', display(value))); row.append(dd); values.append(row); }
    attributes.append(values); if (!Object.keys(node.attributes).length) attributes.append(empty('기록된 속성이 없습니다.')); if (human?.rawAttributes === 'collapsed') { const raw = el('details', undefined, 'section'); raw.append(el('summary', '원시 속성 및 분류'), chips, attributes); main.append(raw); } else main.append(attributes);
    const related = graph.findings.filter(finding => finding.targetIds.includes(id));
    const findings = section('관련 발견', 'panel section detail-findings'); for (const finding of related) findings.append(findingView(finding, true)); if (!related.length) findings.append(empty('이 노드를 대상으로 한 발견은 없습니다.')); main.append(findings);
    const edges = graph.edges.filter(edge => edge.source === id || edge.target === id);
    for (const [label, matches] of [
        ['나가는 연결', edges.filter(edge => edge.directed && edge.source === id)],
        ['들어오는 연결', edges.filter(edge => edge.directed && edge.target === id)],
        ['방향 없는 연결', edges.filter(edge => !edge.directed)],
    ] as const) {
        const neighbors = section(label + ' · ' + matches.length); const area = el('div'); neighbors.append(area);
        const draw = (page: number, focus = false) => {
            area.replaceChildren(); const list = el('ul', undefined, 'neighbors');
            for (const edge of matches.slice(page * 20, (page + 1) * 20)) {
                const target = edge.source === id ? edge.target : edge.source; const row = el('li');
                row.append(el('span', String(edge.attributes?.['label'] || edge.kind || edge.field) + ' · '), link(nodes.get(target)?.name || target, nodeHref(target)));
                const neighbor = nodes.get(target); if (neighbor && layerOf(neighbor) !== layerOf(node)) row.append(el('span', ' · ' + layerLabel(layerOf(neighbor)), 'badge'));
                const evidence = el('details'); evidence.append(el('summary', '연결 출처'), sources(edge.sources)); row.append(evidence); list.append(row);
            }
            area.append(list); if (!matches.length) area.append(empty('이 방향의 연결은 없습니다.'));
            if (matches.length > 20) pager(area, { total: matches.length, page, size: 20, change: next => draw(next, true) });
            if (focus) { list.tabIndex = -1; list.focus(); }
        };
        draw(0); main.append(neighbors);
    }
    void renderNodeHistory(main, { node, snapshots, readSnapshot, isCurrent: () => version === renderVersion, sources, changesHref: (base, head, identity) => routeHref('/changes', { base, head, node: identity }) });
}
function views(id: string, params: URLSearchParams) {
    const visibleIds = new Set(visibleNodes.map(node => node.id));
    disposeScreen = renderViews(main, {
        views: graph.views, nodes: visibleNodes, allNodes: graph.nodes, allEdges: graph.edges, layerLabel,
        edges: graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
        id, params, heading: pageHeading, kindLabel, nodeHref, sources,
        href: (viewId, values) => routeHref('/views/' + encodeURIComponent(viewId), values),
    });
}
async function readSnapshot(snapshot: Snapshot): Promise<BrowserGraph> {
    const cached = snapshotGraphs.get(snapshot.id); if (cached) return cached;
    const response = await fetch('./' + snapshot.artifactPath); if (!response.ok) throw new Error('스냅샷 HTTP ' + response.status);
    const data = parseGraph(await response.json()); if (data.schemaVersion !== 1 || data.hash !== snapshot.graphHash || !Array.isArray(data.nodes) || !Array.isArray(data.findings)) throw new Error('스냅샷의 형식 또는 해시가 일치하지 않습니다.');
    snapshotGraphs.set(snapshot.id, data); return data;
}
function changes(params: URLSearchParams, version: number) {
    void renderChanges(main, {
        nodes: visibleNodes, kinds, layer: activeLayer, snapshots, params, readSnapshot,
        isCurrent: () => version === renderVersion, heading: pageHeading, kindLabel, facetLabel,
        valueLabel, nodeHref, sources, href: values => routeHref('/changes', values),
    });
}

function render() {
    const version = ++renderVersion;
    disposeScreen?.(); disposeScreen = undefined;
    main.replaceChildren();
    const [path = '/home', search = ''] = (location.hash.slice(1) || '/home').split('?');
    const params = new URLSearchParams(search);
    const layers = [...new Set(allVisibleNodes.map(layerOf))];
    let node;
    if (path.startsWith('/node/')) { try { node = nodes.get(decodeURIComponent(path.slice(6))); } catch { } }
    activeLayer = node ? layerOf(node) : params.has('layer') ? (params.get('layer') || '') : layers.includes(presentation.defaultLayer || '') ? presentation.defaultLayer || '' : layers[0] || '';
    visibleNodes = allVisibleNodes.filter(node => layerOf(node) === activeLayer);
    const route = path === '/explore' ? 'explore' : path.startsWith('/views') ? 'views' : path.startsWith('/changes') ? 'changes' : path === '/home' ? 'home' : 'list';
    document.querySelectorAll<HTMLAnchorElement>('[data-route]').forEach(item => { item.href = routeHref('/' + item.dataset['route']); if (item.dataset['route'] === route) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    if (path === '/home') home(version); else if (path === '/explore') { pageHeading('관계 탐색', '종류와 분류로 좁히고, 방향 경로와 이웃을 따라 출처까지 탐색합니다.'); const visibleIds = new Set(visibleNodes.map(node => node.id)); disposeScreen = renderExplore(main, { nodes: visibleNodes, edges: graph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)), facets: graph.facets.filter(facet => visibleIds.has(facet.nodeId)), params, kindLabel, facetLabel, valueLabel, nodeHref, href: values => routeHref('/explore', values) }); } else if (path === '/list') listing(params); else if (path.startsWith('/views')) views(path.slice(7), params); else if (path.startsWith('/changes')) changes(params, version); else if (path.startsWith('/node/')) { try { detail(decodeURIComponent(path.slice(6)), version); } catch { pageHeading('잘못된 노드 주소'); main.append(link('목록으로 돌아가기', listHref())); } } else { pageHeading('화면을 찾을 수 없습니다'); main.append(link('홈으로 돌아가기', routeHref('/home'))); }
    document.title = `${main.querySelector('h1')?.textContent || '지도'} · Lattice`;
    main.querySelector('h1')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
}
async function load() {
    try {
        const generation = document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content;
        const suffix = generation ? '?generation=' + encodeURIComponent(generation) : '';
        const [graphResponse, presentationResponse] = await Promise.all([fetch('./graph.json' + suffix), fetch('./presentation.json' + suffix)]);
        if (!graphResponse.ok) throw new Error('graph.json HTTP ' + graphResponse.status);
        graph = parseGraph(await graphResponse.json()); presentation = parsePresentation(presentationResponse.ok ? await presentationResponse.json() : {});
        if (graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.facets) || !Array.isArray(graph.findings) || !Array.isArray(graph.edges) || !graph.repository || typeof graph.hash !== 'string') throw new Error('지원하지 않거나 불완전한 그래프 형식입니다.');
        nodes = new Map(graph.nodes.map(node => [node.id, node])); facets = new Map();
        for (const facet of graph.facets) { if (!facets.has(facet.nodeId)) facets.set(facet.nodeId, []); facets.get(facet.nodeId)?.push(facet); }
        kinds = [...(Array.isArray(presentation.kinds) ? presentation.kinds : [])]; for (const kind of new Set(graph.nodes.map(node => node.kind))) if (!kinds.some(item => item.id === kind)) kinds.push({ id: kind, label: kind });
        allVisibleNodes = graph.nodes.filter(node => !kinds.find(kind => kind.id === node.kind)?.hidden);
        try { const response = await fetch('./snapshots.json'); if (response.ok) { snapshots = parseSnapshots(await response.json()); } } catch { /* History is optional. */ }
        render(); addEventListener('hashchange', render);
    } catch (error) { main.replaceChildren(); main.append(el('h1', '지도를 불러오지 못했습니다'), el('p', errorMessage(error), 'muted'), el('p', '내보내기에 graph.json이 포함되어 있는지 확인하세요. 파일을 직접 열었다면 HTTP 정적 서버를 사용하세요.'), button('다시 시도', () => location.reload())); }
}
load();
