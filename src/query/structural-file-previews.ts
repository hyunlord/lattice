import type { Edge, Node } from '../core/model.js';
import type { LoopFilePreview, LoopFileReference } from './loop-map-types.js';
import { plain } from '../adapters/markdown-inline.js';

const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
const records = (value: unknown): readonly Record<string, unknown>[] => Array.isArray(value) ? value.flatMap(item => { const parsed = record(item); return parsed ? [parsed] : []; }) : [];
const text = (value: unknown): string => typeof value === 'string' ? plain(value).replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '' : '';
const score = (node: Node): number => Math.max(0, ...records(node.attributes['publicNames']).map(name => typeof name['uses'] === 'number' ? name['uses'] : 0));
const entry = (node: Node): number => Number(Array.isArray(node.attributes['entryPoints']) && node.attributes['entryPoints'].length > 0);

export function structuralFilePreviews(nodes: readonly Node[], edges: readonly Edge[] = []): readonly LoopFilePreview[] {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const references = (id: string): readonly LoopFileReference[] => {
        const groups = new Map<string, { targetId: string; targetName: string; names: string[]; evidence: LoopFileReference['evidence'][number][]; }>();
        for (const edge of edges) {
            const target = byId.get(edge.target), name = edge.attributes?.['name'];
            if (edge.source !== id || edge.kind !== 'references' || edge.attributes?.['referenceKind'] !== 'declared-type' || !target || typeof name !== 'string') continue;
            const group = groups.get(target.id) ?? { targetId: target.id, targetName: (target.sources[0]?.path ?? target.name).split('/').at(-1) ?? target.name, names: [], evidence: [] };
            if (!group.names.includes(name)) group.names.push(name);
            for (const [index, source] of edge.sources.entries()) {
                const role = index === 0 ? 'use' : 'definition';
                if (!group.evidence.some(item => item.role === role && item.name === name && item.path === source.path && item.line === source.line)) group.evidence.push({ role, name, path: source.path, line: source.line, ...(source.url ? { url: source.url } : {}) });
            }
            groups.set(target.id, group);
        }
        return [...groups.values()].sort((a, b) => a.targetName.localeCompare(b.targetName));
    };
    return [...nodes].sort((a, b) => entry(b) - entry(a) || score(b) - score(a) || a.name.localeCompare(b.name)).slice(0, 3).map(node => {
        const source = node.sources[0], description = record(node.attributes['sourceDescription']);
        const prose = description?.['kind'] === 'module-doc' ? text(description['text']) : '';
        const summary = prose && !/^(?:\+build\b|go:build\b)/u.test(prose) ? prose : '';
        const named = records(node.attributes['publicNames']);
        const definitions = records(node.attributes['definitions']).filter(definition => definition['public'] === true && record(definition['declarationDescription']));
        const rank = (definition: Record<string, unknown>): number => { const index = named.findIndex(name => name['name'] === definition['name']); return index < 0 ? named.length : index; };
        const python = node.attributes['language'] === 'python';
        const exports = Array.isArray(node.attributes['declaredExports']) ? node.attributes['declaredExports'] : [];
        const stem = (source?.path.split('/').at(-1) ?? '').replace(/\.pyi?$/u, '').replace(/^_+|_/gu, '').toLowerCase();
        const alignment = (definition: Record<string, unknown>): number => python ? Number(exports.includes(definition['name'])) * 4 + Number(String(definition['name']).toLowerCase() === stem) * 2 + Number(definition['kind'] === 'type') : 0;
        definitions.sort((a, b) => alignment(b) - alignment(a) || rank(a) - rank(b));
        const selected = definitions[0], doc = record(selected?.['declarationDescription']), definitionText = text(doc?.['text']);
        const definition = selected && typeof selected['name'] === 'string' && definitionText ? { name: selected['name'], summary: definitionText, line: typeof doc?.['line'] === 'number' ? doc['line'] : typeof selected['line'] === 'number' ? selected['line'] : 1 } : undefined;
        const representative = python && !summary && definition ? `대표 ${selected?.['kind'] === 'type' ? '타입' : '함수'} ${definition.name} — ${definition.summary}` : '';
        return { references: references(node.id), id: node.id, name: (source?.path ?? node.name).split('/').at(-1) ?? node.name, summary: summary || representative || '파일 설명 없음 — 요약 실행 필요', summaryEvidence: (summary || representative) && source ? [{ path: source.path, line: representative ? definition?.line ?? source.line : typeof description?.['line'] === 'number' ? description['line'] : source.line }] : [], ...(definition ? { definition } : {}) };
    });
}
