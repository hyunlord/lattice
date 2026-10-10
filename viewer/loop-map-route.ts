export type LoopRoute = { readonly view: 'loop' | 'focus' | 'catalog'; readonly item?: string; readonly stage?: string; readonly scope?: 'production' | 'all'; readonly parent?: string; readonly page?: number; };

export function readLoopRoute(): LoopRoute {
    const params = new URLSearchParams(location.hash.split('?')[1]);
    const view = params.get('view'); const parent = params.get('parent'); const page = Number(params.get('page') ?? NaN);
    const scope = params.get('scope'); const item = params.get('item'); const stage = params.get('stage');
    return { ...(parent ? { parent } : {}), ...(Number.isSafeInteger(page) && page >= 0 ? { page } : {}), view: view === 'focus' || view === 'catalog' ? view : 'loop', ...(item ? { item } : {}), ...(stage ? { stage } : {}), ...(scope === 'production' || scope === 'all' ? { scope } : {}) };
}

export function writeLoopRoute(values: Partial<LoopRoute>): void {
    const [path = '/home', search = ''] = (location.hash.slice(1) || '/home').split('?');
    const params = new URLSearchParams(search);
    for (const [key, value] of Object.entries(values)) { if (value === '') params.delete(key); else params.set(key, String(value)); }
    const hash = `#${path}?${params}`;
    if (hash !== location.hash) history.pushState(null, '', hash);
}
