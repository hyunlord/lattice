import type { LoopInterpretation, LoopNode, LoopShape, LoopUI } from './loop-map-types.js';
import { element, anchor } from './explore-controls.js';
export { element, anchor };
export const svgNS = 'http://www.w3.org/2000/svg';
export function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] { return document.createElementNS(svgNS, name); }
export function label(node: LoopNode, ui: LoopUI): string { return node.kindLabel ?? ui.context.kindLabel?.(node.kind) ?? node.kind; }
const shapes: readonly LoopShape[] = ['diamond', 'square', 'circle', 'pill', 'star', 'triangle', 'flag', 'target', 'hexagon', 'house'];
export function glyph(node: LoopNode, size = 16): SVGSVGElement {
    const result = svg('svg'); result.classList.add('lm-glyph', `lm-tone-${node.kindColor ?? 'blue'}`); result.setAttribute('width', String(size)); result.setAttribute('height', String(size)); result.setAttribute('viewBox', '0 0 16 16'); result.setAttribute('aria-hidden', 'true');
    let hash = 0; for (const character of node.kind) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const shape = node.kindShape ?? shapes[hash % shapes.length] ?? 'circle'; const path = svg('path');
    const paths: Readonly<Record<LoopShape, string>> = { diamond: 'M8 1L15 8L8 15L1 8Z', square: 'M4 2.5H12Q13.5 2.5 13.5 4V12Q13.5 13.5 12 13.5H4Q2.5 13.5 2.5 12V4Q2.5 2.5 4 2.5Z', circle: 'M8 2.5A5.5 5.5 0 1 0 8 13.5A5.5 5.5 0 1 0 8 2.5', pill: 'M5 4H11A4 4 0 0 1 11 12H5A4 4 0 0 1 5 4', star: 'M8 1L10 6L15 8L10 10L8 15L6 10L1 8L6 6Z', triangle: 'M8 2L15 14H1Z', flag: 'M3 15V2H14L11 6L14 10H3', target: 'M8 2A6 6 0 1 0 8 14A6 6 0 1 0 8 2M8 5A3 3 0 1 1 8 11A3 3 0 1 1 8 5', hexagon: 'M8 1L14 4.5V11.5L8 15L2 11.5V4.5Z', house: 'M1 8L8 2L15 8V14H1Z' };
    path.setAttribute('d', paths[shape]); if (shape === 'flag') { path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.8'); } else path.setAttribute('fill', 'currentColor'); path.setAttribute('fill-rule', 'evenodd'); result.append(path); return result;
}
export function liveDot(node: LoopNode, ui: LoopUI): HTMLElement | undefined { if (node.status !== 'present') return undefined; const dot = element('i', '', 'lm-dot'); dot.title = ui.model.statusLabels.present; dot.setAttribute('aria-label', ui.model.statusLabels.present); return dot; }
export function chip(id: string, ui: LoopUI, note?: string): HTMLButtonElement | undefined {
    const node = ui.byId.get(id); if (!node) return undefined;
    const button = element('button', '', 'lm-chip'); button.type = 'button'; button.title = node.summary; button.append(glyph(node), element('span', node.name));
    if (note) button.append(element('small', note)); const dot = liveDot(node, ui); if (dot) button.append(dot); button.onclick = () => ui.openFocus(id); return button;
}
export function interpretation(value: LoopInterpretation | undefined): HTMLElement | undefined {
    if (!value) return undefined; const block = element('details', '', 'lm-interpretation'); block.append(element('summary', `AI 요약${value.stale ? ' · 원본 변경됨' : ''}`), element('p', value.summary));
    const list = element('ul'); for (const entry of value.evidence) { const row = element('li'); const text = `${entry.path}${entry.line ? `:${entry.line}` : ''}`; row.append(entry.url ? anchor(text, entry.url) : element('span', text)); list.append(row); } if (list.childElementCount) block.append(list); return block;
}
export function media(node: LoopNode): HTMLElement | undefined {
    if (!node.media) return undefined; const asset = node.media; const box = element('div', '', 'lm-media'); box.setAttribute('role', 'img'); box.setAttribute('aria-label', asset.alt ?? node.name);
    const image = element('img'); image.src = asset.url; image.alt = asset.alt ?? node.name; image.loading = 'lazy';
    if (asset.frame) { const frame = asset.frame; box.style.aspectRatio = `${frame.width} / ${frame.height}`; box.classList.add('lm-media-crop'); image.onload = () => { image.style.width = `${image.naturalWidth / frame.width * 100}%`; image.style.height = `${image.naturalHeight / frame.height * 100}%`; image.style.left = `${-frame.x / frame.width * 100}%`; image.style.top = `${-frame.y / frame.height * 100}%`; }; }
    box.append(image); return box;
}
export function orderedKinds(ui: LoopUI): string[] { const kinds = [...new Set(ui.model.nodes.map(node => node.kind))]; const order = ui.model.kindOrder ?? []; return kinds.sort((a, b) => { const ai = order.indexOf(a), bi = order.indexOf(b); return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi) || a.localeCompare(b); }); }

export function kindLabel(kind: string, ui: LoopUI): string { const configured = ui.context.kindLabel?.(kind); return configured && configured !== kind ? configured : ui.model.nodes.find(node => node.kind === kind)?.kindLabel ?? kind; }
