type Point = { readonly x: number; readonly y: number; };
type Box = { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
type Connection = { readonly source: string; readonly target: string; };
const length = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function intersects(a: Point, b: Point, box: Box): boolean {
    return a.x === b.x ? a.x > box.x && a.x < box.x + box.width && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.height : a.y > box.y && a.y < box.y + box.height && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.width;
}
export function structureLayout(ids: readonly string[], edges: readonly Connection[], width: number): { readonly boxes: readonly Box[]; readonly routes: readonly (Connection & { readonly edgeIndex: number; readonly points: readonly Point[]; readonly label: Point; })[]; readonly height: number; } {
    const columns = width >= 960 ? 3 : 2;
    const compact = width < 640;
    const margin = compact ? 8 : 40, gap = compact ? 32 : 72, height = compact ? 140 : 144, rowGap = compact ? 40 : 72;
    const boxWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
    const boxes = ids.map((id, index) => ({ id, x: margin + index % columns * (boxWidth + gap), y: 24 + Math.floor(index / columns) * (height + rowGap), width: boxWidth, height }));
    const byId = new Map(boxes.map(box => [box.id, box]));
    const routes = edges.flatMap((edge, index) => {
        const source = byId.get(edge.source), target = byId.get(edge.target);
        if (!source || !target || source.id === target.id) return [];
        const ports = (box: Box) => { const incident = edges.map((item, edgeIndex) => ({ item, edgeIndex })).filter(({ item }) => item.source === box.id || item.target === box.id); const slot = incident.findIndex(item => item.edgeIndex === index); const fraction = incident.length > 1 ? .25 + .5 * slot / (incident.length - 1) : .5; return [{ x: box.x + box.width * fraction, y: box.y }, { x: box.x + box.width * fraction, y: box.y + box.height }, { x: box.x, y: box.y + box.height * fraction }, { x: box.x + box.width, y: box.y + box.height * fraction }]; };
        const candidates: Point[][] = [];
        for (const a of ports(source)) for (const b of ports(target)) {
            if (a.x === b.x || a.y === b.y) candidates.push([a, b]);
            candidates.push([a, { x: a.x, y: b.y }, b], [a, { x: b.x, y: a.y }, b]);
            for (const x of [2 + index % 3, width - 2 - index % 3, ...boxes.map(box => box.x - gap / 2)]) candidates.push([a, { x, y: a.y }, { x, y: b.y }, b]);
            for (const y of boxes.map(box => box.y - rowGap / 2)) candidates.push([a, { x: a.x, y }, { x: b.x, y }, b]);
        }
        const bottom = ports(source)[1], top = ports(target)[0];
        if (bottom && top) for (const rail of [2, width - 2]) candidates.push([bottom, { x: bottom.x, y: bottom.y + 12 }, { x: rail, y: bottom.y + 12 }, { x: rail, y: top.y - 12 }, { x: top.x, y: top.y - 12 }, top]);
        const clear = candidates.filter(points => points.every(point => point.x >= 0 && point.x <= width && point.y >= 0) && points.slice(1).every((b, step) => { const a = points[step]; return a && boxes.every(box => { if (intersects(a, b, box)) return false; if (box.id === source.id && step === 0 || box.id === target.id && step === points.length - 2) return true; return !intersects(a, b, { ...box, x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 }); }); }));
        const score = (points: readonly Point[]) => points.slice(1).reduce((sum, b, step) => sum + length(points[step] ?? b, b), 0) + points.length * 32;
        const points = clear.sort((a, b) => score(a) - score(b))[0] ?? [];
        const segment = points.slice(1).map((b, step) => ({ a: points[step] ?? b, b })).sort((a, b) => length(b.a, b.b) - length(a.a, a.b))[0];
        return segment ? [{ ...edge, edgeIndex: index, points, label: { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 } }] : [];
    });
    return { boxes, routes, height: Math.ceil(ids.length / columns) * (height + rowGap) + 24 };
}
