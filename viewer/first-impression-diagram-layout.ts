import { dependencyLayers } from './first-impression-diagram-ranks.js';
type Point = { readonly x: number; readonly y: number; };
type Box = { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
type Connection = { readonly source: string; readonly target: string; };
type Segment = { readonly a: Point; readonly b: Point; };
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const segments = (points: readonly Point[]): Segment[] => points.slice(1).map((b, index) => ({ a: points[index] ?? b, b }));
function intersects({ a, b }: Segment, box: Box): boolean {
    return a.x === b.x ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height : a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;
}
function overlaps(a: Segment, b: Segment, clearance = .001): boolean {
    const interval = (a1: number, a2: number, b1: number, b2: number) => Math.min(Math.max(a1, a2), Math.max(b1, b2)) - Math.max(Math.min(a1, a2), Math.min(b1, b2)) > .001;
    return Math.abs(a.a.x - a.b.x) < .001 && Math.abs(b.a.x - b.b.x) < .001 && Math.abs(a.a.x - b.a.x) < clearance && interval(a.a.y, a.b.y, b.a.y, b.b.y) || Math.abs(a.a.y - a.b.y) < .001 && Math.abs(b.a.y - b.b.y) < .001 && Math.abs(a.a.y - b.a.y) < clearance && interval(a.a.x, a.b.x, b.a.x, b.b.x);
}
/** Dependency ranks and independent edge lanes, with no graph-specific layout exceptions. */
export function structureLayout(ids: readonly string[], edges: readonly Connection[], width: number, starts: readonly string[] = []): { readonly boxes: readonly Box[]; readonly routes: readonly (Connection & { readonly edgeIndex: number; readonly points: readonly Point[]; readonly label: Point; })[]; readonly height: number; } {
    const compact = width < 640, columns = width >= 960 ? 3 : 2;
    const margin = compact ? 16 : 44, gap = compact ? 28 : 76, boxHeight = compact ? 180 : 144;
    const laneCount = Math.max(1, edges.length);
    const rowGap = Math.max(60, Math.min(laneCount * 6, 56) + 24);
    const laneStep = (rowGap - 24) / laneCount;
    const boxWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
    const layers = dependencyLayers(ids, edges, starts);
    const rows = layers.flatMap(layer => Array.from({ length: Math.ceil(layer.length / columns) }, (_, index) => layer.slice(index * columns, (index + 1) * columns)));
    const topGap = edges.some(edge => rows[0]?.includes(edge.target)) ? rowGap : 12;
    const boxes = rows.flatMap((row, rank) => row.map((id, index) => ({ id, x: (width - (row.length * boxWidth + (row.length - 1) * gap)) / 2 + index * (boxWidth + gap), y: topGap + rank * (boxHeight + rowGap), width: boxWidth, height: boxHeight })));
    const byId = new Map(boxes.map(box => [box.id, box]));
    const occupied: Segment[] = [];
    const routes = edges.flatMap((edge, index) => {
        const source = byId.get(edge.source), target = byId.get(edge.target);
        if (!source || !target || source.id === target.id) return [];
        // Global edge slots keep endpoint stems distinct even when boxes align vertically.
        const fraction = .2 + .6 * (index + 1) / (laneCount + 1);
        const a = { x: source.x + source.width * fraction, y: source.y + source.height };
        const b = { x: target.x + target.width * fraction, y: target.y };
        const sourceY = a.y + 12 + index * laneStep, targetY = b.y - 12 - (laneCount - index) * laneStep;
        const candidates: Point[][] = [];
        if (source.y < target.y) {
            for (const y of [sourceY, targetY]) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
        }
        const railStep = laneCount <= 10 ? 6 : (margin - 8) / laneCount;
        const rails = [4 + index * railStep, width - 4 - index * railStep, 4 + index * (margin - 8) / laneCount, width - 4 - index * (margin - 8) / laneCount, ...boxes.map(box => box.x - gap / 2 + (index - (laneCount - 1) / 2) * (laneCount <= 10 ? 6 : Math.min(.3, gap / (laneCount * 2))))];
        for (const x of rails) candidates.push([a, { x: a.x, y: sourceY }, { x, y: sourceY }, { x, y: targetY }, { x: b.x, y: targetY }, b]);
        const clear = candidates.map(points => points.filter((point, step) => step === 0 || length(point, points[step - 1] ?? point) > .001)).filter(points => points.every(point => point.x >= 0 && point.x <= width && point.y >= 0) && segments(points).every(segment => boxes.every(box => !intersects(segment, box)) && occupied.every(other => !overlaps(segment, other))));
        const crossings = (parts: readonly Segment[]) => parts.reduce((sum, part) => sum + occupied.filter(other => part.a.x === part.b.x ? other.a.y === other.b.y && part.a.x > Math.min(other.a.x, other.b.x) && part.a.x < Math.max(other.a.x, other.b.x) && other.a.y > Math.min(part.a.y, part.b.y) && other.a.y < Math.max(part.a.y, part.b.y) : other.a.x === other.b.x && other.a.x > Math.min(part.a.x, part.b.x) && other.a.x < Math.max(part.a.x, part.b.x) && part.a.y > Math.min(other.a.y, other.b.y) && part.a.y < Math.max(other.a.y, other.b.y)).length, 0);
        const score = (points: readonly Point[]) => segments(points).reduce((sum, part) => sum + length(part.a, part.b), 0) + points.length * 16 + crossings(segments(points)) * 80 + (laneCount <= 10 ? segments(points).reduce((sum, part) => sum + occupied.filter(other => overlaps(part, other, 5.99)).length, 0) * 10000 : 0);
        const points = clear.sort((left, right) => score(left) - score(right))[0] ?? [];
        occupied.push(...segments(points));
        const segment = segments(points).sort((left, right) => length(right.a, right.b) - length(left.a, left.b))[0];
        return segment ? [{ ...edge, edgeIndex: index, points, label: { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 } }] : [];
    });
    return { boxes, routes, height: rows.length * boxHeight + Math.max(0, rows.length - 1) * rowGap + topGap + 12 };
}
