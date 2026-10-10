import type { PictureMap, PictureNode } from './picture-map-model.js';
import { anchor, element } from './explore-controls.js';

export type PictureMapContext = { readonly kindLabel: (kind: string) => string; readonly nodeHref: (id: string) => string; };
const shapes = ['●', '■', '◆', '▲', '⬟', '✚', '⬠', '◎', '○', '□', '△', '◈'] as const;
const svgNamespace = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] { return document.createElementNS(svgNamespace, tag); }

export function renderPictureMap(container: HTMLElement, model: PictureMap, context: PictureMapContext): () => void {
    const root = element('section', '', 'picture-map'); root.setAttribute('aria-label', '저장소 그림 지도');
    const kinds = [...new Set(model.hubs.flatMap(hub => hub.nodes.map(node => node.kind)))].sort();
    const kindIndex = (kind: string): number => kinds.indexOf(kind) % shapes.length;
    const legend = element('div', '', 'picture-legend');
    const usedStatuses = new Set(model.hubs.flatMap(hub => hub.nodes.map(node => node.status)));
    for (const status of ['present', 'absent', 'unknown'] as const) {
        if (!usedStatuses.has(status)) continue;
        const item = element('span', '', `picture-legend-status picture-status-${status}`);
        item.append(element('i', status === 'present' ? '●' : status === 'absent' ? '○' : '?'), document.createTextNode(model.statusLabels[status])); legend.append(item);
    }
    legend.append(element('span', '→ 영향'));
    const kindLegend = element('details', '', 'picture-kind-legend'); kindLegend.append(element('summary', '종류'));
    const kindList = element('div');
    for (const kind of kinds) { const item = element('span', '', `picture-kind-${kindIndex(kind)}`); item.append(element('i', shapes[kindIndex(kind)]), document.createTextNode(context.kindLabel(kind))); kindList.append(item); }
    kindLegend.append(kindList); legend.append(kindLegend); root.append(legend);
    const desktop = matchMedia('(min-width: 1024px)'); const updateLegend = (): void => { kindLegend.open = desktop.matches; }; updateLegend(); desktop.addEventListener('change', updateLegend);
    const stage = element('div', '', 'picture-stage'); const grid = element('div', '', 'picture-islands');
    const arrows = svg('svg'); arrows.classList.add('picture-arrows'); arrows.setAttribute('aria-label', '영역 사이의 영향');
    const defs = svg('defs'); const marker = svg('marker'); const markerId = `picture-arrow-${crypto.randomUUID()}`;
    marker.id = markerId; marker.setAttribute('viewBox', '0 0 10 10'); marker.setAttribute('refX', '9'); marker.setAttribute('refY', '5'); marker.setAttribute('markerWidth', '6'); marker.setAttribute('markerHeight', '6'); marker.setAttribute('orient', 'auto');
    const arrowhead = svg('path'); arrowhead.setAttribute('d', 'M 1 1 L 9 5 L 1 9'); arrowhead.setAttribute('fill', 'none'); arrowhead.setAttribute('stroke', 'context-stroke'); arrowhead.setAttribute('stroke-width', '1.5'); marker.append(arrowhead); defs.append(marker); arrows.append(defs);
    stage.append(arrows, grid); root.append(stage); container.append(root);
    let card: HTMLElement | undefined; let activeButton: HTMLButtonElement | undefined;
    const closeCard = (restoreFocus = false): void => { card?.remove(); card = undefined; activeButton?.setAttribute('aria-expanded', 'false'); if (restoreFocus) activeButton?.focus(); activeButton = undefined; };
    const placeCard = (panel: HTMLElement, target: Element): void => {
        const bounds = stage.getBoundingClientRect(); const point = target.getBoundingClientRect();
        const width = Math.min(352, bounds.width - 16); panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(8, Math.min(point.left - bounds.left, bounds.width - width - 8))}px`;
        const below = point.bottom - bounds.top + 8; const height = panel.getBoundingClientRect().height;
        panel.style.top = `${below + height <= bounds.height ? below : Math.max(0, point.top - bounds.top - height - 8)}px`;
    };
    const showCard = (node: PictureNode, button: HTMLButtonElement): void => {
        const wasOpen = activeButton === button; closeCard(); tooltip.hidden = true; if (wasOpen) return;
        activeButton = button; button.setAttribute('aria-expanded', 'true');
        const panel = element('aside', '', 'picture-card'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', node.name);
        const heading = element('div', '', 'picture-card-heading'); const dismiss = element('button', '×'); dismiss.type = 'button'; dismiss.setAttribute('aria-label', '카드 닫기'); dismiss.onclick = () => closeCard(true); heading.append(element('h3', node.name), dismiss); panel.append(heading);
        if (node.summary) panel.append(element('p', node.summary));
        const status = element('p', model.statusLabels[node.status], `picture-card-status picture-status-${node.status}`); panel.append(status);
        if (node.relations.length) { const list = element('ul', '', 'picture-card-relations'); for (const relation of node.relations.slice(0, 5)) { const item = element('li'); if (relation.label) item.append(element('span', `${relation.label} · `)); item.append(anchor(relation.name, context.nodeHref(relation.id))); list.append(item); } panel.append(list); }
        if (node.memberships.length > 1) panel.append(element('p', `함께 속한 곳 · ${node.memberships.slice(1).map(hub => hub.name).join(' · ')}`, 'picture-memberships'));
        panel.append(anchor('자세히 ↗', context.nodeHref(node.id))); stage.append(panel); card = panel; placeCard(panel, button); dismiss.focus({ preventScroll: true });
    };
    const hubElements = new Map<string, HTMLElement>();
    for (const hub of model.hubs) {
        const island = element('section', '', 'picture-island'); island.dataset['hub'] = hub.id;
        const heading = element('h2', hub.name); island.append(heading);
        const cloud = element('div', '', 'picture-cloud'); cloud.setAttribute('aria-label', `${hub.name} 소속 콘텐츠`);
        for (const node of hub.nodes) {
            const button = element('button', '', `picture-point picture-kind-${kindIndex(node.kind)} picture-status-${node.status}`); button.type = 'button';
            button.dataset['node'] = node.id; button.setAttribute('aria-label', `${node.name} · ${context.kindLabel(node.kind)} · ${model.statusLabels[node.status]}`); button.title = `${node.name} · ${context.kindLabel(node.kind)}`; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-haspopup', 'dialog');
            const shape = element('span', shapes[kindIndex(node.kind)], 'picture-shape'); shape.setAttribute('aria-hidden', 'true'); button.append(shape); button.onclick = () => showCard(node, button); cloud.append(button);
        }
        if (!hub.nodes.length) cloud.append(element('span', '소속 콘텐츠 없음', 'picture-empty'));
        const present = hub.nodes.filter(node => node.status === 'present').length;
        const summary = element('p', '', 'picture-hub-summary');
        const unknown = hub.nodes.filter(node => node.status === 'unknown').length;
        if (hub.nodes.length && unknown === hub.nodes.length) summary.textContent = `소속 ${hub.nodes.length} · ${model.statusLabels.unknown}`;
        else if (hub.nodes.length) { const count = element('span', `● ${present}`, 'picture-present-count'); summary.append(count, document.createTextNode(` · 소속 ${hub.nodes.length}${unknown ? ` · ${model.statusLabels.unknown} ${unknown}` : ''}`)); summary.setAttribute('aria-label', `${model.statusLabels.present} ${present} · 소속 ${hub.nodes.length}${unknown ? ` · ${model.statusLabels.unknown} ${unknown}` : ''}`); } else summary.textContent = '화살표로 연결된 역할';
        const scrollHint = element('span', '↕', 'picture-cloud-scroll'); scrollHint.title = '소속 콘텐츠 스크롤'; scrollHint.setAttribute('aria-hidden', 'true'); scrollHint.hidden = true;
        island.append(cloud, summary, scrollHint); grid.append(island); hubElements.set(hub.id, island);
    }
    const tooltip = element('div', '', 'picture-edge-tooltip'); tooltip.hidden = true; tooltip.setAttribute('role', 'status'); stage.append(tooltip);
    const edgeLayer = svg('g'); arrows.append(edgeLayer);
    const redraw = (): void => {
        tooltip.hidden = true; edgeLayer.replaceChildren();
        for (const island of hubElements.values()) { const cloud = island.querySelector<HTMLElement>('.picture-cloud'); const hint = island.querySelector<HTMLElement>('.picture-cloud-scroll'); if (cloud && hint) { const overflow = cloud.scrollHeight > cloud.clientHeight; hint.hidden = !overflow; cloud.tabIndex = overflow ? 0 : -1; cloud.setAttribute('aria-label', `${island.querySelector('h2')?.textContent ?? ''} 소속 콘텐츠${overflow ? ' · 스크롤하여 모두 보기' : ''}`); } }
        const bounds = stage.getBoundingClientRect(); arrows.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
        for (const edge of model.edges) {
            const source = hubElements.get(edge.source); const target = hubElements.get(edge.target); if (!source || !target) continue;
            const a = source.getBoundingClientRect(); const b = target.getBoundingClientRect(); const ax = a.left + a.width / 2 - bounds.left; const ay = a.top + a.height / 2 - bounds.top; const bx = b.left + b.width / 2 - bounds.left; const by = b.top + b.height / 2 - bounds.top;
            const dx = bx - ax; const dy = by - ay;
            const scaleA = 1 / Math.max(Math.abs(dx) / (a.width / 2 + 5), Math.abs(dy) / (a.height / 2 + 5), 0.001);
            const scaleB = 1 / Math.max(Math.abs(dx) / (b.width / 2 + 5), Math.abs(dy) / (b.height / 2 + 5), 0.001);
            const x1 = ax + dx * scaleA; const y1 = ay + dy * scaleA; const x2 = bx - dx * scaleB; const y2 = by - dy * scaleB;
            const bend = Math.min(48, Math.hypot(dx, dy) / 5); const length = Math.hypot(dx, dy) || 1;
            const cx = (x1 + x2) / 2 - dy / length * bend; const cy = (y1 + y2) / 2 + dx / length * bend;
            const group = svg('g'); group.classList.add('picture-edge'); group.setAttribute('tabindex', '0'); group.setAttribute('role', 'button');
            const names = `${source.querySelector('h2')?.textContent ?? edge.source} → ${target.querySelector('h2')?.textContent ?? edge.target}`;
            const description = `${names} · ${edge.count}개 연결${edge.descriptions.length ? ` · ${edge.descriptions.join(' · ')}` : ''}`; group.setAttribute('aria-label', description);
            const path = svg('path'); const d = edge.source === edge.target ? `M ${ax} ${a.top - bounds.top} C ${ax - 48} ${a.top - bounds.top - 32}, ${ax + 48} ${a.top - bounds.top - 32}, ${ax + 16} ${a.top - bounds.top}` : `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
            path.setAttribute('d', d); path.setAttribute('stroke-width', String(Math.min(5, 1 + Math.log2(edge.count + 1)))); path.setAttribute('marker-end', `url(#${markerId})`);
            const hit = svg('path'); hit.setAttribute('d', d); hit.classList.add('picture-edge-hit'); group.append(path, hit);
            const show = (): void => { tooltip.textContent = description; tooltip.hidden = false; placeCard(tooltip, group); group.classList.add('is-active'); source.classList.add('is-connected'); target.classList.add('is-connected'); };
            const hide = (): void => { tooltip.hidden = true; group.classList.remove('is-active'); source.classList.remove('is-connected'); target.classList.remove('is-connected'); };
            group.addEventListener('pointerenter', show); group.addEventListener('pointerleave', hide); group.addEventListener('focus', show); group.addEventListener('blur', hide); group.addEventListener('click', show); group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } }); edgeLayer.append(group);
        }
        if (card && activeButton) placeCard(card, activeButton);
    };
    const observer = new ResizeObserver(redraw); observer.observe(grid);
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') { closeCard(true); tooltip.hidden = true; } }; root.addEventListener('keydown', onKey);
    redraw(); return () => { observer.disconnect(); desktop.removeEventListener('change', updateLegend); root.removeEventListener('keydown', onKey); closeCard(); };
}
