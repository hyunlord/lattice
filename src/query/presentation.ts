export type HomePresentation = { viewIds: string[]; findings?: boolean; inventory?: boolean; distributions?: boolean; };
export type DetailPresentation = {
    summaryFields: { label: string; path: string[]; }[];
    summaryFieldsByKind?: Record<string, { label: string; path: string[]; }[]>;
    relationships: { label: string; edgeKinds: string[]; direction: 'incoming' | 'outgoing' | 'both'; }[];
    rawAttributes: 'collapsed' | 'expanded';
};
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
export function homePresentation(value: unknown): HomePresentation | undefined {
    if (!object(value) || !strings(value['viewIds'])) return;
    const result: HomePresentation = { viewIds: value['viewIds'] };
    for (const key of ['findings', 'inventory', 'distributions'] as const) { const flag = value[key]; if (typeof flag === 'boolean') result[key] = flag; }
    return result;
}
export function detailPresentation(value: unknown): DetailPresentation | undefined {
    if (!object(value)) return;
    const summaryFields: DetailPresentation['summaryFields'] = [], relationships: DetailPresentation['relationships'] = [];
    if (Array.isArray(value['summaryFields'])) for (const field of value['summaryFields']) {
        if (object(field) && typeof field['label'] === 'string' && strings(field['path'])) summaryFields.push({ label: field['label'], path: field['path'] });
    }
    if (Array.isArray(value['relationships'])) for (const relation of value['relationships']) {
        if (!object(relation) || typeof relation['label'] !== 'string' || !strings(relation['edgeKinds'])) continue;
        const direction = relation['direction'];
        if (direction === 'incoming' || direction === 'outgoing' || direction === 'both') relationships.push({ label: relation['label'], edgeKinds: relation['edgeKinds'], direction });
    }
    const summaryFieldsByKind: NonNullable<DetailPresentation['summaryFieldsByKind']> = {};
    if (object(value['summaryFieldsByKind'])) for (const [kind, fields] of Object.entries(value['summaryFieldsByKind'])) {
        if (!Array.isArray(fields)) continue;
        summaryFieldsByKind[kind] = fields.flatMap(field => object(field) && typeof field['label'] === 'string' && strings(field['path']) ? [{ label: field['label'], path: field['path'] }] : []);
    }
    return { summaryFields, summaryFieldsByKind, relationships, rawAttributes: value['rawAttributes'] === 'expanded' ? 'expanded' : 'collapsed' };
}
