const main = document.querySelector('#main');
const theme = document.querySelector('#theme');
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); });
const media = matchMedia('(prefers-color-scheme: dark)');
let preference = 'system';
try { preference = localStorage.getItem('lattice-theme') || 'system'; } catch { /* Storage is optional on static hosts. */ }
if (!['system', 'light', 'dark'].includes(preference)) preference = 'system';
theme.value = preference;
function applyTheme() { document.documentElement.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference; }
theme.addEventListener('change', () => { preference = theme.value; applyTheme(); try { localStorage.setItem('lattice-theme', preference); } catch { /* Keep the selected theme for this visit. */ } });
media.addEventListener('change', applyTheme);
applyTheme();

function el(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
}
function link(text, href, className) { const a = el('a', text, className); a.href = href; return a; }
function button(text, action) { const b = el('button', text); b.type = 'button'; b.addEventListener('click', action); return b; }
function display(value) { return typeof value === 'string' ? value : JSON.stringify(value); }
function external(url) { try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : null; } catch { return null; } }
function nodeHref(id) { return '#/node/' + encodeURIComponent(id); }
function listHref(params = {}) { const query = new URLSearchParams({ ...(activeLayer ? { layer: activeLayer } : {}), ...params }); return '#/list' + (query.size ? '?' + query : ''); }
function section(title, className = 'panel section') { const box = el('section', undefined, className); box.append(el('h2', title)); return box; }
function empty(text) { return el('p', text, 'empty'); }
function sources(items) {
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
let graph;
let presentation;
let nodes;
let visibleNodes;
let facets;
let kinds;
let allVisibleNodes;
let activeLayer = '';
let snapshots = [];
let renderVersion = 0;
const snapshotGraphs = new Map();
const layerOf = node => String(node.attributes.layer ?? '');
const layerLabel = layer => (Array.isArray(presentation.layers) ? presentation.layers.find(item => item.id === layer)?.label : presentation.layers?.[layer]?.label) || layer || '층 미지정';
function routeHref(path, params = {}) { const query = new URLSearchParams({ ...(activeLayer ? { layer: activeLayer } : {}), ...params }); return '#' + path + (query.size ? '?' + query : ''); }
function layerControl() {
    const layers = [...new Set(allVisibleNodes.map(layerOf))];
    if (layers.length < 2 && !layers[0]) return;
    const bar = el('div', undefined, 'filters layer-filter');
    const control = selectControl('데이터 층', 'layer', layers.map(value => [value, layerLabel(value)]), activeLayer);
    control.querySelector('select').addEventListener('change', event => {
        const [path, search = ''] = (location.hash.slice(1) || '/home').split('?'); const params = new URLSearchParams(search);
        params.set('layer', event.target.value); params.delete('page');
        location.hash = '#' + (path.startsWith('/node/') ? '/home' : path) + '?' + params;
    });
    bar.append(control, el('span', '각 층의 노드와 발견을 따로 셉니다. 대응 링크는 동일 구현을 뜻하지 않습니다.', 'meta')); main.append(bar);
}
function layerFindings(data = graph, layer = activeLayer) {
    const ids = new Set(data.nodes.filter(node => layerOf(node) === layer).map(node => node.id));
    return data.findings.filter(finding => finding.targetIds.length ? finding.targetIds.some(id => ids.has(id)) : (!layer || finding.metrics?.layer === layer));
}
const kindLabel = kind => kinds.find(item => item.id === kind)?.label || kind;
const facetLabel = key => presentation.facets?.[key]?.label || key;
const valueLabel = (key, value) => presentation.facets?.[key]?.values?.[display(value)] || display(value);

function pageHeading(title, description) {
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
function findingView(finding) {
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
    if (Object.keys(finding.metrics).length) article.append(el('pre', JSON.stringify(finding.metrics, null, 2)));
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
function home() {
    pageHeading(presentation.name || graph.repository.name, presentation.description || '데이터를 분류하고 발견의 근거를 확인합니다.');
    const summary = el('div', undefined, 'summary');
    for (const [count, label] of [[visibleNodes.length, '노드'], [new Set(visibleNodes.map(node => node.kind)).size, '종류'], [layerFindings().length, '발견']]) { const item = el('span'); item.append(el('strong', count), document.createTextNode(label)); summary.append(item); }
    main.append(summary);
    const columns = el('div', undefined, 'two-column');
    const inventory = section('종류별 목록', 'panel');
    for (const kind of kinds.filter(kind => !kind.hidden)) {
        const count = visibleNodes.filter(node => node.kind === kind.id).length;
        if (!count) continue;
        const row = el('div', undefined, 'count-row'); row.append(link(kind.label || kind.id, listHref({ kind: kind.id })), el('strong', count)); inventory.append(row);
    }
    if (!visibleNodes.length) inventory.append(empty('추출된 노드가 없습니다. 빌드 입력을 확인하세요.'));
    columns.append(inventory);
    const distribution = section('분류 분포', 'panel');
    const facetKeys = [...new Set(visibleNodes.flatMap(node => (facets.get(node.id) || []).map(facet => facet.key)))];
    for (const key of facetKeys) {
        const block = el('div', undefined, 'distribution'); block.append(el('h3', facetLabel(key)));
        const counts = new Map();
        for (const node of visibleNodes) for (const facet of facets.get(node.id) || []) if (facet.key === key) { const value = display(facet.value); counts.set(value, (counts.get(value) || 0) + 1); }
        for (const [value, count] of counts) {
            const row = el('div', undefined, 'count-row'); row.append(link(presentation.facets?.[key]?.values?.[value] || value, listHref({ facet: key, value })), el('strong', count));
            const bar = el('div', undefined, 'bar'); bar.setAttribute('aria-hidden', 'true'); const fill = el('span'); fill.style.width = `${count / Math.max(visibleNodes.length, 1) * 100}%`; bar.append(fill); block.append(row, bar);
        }
        distribution.append(block);
    }
    if (!facetKeys.length) distribution.append(empty('이 내보내기에는 렌즈 분류가 없습니다.'));
    columns.append(distribution); main.append(columns);
    const findings = section('발견과 근거');
    if (!layerFindings().length) findings.append(empty('생성된 발견이 없습니다.'));
    for (const finding of layerFindings()) findings.append(findingView(finding));
    main.append(findings);
}
function selectControl(label, name, values, selected) {
    const wrapper = el('label', label); const select = el('select'); select.name = name;
    for (const [value, title] of values) { const option = el('option', title); option.value = value; option.selected = selected === value; select.append(option); }
    wrapper.append(select); return wrapper;
}
function listing(params) {
    pageHeading('노드 목록', '이름과 ID를 검색하고 종류·분류를 좁혀 보세요.');
    const form = el('form', undefined, 'filters'); form.setAttribute('role', 'search');
    const search = el('label', '검색', 'search'); const input = el('input'); input.type = 'search'; input.name = 'q'; input.value = params.get('q') || ''; input.placeholder = '이름, ID, 속성 검색'; search.append(input); form.append(search);
    form.append(selectControl('종류', 'kind', [['', '전체 종류'], ...kinds.filter(kind => !kind.hidden).map(kind => [kind.id, kind.label || kind.id])], params.get('kind') || ''));
    const keys = [...new Set(graph.facets.map(facet => facet.key))];
    form.append(selectControl('분류', 'facet', [['', '분류 없음'], ...keys.map(key => [key, facetLabel(key)])], params.get('facet') || ''));
    const key = params.get('facet');
    if (key) form.append(selectControl('분류 값', 'value', [['', '모든 값'], ...[...new Set(graph.facets.filter(facet => facet.key === key).map(facet => display(facet.value)))].map(value => [value, presentation.facets?.[key]?.values?.[value] || value])], params.get('value') || ''));
    form.append(selectControl('정렬', 'sort', [['name', '이름 오름차순'], ['name-desc', '이름 내림차순'], ['kind', '종류 오름차순'], ['id', 'ID 오름차순']], params.get('sort') || 'name'));
    const submit = el('button', '적용'); submit.type = 'submit'; form.append(submit, link('초기화', listHref()));
    const apply = () => { const query = new URLSearchParams(); for (const [name, value] of new FormData(form)) if (value) query.set(name, value); if (query.get('facet') !== params.get('facet')) query.delete('value'); location.hash = listHref(Object.fromEntries(query)); };
    form.addEventListener('submit', event => { event.preventDefault(); apply(); });
    form.addEventListener('change', event => { if (event.target.tagName === 'SELECT') apply(); }); main.append(form);
    const q = (params.get('q') || '').toLocaleLowerCase();
    const matching = visibleNodes.filter(node => (!params.get('kind') || node.kind === params.get('kind')) && (!q || (node.name + ' ' + node.id + ' ' + JSON.stringify(node.attributes)).toLocaleLowerCase().includes(q)) && (!key || (facets.get(node.id) || []).some(facet => facet.key === key && (!params.get('value') || display(facet.value) === params.get('value')))));
    const sort = params.get('sort') || 'name';
    matching.sort((a, b) => { const field = sort === 'kind' ? 'kind' : sort === 'id' ? 'id' : 'name'; const order = String(a[field]).localeCompare(String(b[field]), 'ko') || a.id.localeCompare(b.id); return sort === 'name-desc' ? -order : order; });
    const size = 40; const pages = Math.max(1, Math.ceil(matching.length / size)); const page = Math.min(pages, Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1));
    if (!matching.length) { main.append(empty('조건에 맞는 노드가 없습니다. 검색어나 필터를 바꿔 보세요.')); return; }
    const region = el('div', undefined, 'table-region'); region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', '검색 결과 표');
    const table = el('table'); table.append(el('caption', `${matching.length}개 중 ${(page - 1) * size + 1}–${Math.min(page * size, matching.length)}개`));
    const configuredColumns = kinds.filter(kind => !kind.hidden && (!params.get('kind') || kind.id === params.get('kind'))).flatMap(kind => kind.columns || []);
    const columns = [...new Set(configuredColumns)].filter(field => !['id', 'name', 'kind'].includes(field));
    if (!columns.length) {
        const prevalence = new Map();
        for (const node of matching) for (const [field, value] of Object.entries(node.attributes)) if (!['id', 'name', 'kind'].includes(field) && value !== null && typeof value !== 'object' && String(value).length <= 100) prevalence.set(field, (prevalence.get(field) || 0) + 1);
        columns.push(...[...prevalence].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2).map(([field]) => field));
    }
    const head = el('thead'); const header = el('tr'); for (const title of ['이름 / ID', '종류', ...columns, '분류', '출처']) { const th = el('th', title); th.scope = 'col'; header.append(th); } head.append(header); table.append(head);
    const body = el('tbody');
    for (const node of matching.slice((page - 1) * size, page * size)) {
        const row = el('tr'); const name = el('td', undefined, 'node-name'); name.append(link(node.name, nodeHref(node.id)), el('code', node.id, 'node-id'));
        const classification = el('td'); for (const facet of facets.get(node.id) || []) classification.append(el('div', facetLabel(facet.key) + ': ' + valueLabel(facet.key, facet.value), 'meta'));
        const source = el('td'); source.append(sources(node.sources)); row.append(name, el('td', kindLabel(node.kind)));
        for (const field of columns) { const value = node.attributes[field]; const cell = el('td'); if (typeof value === 'object' && value !== null) { const detail = el('details'); detail.append(el('summary', field), el('pre', JSON.stringify(value, null, 2))); cell.append(detail); } else cell.textContent = value === undefined ? '—' : display(value); row.append(cell); }
        row.append(classification, source); body.append(row);
    }
    table.append(body); region.append(table); main.append(region);
    const pagination = el('div', undefined, 'pagination'); pagination.append(el('span', `${page} / ${pages} 페이지`, 'meta')); const controls = el('div');
    for (const [label, next] of [['이전', page - 1], ['다음', page + 1]]) { const b = button(label, () => { const nextParams = new URLSearchParams(params); nextParams.set('page', next); location.hash = listHref(Object.fromEntries(nextParams)); }); b.disabled = next < 1 || next > pages; controls.append(b); }
    pagination.append(controls); main.append(pagination);
}
function detail(id) {
    const node = nodes.get(id);
    main.append(link('← 목록으로', listHref(), 'breadcrumb'));
    if (!node) { pageHeading('노드를 찾을 수 없습니다', id); main.append(empty('ID가 변경되었거나 현재 내보내기에 없는 노드입니다. 목록에서 다시 검색하세요.')); return; }
    pageHeading(node.name, kindLabel(node.kind) + (layerOf(node) ? ' · ' + layerLabel(layerOf(node)) : '')); main.append(el('code', node.id, 'detail-id'));
    const actions = el('div', undefined, 'actions'); const status = el('span', '', 'meta'); status.setAttribute('role', 'status');
    actions.append(button('링크 복사', async () => { try { await navigator.clipboard.writeText(location.href); status.textContent = '링크를 복사했습니다.'; } catch { status.textContent = '주소 표시줄의 URL을 복사하세요.'; } }), status); main.append(actions);
    const chips = el('div', undefined, 'facet-list'); for (const facet of facets.get(id) || []) chips.append(link(facetLabel(facet.key) + ': ' + valueLabel(facet.key, facet.value), listHref({ facet: facet.key, value: display(facet.value) }), 'badge')); main.append(chips);
    const provenance = section('원본 출처'); provenance.append(sources(node.sources)); main.append(provenance);
    const attributes = section('속성'); const values = el('dl', undefined, 'attributes');
    for (const [key, value] of Object.entries(node.attributes)) { const row = el('div', undefined, 'attribute'); row.append(el('dt', key)); const dd = el('dd'); dd.append(typeof value === 'object' && value !== null ? el('pre', JSON.stringify(value, null, 2)) : el('span', display(value))); row.append(dd); values.append(row); }
    attributes.append(values); if (!Object.keys(node.attributes).length) attributes.append(empty('기록된 속성이 없습니다.')); main.append(attributes);
    const related = graph.findings.filter(finding => finding.targetIds.includes(id));
    const findings = section('관련 발견'); for (const finding of related) findings.append(findingView(finding)); if (!related.length) findings.append(empty('이 노드를 대상으로 한 발견은 없습니다.')); main.append(findings);
    const edges = graph.edges.filter(edge => edge.source === id || edge.target === id); if (edges.length) { const neighbors = section('연결된 노드'); const list = el('ul', undefined, 'neighbors'); for (const edge of edges) { const target = edge.source === id ? edge.target : edge.source; const row = el('li'); row.append(el('span', (edge.source === id ? '→ ' : '← ') + (edge.attributes?.label || edge.kind || edge.field) + ' · '), link(nodes.get(target)?.name || target, nodeHref(target))); if (nodes.has(target) && layerOf(nodes.get(target)) !== layerOf(node)) row.append(el('span', ' · ' + layerLabel(layerOf(nodes.get(target))), 'badge')); list.append(row); } neighbors.append(list); main.append(neighbors); }
}
function matrix(id, params) {
    const views = (graph.views || []).filter(view => view.type === 'matrix');
    let decoded; try { decoded = decodeURIComponent(id); } catch { decoded = ''; }
    const view = views.find(view => view.id === decoded) || (!id ? views[0] : undefined);
    pageHeading(view?.label || '영향 행렬', view?.description || '행에서 열로 향하는 연결을 확인합니다.');
    if (!view) { main.append(empty(id ? '요청한 행렬이 없습니다. 다른 보기를 선택하세요.' : '이 그래프에는 행렬 보기가 없습니다.')); if (id) main.append(link('행렬 목록', routeHref('/views'))); return; }
    const controls = el('div', undefined, 'filters');
    const selector = selectControl('보기', 'view', views.map(item => [item.id, item.label]), view.id);
    selector.querySelector('select').addEventListener('change', event => { location.hash = routeHref('/views/' + encodeURIComponent(event.target.value)); }); controls.append(selector); main.append(controls);
    const query = view.query || {};
    const directed = Array.isArray(query.rows) && Array.isArray(query.columns);
    const allowed = id => nodes.has(id) && layerOf(nodes.get(id)) === activeLayer;
    const cells = (Array.isArray(query.cells) ? query.cells : []).map(cell => directed ? cell : { ...cell, nodeIds: (cell.nodeIds || []).filter(allowed), count: (cell.nodeIds || []).filter(allowed).length }).filter(cell => directed || cell.count > 0);
    const rows = directed ? query.rows.filter(allowed) : [...new Set(cells.map(cell => display(cell.row)))];
    const columns = directed ? query.columns.filter(allowed) : [...new Set(cells.map(cell => display(cell.column)))];
    if (!rows.length || !columns.length) { main.append(empty('선택한 층에는 이 행렬의 입력 노드가 없습니다. 데이터 층을 바꿔 보세요.')); return; }
    const table = el('table', undefined, 'matrix'); table.append(el('caption', `${rows.length}행 × ${columns.length}열 · ${directed ? '행 → 열 방향. 숫자는 연결 수이며 선택하면 근거가 표시됩니다.' : '숫자는 해당 분류의 노드 수입니다.'}`));
    const head = el('thead'); const header = el('tr'); const corner = el('th', '출발 ↓ / 도착 →'); corner.scope = 'col'; header.append(corner);
    for (const column of columns) { const th = el('th'); th.scope = 'col'; th.append(directed ? link(nodes.get(column)?.name || column, nodeHref(column)) : el('span', column)); header.append(th); } head.append(header); table.append(head);
    const body = el('tbody');
    for (const row of rows) {
        const tr = el('tr'); const title = el('th'); title.scope = 'row'; title.append(directed ? link(nodes.get(row)?.name || row, nodeHref(row)) : el('span', row)); tr.append(title);
        for (const column of columns) {
            const matches = cells.filter(cell => directed ? cell.source === row && cell.target === column : display(cell.row) === row && display(cell.column) === column);
            const td = el('td'); const count = matches.reduce((sum, cell) => sum + (directed ? cell.edgeIds?.length || 1 : cell.count || 0), 0);
            if (count) { const queryParams = { row, column }; const cellLink = link(String(count), routeHref('/views/' + encodeURIComponent(view.id), queryParams), 'matrix-cell'); cellLink.setAttribute('aria-label', `${directed ? nodes.get(row)?.name : row} → ${directed ? nodes.get(column)?.name : column}: ${count}`); td.append(cellLink); } else { td.textContent = '—'; td.className = 'muted'; } tr.append(td);
        } body.append(tr);
    }
    table.append(body); const region = el('div', undefined, 'table-region'); region.tabIndex = 0; region.setAttribute('role', 'region'); region.setAttribute('aria-label', '영향 행렬, 가로로 스크롤할 수 있습니다'); region.append(table); main.append(el('p', '표를 가로로 스크롤해 도착 노드를 확인하세요. 숫자를 선택하면 연결의 근거가 나타납니다.', 'meta'), region);
    const row = params.get('row'), column = params.get('column');
    if (row && column) {
        const detail = section('선택한 연결');
        const selected = cells.filter(cell => directed ? cell.source === row && cell.target === column : display(cell.row) === row && display(cell.column) === column);
        if (!selected.length) detail.append(empty('이 칸에는 연결이 없습니다.'));
        for (const cell of selected) {
            if (directed) {
                detail.append(link(nodes.get(row)?.name || row, nodeHref(row)), el('span', ' → '), link(nodes.get(column)?.name || column, nodeHref(column)), el('p', display(cell.label ?? '')));
                for (const edgeId of cell.edgeIds || []) { const edge = graph.edges.find(edge => edge.id === edgeId); if (edge) { detail.append(el('p', edge.attributes?.label || edge.kind), sources(edge.sources)); } }
            } else { const list = el('ul', undefined, 'neighbors'); for (const nodeId of cell.nodeIds || []) { const li = el('li'); li.append(link(nodes.get(nodeId)?.name || nodeId, nodeHref(nodeId))); list.append(li); } detail.append(list); }
        } main.append(detail);
    }
    if (view.sources?.length) { const provenance = el('details', undefined, 'panel section'); provenance.append(el('summary', '행렬 출처'), sources(view.sources)); main.append(provenance); }
}
function semantic(value, record = true) {
    if (Array.isArray(value)) return value.map(item => semantic(item, false));
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => !record || !['sources', 'contentHash'].includes(key)).map(key => [key, semantic(value[key], false)]));
    return value;
}
function compareRecords(before, after, key = 'id') {
    const left = new Map(before.map(item => [item[key], item])); const right = new Map(after.map(item => [item[key], item]));
    return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap(id => {
        const previous = left.get(id), current = right.get(id);
        if (previous && current && JSON.stringify(semantic(previous)) === JSON.stringify(semantic(current))) return [];
        return [{ id, previous, current, status: !previous ? '추가' : !current ? '삭제' : '변경' }];
    });
}
async function readSnapshot(snapshot) {
    if (snapshotGraphs.has(snapshot.id)) return snapshotGraphs.get(snapshot.id);
    const response = await fetch('./' + snapshot.artifactPath); if (!response.ok) throw new Error('스냅샷 HTTP ' + response.status);
    const data = await response.json(); if (data.schemaVersion !== 1 || data.hash !== snapshot.graphHash || !Array.isArray(data.nodes) || !Array.isArray(data.findings)) throw new Error('스냅샷의 형식 또는 해시가 일치하지 않습니다.');
    snapshotGraphs.set(snapshot.id, data); return data;
}
async function changes(params, version) {
    pageHeading('스냅샷 변화', '기록된 두 시점의 노드 속성과 발견을 비교합니다. 출처 위치만 달라진 경우는 내용 변경에 포함하지 않습니다.');
    if (snapshots.length < 2) { main.append(empty('비교할 스냅샷이 두 개 이상 필요합니다. Git 이력을 비교한 뒤 다시 내보내세요.')); return; }
    const baseId = params.get('base') || snapshots[0].id, headId = params.get('head') || snapshots.at(-1).id;
    const base = snapshots.find(item => item.id === baseId), head = snapshots.find(item => item.id === headId);
    const choices = snapshots.map(item => [item.id, `${item.commit?.slice(0, 12) || '커밋 없음'} · ${item.graphHash.slice(0, 8)}`]);
    const form = el('form', undefined, 'filters'); form.append(selectControl('이전', 'base', choices, baseId), selectControl('이후', 'head', choices, headId));
    const submit = el('button', '비교'); submit.type = 'submit'; form.append(submit); form.addEventListener('submit', event => { event.preventDefault(); location.hash = routeHref('/changes', Object.fromEntries(new FormData(form))); }); main.append(form);
    if (!base || !head) { main.append(empty('이 주소의 스냅샷이 내보내기에 없습니다. 이전·이후를 다시 선택하세요.')); return; }
    const loading = el('p', '스냅샷을 불러오고 있습니다…', 'muted'); loading.setAttribute('role', 'status'); main.append(loading);
    const layer = activeLayer;
    try {
        const [before, after] = await Promise.all([readSnapshot(base), readSnapshot(head)]); if (version !== renderVersion) return; loading.remove();
        const beforeNodes = before.nodes.filter(node => layerOf(node) === layer && !kinds.find(kind => kind.id === node.kind)?.hidden), afterNodes = after.nodes.filter(node => layerOf(node) === layer && !kinds.find(kind => kind.id === node.kind)?.hidden);
        const nodeChanges = compareRecords(beforeNodes, afterNodes), findingChanges = compareRecords(layerFindings(before, layer), layerFindings(after, layer), 'ruleId');
        const beforeIds = new Set(beforeNodes.map(node => node.id)), afterIds = new Set(afterNodes.map(node => node.id));
        const edgeChanges = compareRecords((before.edges || []).filter(edge => beforeIds.has(edge.source) || beforeIds.has(edge.target)), (after.edges || []).filter(edge => afterIds.has(edge.source) || afterIds.has(edge.target)));
        const facetChanges = compareRecords((before.facets || []).filter(facet => beforeIds.has(facet.nodeId)), (after.facets || []).filter(facet => afterIds.has(facet.nodeId)));
        const historicNodes = new Map([...before.nodes, ...after.nodes].map(node => [node.id, node]));
        const counts = section('층별 개수 변화');
        for (const kind of [...new Set([...beforeNodes, ...afterNodes].map(node => node.kind))].sort()) { const row = el('div', undefined, 'count-row'); row.append(el('span', kindLabel(kind)), el('code', `${beforeNodes.filter(node => node.kind === kind).length} → ${afterNodes.filter(node => node.kind === kind).length}`)); counts.append(row); } main.append(counts);
        for (const [title, records] of [['발견 변화', findingChanges], ['노드 변화', nodeChanges], ['연결 변화', edgeChanges], ['분류 변화', facetChanges]]) {
            const box = section(title + ' · ' + records.length); if (!records.length) box.append(empty('내용 변화가 없습니다.'));
            for (const record of records) {
                const value = record.current || record.previous;
                const label = title === '연결 변화' ? `${historicNodes.get(value.source)?.name || value.source} → ${historicNodes.get(value.target)?.name || value.target} · ${value.attributes?.label || value.kind}` : title === '분류 변화' ? `${historicNodes.get(value.nodeId)?.name || value.nodeId} · ${facetLabel(value.key)}: ${valueLabel(value.key, value.value)}` : value.name || record.id;
                const disclosure = el('details', undefined, 'change-record'); disclosure.append(el('summary', `${record.status} · ${label}`));
                if (title === '노드 변화' && nodes.has(record.id)) disclosure.append(link('현재 노드 보기', nodeHref(record.id)));
                const pair = el('div', undefined, 'two-column');
                for (const [label, value] of [['이전', record.previous], ['이후', record.current]]) { const column = el('div'); column.append(el('h3', label), value ? el('pre', JSON.stringify(semantic(value), null, 2)) : el('p', '없음', 'muted')); pair.append(column); } disclosure.append(pair); box.append(disclosure);
            } main.append(box);
        }
    } catch (error) { if (version !== renderVersion) return; loading.remove(); main.append(empty('비교를 불러오지 못했습니다: ' + error.message), button('다시 시도', render)); }
}

