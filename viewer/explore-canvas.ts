import { action, element } from './explore-controls.js';
export type CanvasNode = { readonly id: string; readonly label: string; readonly kind: string; readonly count: number; readonly cluster: boolean; readonly facet: string; readonly pinned: boolean; readonly facetValue: string; };
export type CanvasEdge = { readonly source: string; readonly target: string; readonly label: string; readonly directed: boolean; readonly count: number; };
const ns = 'http://www.w3.org/2000/svg';
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Readonly<Record<string, string>> = {}): SVGElementTagNameMap[K] { const result = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) result.setAttribute(key, value); return result; }
const shapes = ['원', '사각형', '마름모', '삼각형', '육각형', '십자', '오각형', '이중 원'] as const;
function glyph(index: number): SVGElement {
    if (index % 8 === 0 || index % 8 === 7) { const result = svg('g'); result.append(svg('circle', { r: '13' })); if (index % 8 === 7) result.append(svg('circle', { r: '8' })); return result; }
    const points = ['-12,-12 12,-12 12,12 -12,12', '0,-17 17,0 0,17 -17,0', '0,-16 15,13 -15,13', '-15,0 -8,-13 8,-13 15,0 8,13 -8,13', '-5,-15 5,-15 5,-5 15,-5 15,5 5,5 5,15 -5,15 -5,5 -15,5 -15,-5 -5,-5', '0,-16 15,-5 9,13 -9,13 -15,-5'];
    return svg('polygon', { points: points[(index % 8) - 1] ?? points[0] ?? '' });
}
function kindPattern(index: number): SVGPatternElement {
    const cycle = Math.floor(index / 8); const spacing = 5 + Math.floor(cycle / 4) * 2;
    const pattern = svg('pattern', { id: `explore-kind-${index}`, patternUnits: 'userSpaceOnUse', width: String(spacing), height: String(spacing), class: `kind-${index % 8}` });
    pattern.append(svg('rect', { width: String(spacing), height: String(spacing), fill: 'var(--kind-color)' }));
    if (cycle % 4 === 1) pattern.append(svg('path', { d: `M 0 ${spacing} L ${spacing} 0`, stroke: 'var(--text)', 'stroke-width': '1' }));
    else if (cycle % 4 === 2) pattern.append(svg('circle', { cx: String(spacing / 2), cy: String(spacing / 2), r: '1.2', fill: 'var(--text)' }));
    else if (cycle % 4 === 3) pattern.append(svg('path', { d: `M 0 0 L ${spacing} ${spacing} M 0 ${spacing} L ${spacing} 0`, stroke: 'var(--text)', 'stroke-width': '1' }));
    else pattern.append(svg('path', { d: `M 0 ${spacing / 2} H ${spacing}`, stroke: 'var(--text)', 'stroke-width': '1' }));
    return pattern;
}
export function canvas(container: HTMLElement, options: { readonly nodes: readonly CanvasNode[]; readonly edges: readonly CanvasEdge[]; readonly kinds: readonly string[]; readonly kindLabel: (kind: string) => string; readonly selected: string; readonly choose: (id: string) => void; }): () => void {
    const panel = element('section', '', 'panel section explore-map'); panel.append(element('h2', '관계 지도'));
    const toolbar = element('div', '', 'actions'); const status = element('span', '', 'meta'); status.setAttribute('aria-live', 'polite');
    let scale = 1; let x = 0; let y = 0; let width = 960; let height = 600;
    const drawing = svg('svg', { viewBox: '0 0 960 600', role: 'group', 'aria-label': '관계 지도. 노드는 Enter로 선택, 방향키로 이동, 더하기·빼기로 확대·축소.', tabindex: '0' });
    const viewport = svg('g');
    const update = () => { viewport.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`); status.textContent = `확대 ${Math.round(scale * 100)}% · 이동 ${x}, ${y}`; };
    const zoom = (factor: number) => { scale = Math.min(4, Math.max(0.25, scale * factor)); update(); };
    for (const [label, run] of [['확대', () => zoom(1.25)], ['축소', () => zoom(0.8)], ['왼쪽', () => { x -= 80; update(); }], ['오른쪽', () => { x += 80; update(); }], ['위', () => { y -= 80; update(); }], ['아래', () => { y += 80; update(); }], ['보기 초기화', () => { x = 0; y = 0; scale = 1; update(); }]] satisfies readonly (readonly [string, () => void])[]) toolbar.append(action(label, run));
    toolbar.append(status); panel.append(toolbar);
    drawing.onkeydown = event => { const moves: Record<string, readonly [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }; const move = moves[event.key]; if (move) { event.preventDefault(); x += move[0]; y += move[1]; update(); } else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); } else if (event.key === '-') { event.preventDefault(); zoom(0.8); } };
    const defs = svg('defs'); const marker = svg('marker', { id: 'explore-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' }); marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: 'var(--muted)' })); defs.append(marker); drawing.append(defs, viewport); const patternKinds = new Set([...options.nodes.map(node => options.kinds.indexOf(node.kind)), ...options.kinds.slice(0, 32).map((_kind, index) => index)]); for (const index of patternKinds) if (index >= 8) defs.append(kindPattern(index));
    const facetValues = [...new Set(options.nodes.map(node => node.facetValue).filter(Boolean))].sort();
    const draw = () => {
        width = Math.max(200, drawing.getBoundingClientRect().width); height = Math.max(320, drawing.getBoundingClientRect().height); drawing.setAttribute('viewBox', `0 0 ${width} ${height}`); viewport.replaceChildren();
        const positions = new Map<string, { x: number; y: number; }>(); const columns = Math.max(1, Math.min(options.nodes.length, Math.floor(width / 132))); const slot = width / columns;
        options.nodes.forEach((node, index) => positions.set(node.id, { x: slot / 2 + (index % columns) * slot, y: 45 + Math.floor(index / columns) * 110 }));
        const occupied = [...positions.values()].map(point => ({ x: point.x - slot / 2 + 8, y: point.y - 23, width: slot - 16, height: 84 }));
        const parallel = new Map<string, number>();
        for (const edge of options.edges.slice(0, 150)) {
            const source = positions.get(edge.source); const target = positions.get(edge.target); if (!source || !target) continue;
            const pair = JSON.stringify([edge.source, edge.target].sort()); const ordinal = parallel.get(pair) ?? 0; parallel.set(pair, ordinal + 1); const bend = ordinal * 24;
            const length = Math.hypot(target.x - source.x, target.y - source.y) || 1; const dx = (target.x - source.x) / length; const dy = (target.y - source.y) / length;
            const line = svg('path', { d: source === target ? `M ${source.x} ${source.y - 17} c 44 -42 48 42 17 0` : `M ${source.x + dx * 18} ${source.y + dy * 18} Q ${(source.x + target.x) / 2 - dy * bend} ${(source.y + target.y) / 2 + dx * bend} ${target.x - dx * 21} ${target.y - dy * 21}`, class: 'explore-edge', ...(edge.directed ? { 'marker-end': 'url(#explore-arrow)' } : {}) });
            const title = svg('title'); title.textContent = `${edge.source} ${edge.directed ? '→' : '↔'} ${edge.target}: ${edge.label} × ${edge.count}`; line.append(title); viewport.append(line);
            if (options.edges.length <= 30) {
                const label = svg('text', { class: 'explore-edge-label', 'text-anchor': 'middle' }); label.textContent = edge.label + (edge.count > 1 ? ` ×${edge.count}` : ''); viewport.append(label);
                const centerX = (source.x + target.x) / 2 - dy * bend / 2; const centerY = (source.y + target.y) / 2 + dx * bend / 2;
                let placed = false;
                for (const [offsetX, offsetY] of [[0, -30], [0, 80], [40, -30], [-40, -30], [0, -50], [0, 110]] satisfies readonly (readonly [number, number])[]) {
                    label.setAttribute('x', String(centerX + offsetX)); label.setAttribute('y', String(centerY + offsetY)); const measured = label.getBBox(); const box = { x: measured.x - 4, y: measured.y - 4, width: measured.width + 8, height: measured.height + 8 };
                    if (box.x < 0 || box.x + box.width > width || box.y < 0 || occupied.some(other => box.x < other.x + other.width && box.x + box.width > other.x && box.y < other.y + other.height && box.y + box.height > other.y)) continue;
                    occupied.push(box); placed = true; break;
                }
                if (!placed) label.remove();
            }
        }
        for (const node of options.nodes) {
            const point = positions.get(node.id); if (!point) continue; const kind = Math.max(0, options.kinds.indexOf(node.kind));
            const group = svg('g', { transform: `translate(${point.x} ${point.y})`, tabindex: '0', role: 'button', 'aria-label': `${node.label}${node.cluster ? ` · 그룹 ${node.count}개 펼치기` : ` · ${options.kindLabel(node.kind)} 선택`}${node.facet ? ` · ${node.facet}` : ''}`, 'aria-pressed': String(options.selected === node.id), class: `explore-vertex kind-${kind % 8}${node.facet ? ' has-facet' : ''}${node.cluster ? ' is-cluster' : ''}${node.pinned ? ' is-pinned' : ''}` });
            if (kind >= 8) group.style.setProperty('--kind-fill', `url(#explore-kind-${kind})`); const shape = glyph(kind); if (node.facetValue) { const pattern = facetValues.indexOf(node.facetValue); shape.setAttribute('stroke-dasharray', `${2 + pattern * 2} 3`); shape.classList.add('explore-facet-shape'); } group.append(shape); if (node.cluster) { const count = svg('text', { y: '52', class: 'explore-count' }); count.textContent = String(node.count); group.append(count); }
            const label = svg('text', { y: '31', 'text-anchor': 'middle' }); const labelLimit = Math.max(6, Math.floor((slot - 20) / 14)); label.textContent = node.label.length > labelLimit ? node.label.slice(0, labelLimit) + '…' : node.label; group.append(label);
            group.dataset['nodeId'] = node.id; const title = svg('title'); title.textContent = `${node.label}\n${node.id}\n${node.facet}`; group.append(title);
            group.onfocus = () => { const screenX = point.x * scale + x; const screenY = point.y * scale + y; if (screenX < 25 || screenX > width - 25) x = width / 2 - point.x * scale; if (screenY < 25 || screenY > height - 40) y = height / 2 - point.y * scale; update(); }; group.onclick = () => options.choose(node.id); group.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options.choose(node.id); } }; viewport.append(group);
        }
    };
    panel.append(drawing, element('p', `지도: ${options.nodes.length}개 표식 · 관계 ${Math.min(150, options.edges.length)} / ${options.edges.length}개. 겹칠 수 있는 관계 이름은 지도에서 생략합니다. 모든 관계 이름은 선의 설명과 아래 관계 목록에서 확인할 수 있습니다. 화면 밖 표식은 이동·축소 버튼 또는 Tab 키로 탐색합니다. 전체 노드와 관계는 아래 목록에서 확인할 수 있습니다.`, 'meta'));
    const legend = element('details'); legend.append(element('summary', '모양 · 분류 범례'));
    const list = element('ul', '', 'explore-legend'); for (const [index, kind] of options.kinds.slice(0, 32).entries()) { const item = element('li', `${shapes[index % 8]} · ${options.kindLabel(kind)}`); item.className = `kind-${index % 8}`; const sample = svg('svg', { viewBox: '-20 -20 40 40', width: '40', height: '40', 'aria-hidden': 'true', class: `explore-kind-sample explore-vertex kind-${index % 8}` }); if (index >= 8) sample.style.setProperty('--kind-fill', `url(#explore-kind-${index})`); sample.append(glyph(index)); item.prepend(sample); if (index >= 8) item.append(document.createTextNode(` · 무늬 ${Math.floor(index / 8)}`)); list.append(item); } legend.append(list); if (options.kinds.length > 32) legend.append(element('p', `종류 범례 32 / ${options.kinds.length}개. 모든 종류 이름은 종류 필터와 노드 목록에서 확인할 수 있습니다.`, 'meta')); const facetLegend = element('ul'); for (const [index, value] of facetValues.entries()) { const item = element('li', value); const sample = svg('svg', { viewBox: '0 0 60 14', width: '60', height: '14', 'aria-label': `점선 길이 ${2 + index * 2}` }); sample.classList.add('explore-facet-sample'); sample.append(svg('line', { x1: '0', y1: '7', x2: '60', y2: '7', stroke: 'var(--text)', 'stroke-width': '2', 'stroke-dasharray': `${2 + index * 2} 3` })); item.prepend(sample); facetLegend.append(item); } legend.append(facetLegend, element('p', '점선 윤곽: 분류가 있는 노드 · 굵은 윤곽: 고정한 노드 · 숫자: 묶인 노드 수. 분류 이름과 값은 노드 설명·선택 패널에 표시합니다.', 'meta')); panel.append(legend); container.append(panel); draw(); update(); const observer = new ResizeObserver(() => { if (!panel.isConnected) observer.disconnect(); else if (Math.abs(drawing.getBoundingClientRect().width - width) > 1 || Math.abs(drawing.getBoundingClientRect().height - height) > 1) draw(); }); observer.observe(drawing); return () => observer.disconnect();
}
