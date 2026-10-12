// Frozen pre-A* routing oracle from66d0de4; test-only.
export function bfsRoute(start, end, space, expanded = []) {
    const step = 8;
    const columns = Math.ceil(space.width / step) + 1, rows = Math.ceil(space.height / step) + 1;
    const cell = (p) => Math.round(p.y / step) * columns + Math.round(p.x / step);
    const point = (index) => ({ x: index % columns * step, y: Math.floor(index / columns) * step });
    const from = cell(start), to = cell(end);
    const blocked = new Uint8Array(columns * rows);
    for (const box of space.obstacles)
        for (let y = Math.max(0, Math.ceil(box.y / step)); y <= Math.min(rows - 1, Math.floor((box.y + box.height) / step)); y++)
            for (let x = Math.max(0, Math.ceil(box.x / step)); x <= Math.min(columns - 1, Math.floor((box.x + box.width) / step)); x++)
                blocked[y * columns + x] = 1;
    blocked[from] = 0;
    blocked[to] = 0;
    const queue = [from], previous = new Map();
    previous.set(from, from);
    for (let index = 0; index < queue.length && !previous.has(to); index++) {
        const current = queue[index];
        if (current === undefined)
            continue;
        expanded.push(current);
        const x = current % columns, y = Math.floor(current / columns);
        const neighbors = [x > 0 ? current - 1 : -1, x < columns - 1 ? current + 1 : -1, y > 0 ? current - columns : -1, y < rows - 1 ? current + columns : -1].filter(n => n >= 0 && !blocked[n] && !previous.has(n) && !space.occupied?.has(current < n ? `${current}:${n}` : `${n}:${current}`));
        neighbors.sort((a, b) => { return Math.abs(a % columns * step - end.x) + Math.abs(Math.floor(a / columns) * step - end.y) - Math.abs(b % columns * step - end.x) - Math.abs(Math.floor(b / columns) * step - end.y); });
        for (const next of neighbors) {
            previous.set(next, current);
            queue.push(next);
        }
    }
    if (!previous.has(to))
        return [];
    const reversed = [];
    let current = to;
    while (current !== from) {
        reversed.push(point(current));
        const prior = previous.get(current);
        if (prior === undefined)
            return [];
        current = prior;
    }
    reversed.push(point(from));
    const route = [start, ...reversed.reverse(), end];
    return route.filter((p, index) => { const before = route[index - 1], after = route[index + 1]; return !before || !after || (before.x !== p.x || p.x !== after.x) && (before.y !== p.y || p.y !== after.y); });
}
