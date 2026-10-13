import type { FirstImpression, FirstImpressionComponent, FirstImpressionClaim } from '../dist/query/first-impression-types.js';
import type { FirstImpressionContext } from './first-impression.js';
import { element as el, anchor } from './explore-controls.js';
import { placeDiagramLabels } from './first-impression-diagram-labels.js';
import { representativePath } from './first-impression-path.js';
import { structureLayout } from './first-impression-diagram-layout.js';
const ns = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Readonly<Record<string, string>> = {}): SVGElementTagNameMap[K] {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
}
function externalSource(url: string | undefined): string | undefined {
    try { const parsed = new URL(url ?? ''); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined; }
    catch { return undefined; }
}
export function claimSources(claim: FirstImpressionClaim, context: FirstImpressionContext): HTMLElement {
    return context.sources(claim.citations.map(citation => ({ path: citation.path, line: citation.startLine, endLine: citation.endLine, pointer: '', contentHash: citation.contentHash, ...(citation.url ? { url: citation.url } : {}) })));
}
export function structureDiagram(model: FirstImpression, context: FirstImpressionContext): HTMLElement {
    const english = context.params.get('lang') === 'en', t = (ko: string, en: string) => english ? en : ko;
    const section = el('section', '', 'fi-structure');
    section.append(el('h2', t('구조도', 'Structure')));
    const legend = el('p', t('화살표: 쓰는 쪽 → 제공하는 쪽 · 굵기: 파일 수 · 점선: 대표 정적 호출', 'Arrows: consumer → provider · Width: importing files · Dashed: representative static calls'), 'fi-diagram-legend');
    section.append(legend);
    const canvas = el('div', '', 'fi-diagram'); section.append(canvas);
    let expanded = false;
    const allDependencies = [...model.dependencies].filter(edge => edge.source !== edge.target).sort((a, b) => b.importingFileCount - a.importingFileCount || b.declarationCount - a.declarationCount);
    let dependencies = allDependencies.slice(0, 6);
    const representative = representativePath(model.flows), flow = representative?.flow;
    const functions = new Map(flow?.nodes.map(node => [node.id, node]) ?? []);
    const calls = (representative?.edges ?? []).flatMap(edge => {
        const source = functions.get(edge.source)?.componentId, target = functions.get(edge.target)?.componentId;
        return source && target && source !== target ? [{ source, target, call: edge }] : [];
    }).filter((edge, index, all) => all.findIndex(other => other.source === edge.source && other.target === edge.target) === index);
    const draw = (width: number) => {
        canvas.replaceChildren();
        const layout = structureLayout(model.components.map(component => component.id), [...dependencies, ...calls.filter(call => !dependencies.some(edge => edge.source === call.source && edge.target === call.target))], width);
        canvas.style.height = layout.height + 'px';
        const maximumFiles = Math.max(1, ...dependencies.map(edge => edge.importingFileCount));
        const drawing = svg('svg', { viewBox: `0 0 ${width} ${layout.height}`, 'aria-hidden': 'true', class: 'fi-diagram-lines' });
        const defs = svg('defs');
        for (const [id, className] of [['dependency', 'fi-arrow'], ['call', 'fi-call-arrow']]) {
            const marker = svg('marker', { id: 'fi-' + id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
            marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: className ?? '' })); defs.append(marker);
        }
        drawing.append(defs);
        const labels: { element: SVGTextElement; points: readonly { readonly x: number; readonly y: number; }[]; }[] = [];
        for (const route of layout.routes) {
            const dependency = dependencies[route.edgeIndex], isCall = calls.some(call => call.source === route.source && call.target === route.target);
            const path = svg('polyline', { points: route.points.map(point => `${point.x},${point.y}`).join(' '), fill: 'none', class: isCall ? (dependency ? 'fi-dependency-line fi-call-line' : 'fi-call-line') : 'fi-dependency-line', 'stroke-width': String(dependency ? 1 + 4 * dependency.importingFileCount / maximumFiles : 3), 'marker-end': `url(#fi-${isCall ? 'call' : 'dependency'})`, 'data-source': route.source, 'data-target': route.target });
            const title = svg('title'); title.textContent = `${model.components.find(component => component.id === route.source)?.titleClaim?.text ?? model.components.find(component => component.id === route.source)?.title ?? route.source} → ${model.components.find(component => component.id === route.target)?.titleClaim?.text ?? model.components.find(component => component.id === route.target)?.title ?? route.target}` + (dependency ? t(` · 파일 ${dependency.importingFileCount} · 선언 ${dependency.declarationCount}`, ` · ${dependency.importingFileCount} files · ${dependency.declarationCount} declarations`) : t(' · 정적 호출', ' · static call')); path.append(title); drawing.append(path);
            if (dependency) { const label = svg('text', { class: 'fi-edge-count', 'text-anchor': 'middle' }); label.textContent = dependency.importingFileCount ? t(`파일 ${dependency.importingFileCount}`, `${dependency.importingFileCount} files`) : t(`선언 ${dependency.declarationCount}`, `${dependency.declarationCount} declarations`); drawing.append(label); labels.push({ element: label, points: route.points }); }
        }
        canvas.append(drawing);
        placeDiagramLabels(labels, layout.boxes, { width, height: layout.height });
        const components = new Map(model.components.map((component, index) => [component.id, { component, index }]));
        for (const box of layout.boxes) {
            const item = components.get(box.id); if (!item) continue;
            const card = componentBox(item.component, item.index);
            Object.assign(card.style, { left: box.x + 'px', top: box.y + 'px', width: box.width + 'px', height: box.height + 'px' }); canvas.append(card);
        }
    };
    const componentBox = (component: FirstImpressionComponent, index: number) => {
        const box = el('article', '', 'fi-diagram-box'); if (representative?.edges.some(edge => functions.get(edge.source)?.componentId === component.id || functions.get(edge.target)?.componentId === component.id)) box.classList.add('fi-flow-component'); box.setAttribute('data-component', component.id);
        const start = model.entrypoints.find(entry => entry.componentId === component.id && entry.category === 'executable') ?? model.entrypoints.find(entry => entry.componentId === component.id);
        if (start) box.append(el('span', start.category === 'executable' ? t('실행 시작', 'Executable start') : start.basis === 'ui-root' ? t('UI 시작 후보', 'UI root candidate') : t('공개 진입', 'Public entry'), 'fi-start-badge'));
        const title = el('h3'); const button = el('button', component.titleClaim?.text ?? component.title); button.type = 'button'; button.addEventListener('click', () => { const detail = document.getElementById('part-' + index); if (detail instanceof HTMLDetailsElement) { detail.open = true; detail.scrollIntoView({ block: 'start' }); detail.querySelector('summary')?.focus(); } }); title.append(button); box.append(title);
        const claim = component.claims?.[0];
        const role = el('p', claim?.text ?? (component.basis === 'public-names' ? t('포함: ', 'Contains: ') : '') + component.description, 'fi-diagram-role'); role.title = role.textContent ?? ''; box.append(role);
        const citations = el('div', '', 'fi-diagram-citations');
        for (const [label, item] of [[t('AI 이름 근거', 'AI name source'), component.titleClaim], [t('AI 역할 근거', 'AI role source'), claim]] as const) {
            const citation = item?.citations[0]; if (!citation) continue;
            const url = externalSource(citation.url);
            const source = url ? anchor(label, url) : el('span', label + ' · ' + citation.path + ':' + citation.startLine); source.title = citation.path + ':' + citation.startLine + '–' + citation.endLine; citations.append(source);
        }
        if (!claim && !component.titleClaim) { const source = component.sources[0]; if (source) { const url = externalSource(source.url); const link = url ? anchor(t('소스 근거', 'Source'), url) : el('span', source.path.split('/').at(-1) + ':' + source.line); link.title = source.path + ':' + source.line; citations.append(link); } }
        box.append(citations); return box;
    };
    draw(960);
    if (allDependencies.length > 6) { const expand = el('button', t(`전체 ${allDependencies.length}개 방향 펼치기`, `Show all ${allDependencies.length} directions`), 'fi-expand-directions'); expand.type = 'button'; expand.addEventListener('click', () => { expanded = !expanded; dependencies = expanded ? allDependencies : allDependencies.slice(0, 6); expand.textContent = expanded ? t('주요 6개만 보기', 'Show strongest 6') : t(`전체 ${allDependencies.length}개 방향 펼치기`, `Show all ${allDependencies.length} directions`); draw(canvas.clientWidth || 960); }); section.append(expand); }
    if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(entries => { const width = entries[0]?.contentRect.width; if (width && Math.abs(width - Number(canvas.getAttribute('data-width'))) > 1) { canvas.setAttribute('data-width', String(width)); draw(width); } }); observer.observe(canvas); }
    if (flow) {
        const caption = el('p', '', 'fi-diagram-flow'); caption.append(el('strong', t('대표 흐름 · ', 'Representative flow · ')));
        const chain = representative?.edges ?? [];
        const ids = [chain[0]?.source, ...chain.map(edge => edge.target)].filter((id): id is string => Boolean(id));
        caption.append(anchor(ids.map(id => functions.get(id)?.name ?? id).join(' → '), '#/flow/' + encodeURIComponent(flow.rootId) + (english ? '?lang=en' : '')));
        section.insertBefore(caption, canvas);
    }
    if (model.dependencies.length > dependencies.length) section.append(el('p', t(`주요 ${dependencies.length}개 방향 표시 · 전체 연결은 아래 근거에서 확인`, `${dependencies.length} strongest directions shown · full connections in the evidence below`), 'muted'));
    return section;
}
