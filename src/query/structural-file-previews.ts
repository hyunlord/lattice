import type { Node } from '../core/model.js';
import type { LoopFilePreview } from './loop-map-types.js';
import { plain } from '../adapters/markdown-inline.js';

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
const records = (value: unknown): readonly Record<string, unknown>[] => Array.isArray(value) ? value.flatMap(item => { const parsed = record(item); return parsed ? [parsed] : []; }) : [];
const text = (value: unknown): string => typeof value === 'string' ? plain(value).replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '' : '';
const score = (node: Node): number => Math.max(0, ...records(node.attributes['publicNames']).map(name => typeof name['uses'] === 'number' ? name['uses'] : 0));
const entry = (node: Node): number => Number(Array.isArray(node.attributes['entryPoints']) && node.attributes['entryPoints'].length > 0);

export function structuralFilePreviews(nodes: readonly Node[]): readonly LoopFilePreview[] {
    return [...nodes].sort((a, b) => entry(b) - entry(a) || score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 3).map(node => {
        const source = node.sources[0], description = record(node.attributes['sourceDescription']);
        const prose = description?.['kind'] === 'module-doc' ? text(description['text']) : '';
        const summary = prose && !/^(?:\+build\b|go:build\b)/u.test(prose) ? prose : '';
        const named = records(node.attributes['publicNames']);
        const definitions = records(node.attributes['definitions']).filter(definition => definition['public'] === true && record(definition['declarationDescription']));
        const rank = (definition: Record<string, unknown>): number => { const index = named.findIndex(name => name['name'] === definition['name']); return index < 0 ? named.length : index; };
        definitions.sort((a, b) => rank(a) - rank(b));
        const selected = definitions[0], doc = record(selected?.['declarationDescription']), definitionText = text(doc?.['text']);
        const definition = selected && typeof selected['name'] === 'string' && definitionText ? { name: selected['name'], summary: definitionText, line: typeof doc?.['line'] === 'number' ? doc['line'] : typeof selected['line'] === 'number' ? selected['line'] : 1 } : undefined;
        return { id: node.id, name: (source?.path ?? node.name).split('/').at(-1) ?? node.name, summary: summary || '파일 설명 없음 — 요약 실행 필요', summaryEvidence: summary && source ? [{ path: source.path, line: typeof description?.['line'] === 'number' ? description['line'] : source.line }] : [], ...(definition ? { definition } : {}) };
    });
}
