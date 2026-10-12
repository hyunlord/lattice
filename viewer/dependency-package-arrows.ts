import type { DependencyPair, Obstacle, Point } from './dependency-layout.js';
import { dependencyCountLabel, dependencyRouteIntersects, orthogonalRoute, reserveDependencyRoute } from './dependency-layout.js';
import { svg } from './loop-map-shared.js';

type Port = { readonly boundary: Point; readonly grid: Point; };
export type PackageRoute = { readonly flow: DependencyPair; readonly points: readonly Point[]; readonly label: Point; readonly labelBox: Obstacle; };
const countText = (flow: DependencyPair): string => { const declarations = flow.projectCount ?? new Set(flow.projectSourceFiles ?? []).size; return declarations ? `${(flow.count ?? 0) - declarations}+${declarations}` : String(flow.count ?? 0); };
const overlap = (a: Obstacle, b: Obstacle): boolean => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function sharesSegment(points: readonly Point[], other: readonly Point[]): boolean {
    return points.slice(1).some((b, index) => {
        const a = points[index]; if (!a) return false;
        return other.slice(1).some((d, index) => {
            const c = other[index]; if (!c) return false;
            return a.x === b.x && c.x === d.x && a.x === c.x && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
                || a.y === b.y && c.y === d.y && a.y === c.y && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
        });
    });
}
function ports(box: Obstacle): readonly Port[] {
    const result: Port[] = [];
    for (let x = Math.ceil((box.x + 16) / 8) * 8; x < box.x + box.width - 12; x += 16) {
        result.push({ boundary: { x, y: box.y - 2 }, grid: { x, y: Math.floor((box.y - 12) / 8) * 8 } }, { boundary: { x, y: box.y + box.height + 2 }, grid: { x, y: Math.ceil((box.y + box.height + 12) / 8) * 8 } });
    }
    for (let y = Math.ceil((box.y + 16) / 8) * 8; y < box.y + box.height - 12; y += 16) {
        result.push({ boundary: { x: box.x - 2, y }, grid: { x: Math.floor((box.x - 12) / 8) * 8, y } }, { boundary: { x: box.x + box.width + 2, y }, grid: { x: Math.ceil((box.x + box.width + 12) / 8) * 8, y } });
    }
    return result;
}
export function routePackageDependencies(flows: readonly DependencyPair[], boxes: ReadonlyMap<string, Obstacle>, width: number, height: number, labelWidth: (flow: DependencyPair) => number): readonly PackageRoute[] {
    const obstacles = [...boxes.values()].map(box => ({ x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 }));
    const usedPorts = new Set<string>(), occupied = new Set<string>(); const result: PackageRoute[] = [];
    const key = (point: Point): string => `${point.x}:${point.y}`;
    for (const flow of flows) {
        const source = boxes.get(flow.source), target = boxes.get(flow.target); if (!source || !target) continue;
        const allowed = (port: Port): boolean => port.grid.x >= 8 && port.grid.x <= width - 8 && port.grid.y >= 8 && port.grid.y <= height - 8 && !usedPorts.has(key(port.boundary));
        const candidates = ports(source).filter(allowed).flatMap(start => ports(target).filter(allowed).map(end => ({ start, end, distance: Math.abs(start.grid.x - end.grid.x) + Math.abs(start.grid.y - end.grid.y) }))).sort((a, b) => a.distance - b.distance);
        const side = (port: Port, box: Obstacle): string => port.boundary.x < box.x ? 'left' : port.boundary.x > box.x + box.width ? 'right' : port.boundary.y < box.y ? 'top' : 'bottom';
        const directions = new Map<string, number>();
        const alternatives = candidates.filter(({ start, end }) => { const direction = `${side(start, source)}:${side(end, target)}`, count = directions.get(direction) ?? 0; directions.set(direction, count + 1); return count < 8; });
        const labels = result.map(item => item.labelBox); const boxWidth = labelWidth(flow) + 12;
        let found: PackageRoute | undefined;
        for (const { start, end } of alternatives) {
            const route = orthogonalRoute(start.grid, end.grid, { width, height, obstacles: [...obstacles, ...labels], occupied });
            if (!route.length) continue;
            const points = [start.boundary, ...route, end.boundary];
            if ([...boxes.values(), ...labels].some(box => dependencyRouteIntersects(points, box))) continue;
            if (result.some(other => sharesSegment(points, other.points))) continue;
            const segments = points.slice(1).flatMap((point, index) => {
                const previous = points[index]; if (!previous) return [];
                const length = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
                return [{ point, previous, length }];
            });
            const positions = segments.sort((a, b) => b.length - a.length).flatMap(({ point, previous, length }) => Array.from({ length: Math.floor(length / 8) }, (_, step) => (step + .5) / Math.max(1, Math.floor(length / 8))).sort((a, b) => Math.abs(a - .5) - Math.abs(b - .5)).map(fraction => ({ x: previous.x + (point.x - previous.x) * fraction, y: previous.y + (point.y - previous.y) * fraction })));
            for (const label of positions) {
                const labelBox = { x: label.x - boxWidth / 2, y: label.y - 12, width: boxWidth, height: 24 };
                if (labelBox.x < 0 || labelBox.y < 0 || labelBox.x + labelBox.width > width || labelBox.y + labelBox.height > height) continue;
                if ([...obstacles, ...labels].some(box => overlap(box, labelBox)) || result.some(item => dependencyRouteIntersects(item.points, labelBox))) continue;
                found = { flow, points, label, labelBox }; break;
            }
            if (found) { usedPorts.add(key(start.boundary)); usedPorts.add(key(end.boundary)); break; }
        }
        if (found) { result.push(found); reserveDependencyRoute(found.points, width, occupied); }
    }
    return result;
}
export function mobileDependencyRouteOrder(flows: readonly DependencyPair[], boxes: ReadonlyMap<string, Obstacle>): readonly DependencyPair[] {
    const distance = (flow: DependencyPair): number => { const source = boxes.get(flow.source), target = boxes.get(flow.target); return source && target ? Math.abs(source.x + source.width / 2 - target.x - target.width / 2) + Math.abs(source.y + source.height / 2 - target.y - target.height / 2) : Infinity; };
    return [...flows].sort((a, b) => distance(a) - distance(b));
}
export function drawPackageDependencyArrows(scene: { readonly host: HTMLElement; readonly graph: SVGSVGElement; readonly flows: readonly DependencyPair[]; readonly boxes: ReadonlyMap<string, HTMLElement>; readonly names: ReadonlyMap<string, string>; readonly compact?: boolean; }): readonly DependencyPair[] {
    const { host, graph, flows, boxes, names } = scene;
    if (flows.length === 0) {
        graph.replaceChildren(); graph.setAttribute('width', '0'); graph.setAttribute('height', '0'); graph.removeAttribute('viewBox');
        graph.dataset['unrouted'] = '0'; graph.dataset['unplacedLabels'] = '0'; graph.dataset['unroutedPairs'] = '[]';
        return [];
    }
    const bounds = host.getBoundingClientRect(); graph.replaceChildren();
    graph.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); graph.setAttribute('width', String(bounds.width)); graph.setAttribute('height', String(bounds.height));
    const markerId = `package-arrow-${crypto.randomUUID()}`, defs = svg('defs'), marker = svg('marker'); marker.id = markerId;
    for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '5', markerHeight: '5', orient: 'auto' })) marker.setAttribute(key, value);
    const head = svg('path'); head.setAttribute('d', 'M0 0L10 5L0 10Z'); head.classList.add('lm-arrow-normal'); marker.append(head); defs.append(marker); graph.append(defs);
    const rectangles = new Map([...boxes].map(([id, box]) => { const rect = box.getBoundingClientRect(); return [id, { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height }] as const; }));
    for (const [index, item] of host.querySelectorAll<HTMLElement>('.lm-unified-title, .lm-cycle-caption, .lm-member-details > summary, .lm-dependency-group-summary, .lm-compact-prefixes').entries()) {
        const rect = item.getBoundingClientRect(); rectangles.set(`caption:${index}`, { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height });
    }
    const measure = svg('text'); measure.classList.add('lm-flow-label', 'lm-dependency-label'); graph.append(measure);
    const routes = routePackageDependencies(scene.compact ? mobileDependencyRouteOrder(flows, rectangles) : flows, rectangles, bounds.width, bounds.height, flow => { measure.textContent = countText(flow); return measure.getBBox().width; }); measure.remove();
    graph.dataset['unrouted'] = String(flows.length - routes.length); graph.dataset['unplacedLabels'] = '0'; graph.dataset['unroutedPairs'] = JSON.stringify(flows.filter(flow => !routes.some(route => route.flow === flow)).map(flow => [flow.source, flow.target]));
    for (const [index, route] of routes.entries()) {
        const { flow, points, label } = route, path = svg('path'); const routeId = `${markerId}-${index}`; path.id = routeId;
        path.classList.add('lm-flow', 'lm-dependency-flow'); path.dataset['source'] = flow.source; path.dataset['target'] = flow.target; path.dataset['count'] = String(flow.count ?? 0);
        path.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`).join(' ')); path.setAttribute('marker-end', `url(#${markerId})`); path.setAttribute('stroke-width', String(Math.min(6, 1.5 + Math.log2(flow.weight + 1) * .55)));
        const title = svg('title'); title.textContent = `${names.get(flow.source) ?? flow.source} → ${names.get(flow.target) ?? flow.target}: ${dependencyCountLabel(flow)}`; path.append(title); graph.append(path);
        const text = svg('text'); text.classList.add('lm-flow-label', 'lm-dependency-label'); text.dataset['route'] = routeId; text.dataset['source'] = flow.source; text.dataset['target'] = flow.target; text.setAttribute('x', String(label.x)); text.setAttribute('y', String(label.y)); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'central'); text.textContent = countText(flow); const labelTitle = svg('title'); labelTitle.textContent = title.textContent; text.append(labelTitle); graph.append(text);
    }
    return routes.map(route => route.flow);
}
