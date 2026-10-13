type Point = { readonly x: number; readonly y: number; };
type Rectangle = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
type RoutedLabel = { readonly element: SVGTextElement; readonly points: readonly Point[]; };
const overlaps = (a: Rectangle, b: Rectangle) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export function placeDiagramLabels(labels: readonly RoutedLabel[], boxes: readonly Rectangle[], bounds: { readonly width: number; readonly height: number; }): void {
    const occupied = boxes.map(box => ({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }));
    for (const { element, points } of labels) {
        const measured = typeof element.getBBox === 'function' ? element.getBBox() : undefined;
        const width = measured?.width || (element.textContent?.length ?? 0) * 8, height = measured?.height || 16;
        const segments = points.slice(1).map((b, index) => ({ a: points[index] ?? b, b })).sort((a, b) => Math.hypot(b.b.x - b.a.x, b.b.y - b.a.y) - Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y));
        let placed = false;
        for (const { a, b } of segments) {
            const length = Math.hypot(b.x - a.x, b.y - a.y), vertical = a.x === b.x;
            if (length < width + 12) continue;
            const samples = Math.max(1, Math.floor((length - width - 12) / 8));
            const fractions = Array.from({ length: samples + 1 }, (_, index) => ((width + 12) / 2 + index * (length - width - 12) / samples) / length).sort((a, b) => Math.abs(a - .5) - Math.abs(b - .5));
            for (const fraction of fractions) {
                const x = a.x + (b.x - a.x) * fraction, y = a.y + (b.y - a.y) * fraction;
                const shared = labels.some(other => other.element !== element && other.points.slice(1).some((end, index) => { const start = other.points[index] ?? end; const nearX = Math.max(Math.min(start.x, end.x), Math.min(x, Math.max(start.x, end.x))); const nearY = Math.max(Math.min(start.y, end.y), Math.min(y, Math.max(start.y, end.y))); return Math.hypot(x - nearX, y - nearY) < 12; }));
                if (shared) continue;
                const halo = { x: x - (vertical ? height : width) / 2 - 4, y: y - (vertical ? width : height) / 2 - 4, width: (vertical ? height : width) + 8, height: (vertical ? width : height) + 8 };
                if (halo.x < 0 || halo.y < 0 || halo.x + halo.width > bounds.width || halo.y + halo.height > bounds.height || occupied.some(box => overlaps(halo, box))) continue;
                element.setAttribute('x', String(x)); element.setAttribute('y', String(y)); element.setAttribute('dominant-baseline', 'central');
                if (vertical) element.setAttribute('transform', `rotate(-90 ${x} ${y})`); else element.removeAttribute('transform');
                occupied.push(halo); placed = true; break;
            }
            if (placed) break;
        }
        if (!placed) element.remove();
    }
}