function render() {
    const version = ++renderVersion;
    main.replaceChildren();
    const [path, search = ''] = (location.hash.slice(1) || '/home').split('?');
    const params = new URLSearchParams(search);
    const layers = [...new Set(allVisibleNodes.map(layerOf))];
    let node;
    if (path.startsWith('/node/')) { try { node = nodes.get(decodeURIComponent(path.slice(6))); } catch {} }
    activeLayer = node ? layerOf(node) : params.has('layer') ? params.get('layer') : layers.includes(presentation.defaultLayer) ? presentation.defaultLayer : layers[0] || '';
    visibleNodes = allVisibleNodes.filter(node => layerOf(node) === activeLayer);
    const route = path.startsWith('/views') ? 'views' : path.startsWith('/changes') ? 'changes' : path === '/home' ? 'home' : 'list';
    document.querySelectorAll('[data-route]').forEach(item => { item.href = routeHref('/' + item.dataset.route); if (item.dataset.route === route) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
    if (path === '/home') home(); else if (path === '/list') listing(params); else if (path.startsWith('/views')) matrix(path.slice(7), params); else if (path.startsWith('/changes')) changes(params, version); else if (path.startsWith('/node/')) { try { detail(decodeURIComponent(path.slice(6))); } catch { pageHeading('잘못된 노드 주소'); main.append(link('목록으로 돌아가기', listHref())); } } else { pageHeading('화면을 찾을 수 없습니다'); main.append(link('홈으로 돌아가기', routeHref('/home'))); }
    document.title = `${main.querySelector('h1')?.textContent || '지도'} · Lattice`;
    main.querySelector('h1')?.focus({ preventScroll: true });
}
async function load() {
    try {
        const generation = document.querySelector('meta[name="lattice-generation"]')?.content;
        const suffix = generation ? '?generation=' + encodeURIComponent(generation) : '';
        const [graphResponse, presentationResponse] = await Promise.all([fetch('./graph.json' + suffix), fetch('./presentation.json' + suffix)]);
        if (!graphResponse.ok) throw new Error('graph.json HTTP ' + graphResponse.status);
        graph = await graphResponse.json(); presentation = presentationResponse.ok ? await presentationResponse.json() : {};
        if (graph.schemaVersion !== 1 || !Array.isArray(graph.nodes) || !Array.isArray(graph.facets) || !Array.isArray(graph.findings) || !Array.isArray(graph.edges) || !graph.repository || typeof graph.hash !== 'string') throw new Error('지원하지 않거나 불완전한 그래프 형식입니다.');
        nodes = new Map(graph.nodes.map(node => [node.id, node])); facets = new Map();
        for (const facet of graph.facets) { if (!facets.has(facet.nodeId)) facets.set(facet.nodeId, []); facets.get(facet.nodeId).push(facet); }
        kinds = [...(Array.isArray(presentation.kinds) ? presentation.kinds : [])]; for (const kind of new Set(graph.nodes.map(node => node.kind))) if (!kinds.some(item => item.id === kind)) kinds.push({ id: kind, label: kind });
        allVisibleNodes = graph.nodes.filter(node => !kinds.find(kind => kind.id === node.kind)?.hidden);
        try { const response = await fetch('./snapshots.json'); if (response.ok) { const data = await response.json(); if (Array.isArray(data)) snapshots = data.filter(item => /^[a-f0-9]{64}$/.test(item.id) && item.artifactPath === `snapshots/${item.id}.json`); } } catch { /* History is optional. */ }
        render(); addEventListener('hashchange', render);
    } catch (error) { main.replaceChildren(); main.append(el('h1', '지도를 불러오지 못했습니다'), el('p', error.message, 'muted'), el('p', '내보내기에 graph.json이 포함되어 있는지 확인하세요. 파일을 직접 열었다면 HTTP 정적 서버를 사용하세요.'), button('다시 시도', () => location.reload())); }
}
load();
