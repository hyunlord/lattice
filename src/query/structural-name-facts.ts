import type { Node } from '../core/model.js';

export function representativeNames(members: readonly Node[]): { readonly label: string; readonly text: string; } | undefined {
    const names = new Map<string, number>();
    for (const node of members) {
        const values = node.attributes['publicNames'];
        if (!Array.isArray(values)) continue;
        for (const value of values) {
            if (!value || typeof value !== 'object') continue;
            const name: unknown = Reflect.get(value, 'name'), uses: unknown = Reflect.get(value, 'uses');
            if (typeof name === 'string') names.set(name, (names.get(name) ?? 0) + (typeof uses === 'number' ? uses : 0));
        }
    }
    const selected = [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name);
    return selected.length ? { label: '대표 공개 이름', text: selected.join(' · ') } : undefined;
}
