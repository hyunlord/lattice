export type LoopRoute = { readonly view: 'loop' | 'focus' | 'catalog'; readonly item?: string; readonly stage?: string; };

export function readLoopRoute(): LoopRoute {
    const params = new URLSearchParams(location.hash.split('?')[1]);
    const view = params.get('view');
    const item = params.get('item'); const stage = params.get('stage');
    return { view: view === 'focus' || view === 'catalog' ? view : 'loop', ...(item ? { item } : {}), ...(stage ? { stage } : {}) };
}

export function writeLoopRoute(values: Partial<LoopRoute>): void {
    const [path = '/home', search = ''] = (location.hash.slice(1) || '/home').split('?');
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) params.set(key, value);
    const hash = `#${path}?${params}`;
    if (hash !== location.hash) history.pushState(null, '', hash);
}
