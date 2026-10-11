import type { DependencyPair, DependencyView, Obstacle, Point } from './dependency-layout.js';
import { dependencyCountLabel, dependencyPort, clearDependencyPort, dependencyPairSources, straightDependencyRoute, dependencyRouteIntersects, selectDependencyRoutes } from './dependency-layout.js';
import { svg } from './loop-map-shared.js';

type ArrowScene = { readonly view: DependencyView; readonly host: HTMLElement; readonly graph: SVGSVGElement; readonly flows: readonly DependencyPair[]; readonly boxes: ReadonlyMap<string, HTMLElement>; };
function labelSegment(points: readonly Point[]): { readonly center: Point; readonly vertical: boolean; readonly length: number; } | undefined {
    return points.slice(1).flatMap((point, index) => { const before = points[index]; return before ? [{ center: { x: (point.x + before.x) / 2, y: (point.y + before.y) / 2 }, vertical: point.x === before.x, length: Math.hypot(point.x - before.x, point.y - before.y) }] : []; }).sort((a, b) => b.length - a.length)[0];
}
export function dependencyLabelFitsSegment(size: { readonly width: number; readonly height: number; }, segment: { readonly vertical: boolean; readonly length: number; }): boolean {
    return (segment.vertical ? size.height : size.width) + 8 <= segment.length;
}
export function drawDependencyArrows(scene: ArrowScene): readonly DependencyPair[] {
    const { host, graph, flows, boxes, view } = scene; const bounds = host.getBoundingClientRect(); if (!bounds.width) return [];
    graph.replaceChildren(); graph.dataset['unrouted'] = '0'; graph.dataset['unplacedLabels'] = '0'; graph.dataset['sharedFallbacks'] = '0'; graph.dataset['unroutedPairs'] = ''; graph.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); graph.setAttribute('width', String(bounds.width)); graph.setAttribute('height', String(bounds.height));
    const markerId = `dependency-arrow-${crypto.randomUUID()}`; const defs = svg('defs'), marker = svg('marker'); marker.id = markerId;
    for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto-start-reverse' })) marker.setAttribute(key, value);
    const head = svg('path'); head.setAttribute('d', 'M0 0L10 5L0 10Z'); head.classList.add('lm-arrow-normal'); marker.append(head); defs.append(marker); graph.append(defs);
    const rectangles = new Map<string, Obstacle>();
    for (const [id, box] of boxes) { const rect = box.getBoundingClientRect(); rectangles.set(id, { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }); }
    const obstacleByElement = new Map<HTMLElement, Obstacle>(); const cardObstacles = new Map<string, Obstacle>();
    for (const [id, box] of rectangles) { const element = boxes.get(id); if (!element) continue; const obstacle = obstacleByElement.get(element) ?? { x: box.x - 12, y: box.y - 12, width: box.width + 24, height: box.height + 24 }; obstacleByElement.set(element, obstacle); cardObstacles.set(id, obstacle); }
    const obstacles = [...obstacleByElement.values()]; const directLabelBands: Obstacle[] = []; const usedRows = new Set<number>(); let laneIndex = 0;
    const freeRow = (near: number, direction: number): number | undefined => {
        const candidates = Array.from({ length: 13 }, (_, index) => Math.round(near / 4) * 4 + (index - 6) * 4).sort((a, b) => Math.abs(a - near) - Math.abs(b - near) || direction * (a - b));
        const row = candidates.find(y => y > 0 && y < bounds.height && !usedRows.has(y) && !([...rectangles.values()].map(box => ({ ...box, y: box.y - 3, height: box.height + 6 })).concat(directLabelBands)).some(box => y > box.y && y < box.y + box.height));
        if (row !== undefined) usedRows.add(row);
        return row;
    };
    const entries = flows.flatMap(flow => {
        const source = rectangles.get(flow.source), target = rectangles.get(flow.target); if (!source || !target) return [];
        const ports = (id: string) => flows.filter(item => boxes.get(item.source) === boxes.get(id) || boxes.get(item.target) === boxes.get(id));
        const sourcePorts = ports(flow.source), targetPorts = ports(flow.target); const downward = target.y > source.y;
        const sx = clearDependencyPort(source, dependencyPort(source, sourcePorts.indexOf(flow), sourcePorts.length), !downward, obstacles, cardObstacles.get(flow.source));
        const tx = clearDependencyPort(target, dependencyPort(target, targetPorts.indexOf(flow), targetPorts.length), downward, obstacles, cardObstacles.get(flow.target));
        const start: Point = { x: sx, y: downward ? source.y + source.height + 2 : source.y - 2 };
        const end: Point = { x: tx, y: downward ? target.y - 3 : target.y + target.height + 3 };
        const sourcePoint: Point = { x: sx, y: downward ? Math.ceil((start.y + 12) / 8) * 8 : Math.floor((start.y - 12) / 8) * 8 };
        const targetPoint: Point = { x: tx, y: downward ? Math.floor((end.y - 12) / 8) * 8 : Math.ceil((end.y + 12) / 8) * 8 };
        return [{ flow, start, end, sourcePoint, targetPoint }];
    });
    const directRoutes = new Map(entries.flatMap(entry => {
        const source = rectangles.get(entry.flow.source), target = rectangles.get(entry.flow.target);
        const route = source && target ? straightDependencyRoute(source, target, obstacles.filter(box => box !== cardObstacles.get(entry.flow.source) && box !== cardObstacles.get(entry.flow.target))) : undefined;
        if (!route) return [];
        const first = route[0], last = route.at(-1); if (first && last) directLabelBands.push({ x: first.x - 16, y: (first.y + last.y) / 2 - 12, width: 32, height: 24 });
        return [[entry.flow, route] as const];
    }));
    const rendered: { flow: DependencyPair; points: readonly Point[]; routeId: string; path: SVGPathElement; start: Point; end: Point; }[] = [];
    for (const entry of [...entries].sort((a, b) => Math.abs(a.targetPoint.y - a.sourcePoint.y) - Math.abs(b.targetPoint.y - b.sourcePoint.y) || b.flow.weight - a.flow.weight)) {
        const { flow, start, end, sourcePoint, targetPoint } = entry;
        const direction = end.y > start.y ? 1 : -1;
        const direct = directRoutes.get(flow);
        const sourceRow = direct ? sourcePoint.y : freeRow(sourcePoint.y, direction);
        const targetRow = direct ? targetPoint.y : sourceRow !== undefined && Math.abs(sourceRow - targetPoint.y) <= 24 ? sourceRow : freeRow(targetPoint.y, -direction);
        if (sourceRow === undefined || targetRow === undefined) { graph.dataset['unrouted'] = String(Number(graph.dataset['unrouted']) + 1); continue; }
        const lane = laneIndex++;
        const laneX = lane % 2 === 0 ? 8 + Math.floor(lane / 2) * 8 : bounds.width - 8 - Math.floor(lane / 2) * 8;
        const route: readonly Point[] = sourceRow === targetRow
            ? [{ x: start.x, y: sourceRow }, { x: end.x, y: targetRow }]
            : [{ x: start.x, y: sourceRow }, { x: laneX, y: sourceRow }, { x: laneX, y: targetRow }, { x: end.x, y: targetRow }];
        const points = direct ?? [start, ...route, end];
        const path = svg('path'); const routeId = `${markerId}-${graph.querySelectorAll('.lm-dependency-flow').length}`; path.id = routeId;
        path.classList.add('lm-flow', 'lm-dependency-flow'); path.dataset['source'] = flow.source; path.dataset['target'] = flow.target; path.dataset['count'] = String(flow.count ?? 0); path.dataset['reverseCount'] = String(flow.reverseCount ?? 0);
        path.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')); path.setAttribute('marker-end', `url(#${markerId})`); if (flow.reverseCount) path.setAttribute('marker-start', `url(#${markerId})`);
        path.setAttribute('stroke-width', String(Math.min(6, 1.5 + Math.log2(flow.weight + 1) * .55))); graph.append(path);
        rendered.push({ flow, points, routeId, path, start, end });
    }
    const selectedRoutes = selectDependencyRoutes(rendered);
    for (const route of rendered) if (!selectedRoutes.includes(route)) route.path.remove();
    const labelHalos: Obstacle[] = []; const labeledFlows: DependencyPair[] = [];
    for (const { flow, points, routeId, path } of selectedRoutes) {
        const segment = labelSegment(points); if (!segment) continue;
        const text = svg('text'); text.classList.add('lm-flow-label', 'lm-dependency-label'); text.dataset['route'] = routeId; text.dataset['source'] = flow.source; text.dataset['target'] = flow.target; text.dataset['count'] = String(flow.count ?? 0);
        text.setAttribute('x', String(segment.center.x)); text.setAttribute('y', String(segment.center.y)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central'); const actualSources = dependencyPairSources(view, flow);
        const attribution = actualSources.join('·');
        const countLabel = dependencyCountLabel(flow);
        const reverseLabel = dependencyCountLabel({ ...flow, count: flow.reverseCount ?? 0, projectCount: flow.reverseProjectCount ?? 0, sourceFiles: flow.reverseSourceFiles ?? [], projectSourceFiles: flow.reverseProjectSourceFiles ?? [] });
        text.textContent = flow.reverseCount ? `${attribution} → ${countLabel} · ← ${reverseLabel}` : `${attribution} · ${countLabel}`;
        graph.append(text); text.dataset['sourceMembers'] = JSON.stringify(actualSources);
        const candidates = points.slice(1).flatMap((point, index) => {
            const before = points[index]; if (!before) return [];
            const length = Math.hypot(point.x - before.x, point.y - before.y);
            return Array.from({ length: Math.max(1, Math.floor(length / 4)) }, (_, step) => (step + .5) / Math.max(1, Math.floor(length / 4))).sort((a, b) => Math.abs(a - .5) - Math.abs(b - .5)).map(fraction => ({ center: { x: before.x + (point.x - before.x) * fraction, y: before.y + (point.y - before.y) * fraction }, vertical: point.x === before.x, length }));
        }).sort((a, b) => b.length - a.length);
        const position = (): Obstacle | undefined => {
            for (const candidate of candidates) {
                if (!dependencyLabelFitsSegment(text.getBBox(), candidate)) continue;
                text.setAttribute('x', String(candidate.center.x)); text.setAttribute('y', String(candidate.center.y));
                text.removeAttribute('transform');
                const rect = text.getBoundingClientRect(); const halo = { x: rect.left - bounds.left - 3, y: rect.top - bounds.top - 3, width: rect.width + 6, height: rect.height + 6 };
                if (halo.x < 0 || halo.y < 0 || halo.x + halo.width > bounds.width || halo.y + halo.height > bounds.height) continue;
                if (selectedRoutes.some(other => other.path.isConnected && other.routeId !== routeId && dependencyRouteIntersects(other.points, { x: halo.x - 3.5, y: halo.y - 3.5, width: halo.width + 7, height: halo.height + 7 }))) continue;
                if ([...rectangles.values(), ...labelHalos].some(box => halo.x < box.x + box.width && halo.x + halo.width > box.x && halo.y < box.y + box.height && halo.y + halo.height > box.y)) continue;
                return halo;
            }
            return undefined;
        };
        let halo = position();
        if (!halo) { text.textContent = flow.reverseCount ? `→ ${countLabel} · ← ${reverseLabel}` : countLabel; halo = position(); }
        if (!halo) { graph.dataset['unplacedLabels'] = String(Number(graph.dataset['unplacedLabels'] ?? 0) + 1); text.remove(); path.remove(); continue; }
        labelHalos.push(halo); labeledFlows.push(flow);
        const actualTargets = dependencyPairSources(view, flow, 'target');
        const targetNames = actualTargets.length ? actualTargets : view.stages.filter(stage => stage.id === flow.target).map(stage => stage.title);
        const from = actualSources.join(' · ') || flow.source; const to = targetNames.join(' · ') || flow.target;
        const reverse = { source: flow.target, target: flow.source }; const reverseFrom = dependencyPairSources(view, reverse).join(' · ') || to; const reverseTo = dependencyPairSources(view, reverse, 'target').join(' · ') || from;
        const titleText = `${from} → ${to} (${from}에서 사용: ${countLabel})${flow.reverseCount ? `; ${reverseFrom} → ${reverseTo} (${reverseFrom}에서 사용: ${reverseLabel})` : ''}`;
        const title = svg('title'); title.textContent = titleText; path.append(title); const labelTitle = svg('title'); labelTitle.textContent = titleText; text.append(labelTitle); graph.append(text);
    }
    return labeledFlows;
}
