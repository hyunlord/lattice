import type { DependencyView, Obstacle, Point } from './dependency-layout.js';
import { dependencyLabelLines, dependencyLabelRowHeight, dependencyPort, clearDependencyPort, orthogonalRoute, reserveDependencyRoute } from './dependency-layout.js';
import { svg } from './loop-map-shared.js';

type ArrowScene = { readonly host: HTMLElement; readonly graph: SVGSVGElement; readonly view: DependencyView; readonly boxes: ReadonlyMap<string, HTMLElement>; };
export function drawDependencyArrows(scene: ArrowScene): void {
    const { host, graph, view, boxes } = scene; const bounds = host.getBoundingClientRect(); if (!bounds.width) return;
    graph.replaceChildren(); graph.dataset['unrouted'] = '0'; graph.dataset['sharedFallbacks'] = '0'; graph.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); graph.setAttribute('width', String(bounds.width)); graph.setAttribute('height', String(bounds.height));
    const markerId = `dependency-arrow-${crypto.randomUUID()}`; const defs = svg('defs'), marker = svg('marker'); marker.id = markerId;
    for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto' })) marker.setAttribute(key, value);
    const head = svg('path'); head.setAttribute('d', 'M0 0L10 5L0 10Z'); head.classList.add('lm-arrow-normal'); marker.append(head); defs.append(marker); graph.append(defs);
    const rectangles = new Map<string, Obstacle>();
    for (const [id, box] of boxes) { const rect = box.getBoundingClientRect(); rectangles.set(id, { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }); }
    const labelLines = dependencyLabelLines(view); const occupied = new Set<string>();
    const labels = view.flows.flatMap((flow, index) => {
        const source = rectangles.get(flow.source), target = rectangles.get(flow.target); if (!source || !target) return [];
        const row = boxes.get(flow.source)?.closest('.lm-dependency-level'); if (!row) return [];
        const rowBounds = row.getBoundingClientRect(); const peers = view.flows.filter(other => boxes.get(other.source)?.closest('.lm-dependency-level') === row);
        const rowHeight = dependencyLabelRowHeight(peers, labelLines);
        const slot = peers.indexOf(flow), columns = Math.max(1, Math.floor((bounds.width - 48) / 240));
        const label: Obstacle = { x: 24 + (slot % columns) * 240, y: Math.ceil((rowBounds.bottom - bounds.top + 32) / 8) * 8 + Math.floor(slot / columns) * rowHeight, width: 192, height: rowHeight - 20 };
        return [{ flow, source, target, label, index }];
    });
    for (const entry of labels) {
        const { flow, label } = entry;
        const titleText = `${view.stages.find(stage => stage.id === flow.source)?.title} → ${view.stages.find(stage => stage.id === flow.target)?.title}: ${flow.label}`;
        const text = svg('text'); text.classList.add('lm-flow-label', 'lm-dependency-label'); text.setAttribute('x', String(label.x + label.width / 2)); text.setAttribute('y', String(label.y + 12)); text.setAttribute('text-anchor', 'middle'); for (const [index, line] of (labelLines.get(JSON.stringify([flow.source, flow.target])) ?? [flow.label]).entries()) { const span = svg('tspan'); span.setAttribute('x', String(label.x + label.width / 2)); span.setAttribute('dy', index ? '12' : '0'); span.textContent = line; text.append(span); } text.dataset['source'] = flow.source; text.dataset['target'] = flow.target; text.dataset['count'] = String(flow.count ?? 0);
        const title = svg('title'); title.textContent = titleText; text.append(title); graph.append(text);
        const actual = text.getBBox(); const right = Math.max(label.x + label.width, actual.x + actual.width), bottom = Math.max(label.y + label.height, actual.y + actual.height); const x = Math.min(label.x, actual.x), y = Math.min(label.y, actual.y); entry.label = { x, y, width: right - x, height: bottom - y };
    }
    const cardObstacles = new Map([...rectangles].map(([id, box]) => [id, { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 }])); const obstacles = [...cardObstacles.values()];
    for (const caption of host.querySelectorAll('.lm-folder-prefix, .lm-cycle-caption')) { const rect = caption.getBoundingClientRect(); obstacles.push({ x: rect.left - bounds.left - 2, y: rect.top - bounds.top - 2, width: rect.width + 4, height: rect.height + 4 }); }
    for (const entry of labels) {
        const { source, target, flow, label } = entry;
        const ports = (id: string) => view.flows.filter(item => item.source === id || item.target === id);
        const sourcePorts = ports(flow.source), targetPorts = ports(flow.target);
        const targetAbove = target.y > source.y; const sx = clearDependencyPort(source, dependencyPort(source, sourcePorts.indexOf(flow), sourcePorts.length), false, obstacles, cardObstacles.get(flow.source)), tx = clearDependencyPort(target, dependencyPort(target, targetPorts.indexOf(flow), targetPorts.length), targetAbove, obstacles, cardObstacles.get(flow.target));
        const sourcePoint: Point = { x: sx, y: Math.ceil((source.y + source.height + 16) / 8) * 8 };
        const targetPoint: Point = { x: tx, y: targetAbove ? Math.floor((target.y - 16) / 8) * 8 : Math.ceil((target.y + target.height + 16) / 8) * 8 };
        const labelStart = { x: label.x - 16, y: label.y + 16 }, labelEnd = { x: label.x + label.width + 16, y: label.y + 16 };
        const space = { width: bounds.width, height: bounds.height, obstacles: [...obstacles, ...labels.map(item => ({ x: item.label.x - 2, y: item.label.y - 2, width: item.label.width + 4, height: item.label.height + 4 }))] };
        const route = (start: Point, end: Point): readonly Point[] => { const separate = orthogonalRoute(start, end, { ...space, occupied }); if (!separate.length) graph.dataset['sharedFallbacks'] = String(Number(graph.dataset['sharedFallbacks']) + 1); const result = separate.length ? separate : orthogonalRoute(start, end, space); reserveDependencyRoute(result, bounds.width, occupied); return result; };
        const first = route(sourcePoint, labelStart), second = route(labelEnd, targetPoint);
        if (!first.length || !second.length) graph.dataset['unrouted'] = String(Number(graph.dataset['unrouted']) + 1);
        const titleText = `${view.stages.find(stage => stage.id === flow.source)?.title} → ${view.stages.find(stage => stage.id === flow.target)?.title}: ${flow.label}`;
        const draw = (points: readonly Point[], arrow: boolean): void => {
            if (!points.length) return; const path = svg('path'); path.classList.add('lm-flow', 'lm-dependency-flow'); path.dataset['source'] = flow.source; path.dataset['target'] = flow.target;
            path.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')); if (arrow) path.setAttribute('marker-end', `url(#${markerId})`); path.setAttribute('stroke-width', String(Math.min(4, 1.3 + Math.log2((flow.count ?? 1) + 1) / 3)));
            const title = svg('title'); title.textContent = titleText; path.append(title); graph.append(path);
        };
        if (first.length) draw([{ x: sx, y: source.y + source.height + 2 }, ...first], false);
        if (second.length) draw([...second, { x: tx, y: targetAbove ? target.y - 3 : target.y + target.height + 3 }], true);

    }
}
