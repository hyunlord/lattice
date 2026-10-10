import type { LoopShape, LoopTone, LoopFlow } from './loop-map-types.js';
export type LoopConfig = {
    subtitle?: string; defaultStage?: string; title?: string; lead?: string; center?: { title: string; description: string; }; statusFacet?: string;
    statusLabels?: { present?: string; absent?: string; unknown?: string; }; catalogKinds?: string[]; summaryFields?: string[];
    stages: { id: string; title: string; summary: string; unit: string; kinds: string[]; systemIds: string[]; groupBy?: string; }[];
    flows: LoopFlow[]; strips: { title: string; description: string; kinds: string[]; }[];
    places?: { title: string; description: string; kinds: string[]; };
    relationGroups: { label: string; side: 'left' | 'right'; kinds?: string[]; steps: { edgeKinds: string[]; direction: 'in' | 'out'; }[]; }[];
    kindStyles?: Record<string, { shape?: LoopShape; color?: LoopTone; }>;
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, fallback = '') => typeof v === 'string' ? v : fallback;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const objects = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.filter(object) : [];
export function loopConfig(value: unknown): LoopConfig | undefined {
    if (!object(value)) return undefined;
    const group = (v: Record<string, unknown>) => ({ title: text(v['title']), description: text(v['description']), kinds: strings(v['kinds']) });
    const center = value['center'], labels = value['statusLabels'];
    const styles: NonNullable<LoopConfig['kindStyles']> = {};
    if (object(value['kindStyles'])) for (const [kind, style] of Object.entries(value['kindStyles'])) {
        if (!object(style)) continue;
        const shape = style['shape'], color = style['color'];
        const shapes: LoopShape[] = ['diamond', 'square', 'circle', 'pill', 'star', 'triangle', 'flag', 'target', 'hexagon', 'house'];
        const colors: LoopTone[] = ['blue', 'green', 'amber', 'red', 'purple', 'gray', 'teal'];
        styles[kind] = { ...shapes.flatMap(s => s === shape ? [{ shape: s }] : [])[0], ...colors.flatMap(c => c === color ? [{ color: c }] : [])[0] };
    }
    return {
        ...(typeof value['subtitle'] === 'string' ? { subtitle: value['subtitle'] } : {}),
        ...(typeof value['defaultStage'] === 'string' ? { defaultStage: value['defaultStage'] } : {}),
        ...(typeof value['title'] === 'string' ? { title: value['title'] } : {}), ...(typeof value['lead'] === 'string' ? { lead: value['lead'] } : {}),
        ...(object(center) ? { center: { title: text(center['title']), description: text(center['description']) } } : {}),
        ...(typeof value['statusFacet'] === 'string' ? { statusFacet: value['statusFacet'] } : {}),
        ...(object(labels) ? { statusLabels: { ...(typeof labels['present'] === 'string' ? { present: labels['present'] } : {}), ...(typeof labels['absent'] === 'string' ? { absent: labels['absent'] } : {}), ...(typeof labels['unknown'] === 'string' ? { unknown: labels['unknown'] } : {}) } } : {}),
        ...(Array.isArray(value['catalogKinds']) ? { catalogKinds: strings(value['catalogKinds']) } : {}), ...(Array.isArray(value['summaryFields']) ? { summaryFields: strings(value['summaryFields']) } : {}),
        stages: objects(value['stages']).map(s => ({ id: text(s['id']), title: text(s['title']), summary: text(s['summary']), unit: text(s['unit']), kinds: strings(s['kinds']), systemIds: strings(s['systemIds']), ...(typeof s['groupBy'] === 'string' ? { groupBy: s['groupBy'] } : {}) })),
        flows: objects(value['flows']).map(f => ({ source: text(f['source']), target: text(f['target']), label: text(f['label']), tone: f['tone'] === 'warning' ? 'warning' : 'normal', auxiliary: f['auxiliary'] === true })),
        strips: objects(value['strips']).map(group), ...(object(value['places']) ? { places: group(value['places']) } : {}), kindStyles: styles,
        relationGroups: objects(value['relationGroups']).map(g => ({ label: text(g['label']), side: g['side'] === 'left' ? 'left' : 'right', ...(Array.isArray(g['kinds']) ? { kinds: strings(g['kinds']) } : {}), steps: objects(g['steps']).map(s => ({ edgeKinds: strings(s['edgeKinds']), direction: s['direction'] === 'in' ? 'in' : 'out' })) })),
    };
}
