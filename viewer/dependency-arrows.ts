import type { DependencyView, Obstacle, Point } from './dependency-layout.js';
import { orthogonalRoute } from './dependency-layout.js';
import { svg } from './loop-map-shared.js';

type ArrowScene = { readonly host: HTMLElement; readonly graph: SVGSVGElement; readonly view: DependencyView; readonly boxes: ReadonlyMap<string, HTMLElement>; };
export function drawDependencyArrows(scene: ArrowScene): void {
    const { host, graph, view, boxes } = scene; const bounds = host.getBoundingClientRect(); if (!bounds.width) return;
    graph.replaceChildren(); graph.dataset['unrouted'] = '0'; graph.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); graph.setAttribute('width', String(bounds.width)); graph.setAttribute('height', String(bounds.height));
    const markerId = `dependency-arrow-${crypto.randomUUID()}`; const defs = svg('defs'), marker = svg('marker'); marker.id = markerId;
    for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' })) marker.setAttribute(key, value);
    const head = svg('path'); head.setAttribute('d', 'M0 0L10 5L0 10Z'); head.classList.add('lm-arrow-normal'); marker.append(head); defs.append(marker); graph.append(defs);
    const rectangles = new Map<string, Obstacle>();
    for (const [id, box] of boxes) { const rect = box.getBoundingClientRect(); rectangles.set(id, { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }); }
    const labels = view.flows.flatMap((flow, index) => {
        const source = rectangles.get(flow.source), target = rectangles.get(flow.target); if (!source || !target) return [];
        const row = boxes.get(flow.source)?.closest('.lm-dependency-level'); if (!row) return [];
        const rowBounds = row.getBoundingClientRect(); const peers = view.flows.filter(other => boxes.get(other.source)?.closest('.lm-dependency-level') === row);
        const slot = peers.indexOf(flow), columns = Math.max(1, Math.floor((bounds.width - 48) / 144));
        const label: Obstacle = { x: 24 + (slot % columns) * 144, y: Math.ceil((rowBounds.bottom - bounds.top + 32) / 8) * 8 + Math.floor(slot / columns) * 40, width: 88, height: 16 };
        return [{ flow, source, target, label, index }];
    });
    const obstacles = [...rectangles.values()].map(box => ({ x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 }));
    for (const entry of labels) {
        const { source, target, flow, label } = entry;
        const sx = Math.round((source.x + source.width / 2) / 8) * 8, tx = Math.round((target.x + target.width / 2) / 8) * 8;
        const sourcePoint: Point = { x: sx, y: Math.ceil((source.y + source.height + 16) / 8) * 8 };
        const targetAbove = target.y > source.y; const targetPoint: Point = { x: tx, y: targetAbove ? Math.floor((target.y - 16) / 8) * 8 : Math.ceil((target.y + target.height + 16) / 8) * 8 };
        const labelStart = { x: label.x - 16, y: label.y + 8 }, labelEnd = { x: label.x + label.width + 16, y: label.y + 8 };
        const space = { width: bounds.width, height: bounds.height, obstacles: [...obstacles, ...labels.map(item => ({ x: item.label.x - 2, y: item.label.y - 2, width: item.label.width + 4, height: item.label.height + 4 }))] };
        const first = orthogonalRoute(sourcePoint, labelStart, space), second = orthogonalRoute(labelEnd, targetPoint, space);
        if (!first.length || !second.length) graph.dataset['unrouted'] = String(Number(graph.dataset['unrouted']) + 1);
        const titleText = `${view.stages.find(stage => stage.id === flow.source)?.title} → ${view.stages.find(stage => stage.id === flow.target)?.title}: ${flow.label}`;
        const draw = (points: readonly Point[], arrow: boolean): void => {
            if (!points.length) return; const path = svg('path'); path.classList.add('lm-flow', 'lm-dependency-flow'); path.dataset['source'] = flow.source; path.dataset['target'] = flow.target;
            path.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')); if (arrow) path.setAttribute('marker-end', `url(#${markerId})`); path.setAttribute('stroke-width', String(Math.min(4, 1.3 + Math.log2((flow.count ?? 1) + 1) / 3)));
            const title = svg('title'); title.textContent = titleText; path.append(title); graph.append(path);
        };
        if (first.length) draw([{ x: sx, y: source.y + source.height + 2 }, ...first], false);
        if (second.length) draw([...second, { x: tx, y: targetAbove ? target.y - 3 : target.y + target.height + 3 }], true);
        const text = svg('text'); text.classList.add('lm-flow-label', 'lm-dependency-label'); text.setAttribute('x', String(label.x + label.width / 2)); text.setAttribute('y', String(label.y + 12)); text.setAttribute('text-anchor', 'middle'); text.textContent = flow.label; text.dataset['source'] = flow.source; text.dataset['target'] = flow.target; text.dataset['count'] = String(flow.count ?? 0);
        const title = svg('title'); title.textContent = titleText; text.append(title); graph.append(text);
    }
}
