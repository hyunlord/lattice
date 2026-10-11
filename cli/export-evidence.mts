import { createHash } from 'node:crypto';
import type { Graph, Source } from '../dist/core/model.js';
import type { DeferredSourceGroup } from '../dist/query/source-groups.js';
export function thinGraph(graph: Graph, write: (path: string, text: string) => void) {
    const groups: Record<string, Omit<DeferredSourceGroup, 'id'>> = {};
    const records: Record<string, Record<string, string>> = {};
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    const split = <T extends { readonly id: string; readonly sources: readonly Source[]; }>(kind: string, entries: readonly T[]): T[] => {
        const mapping = new Map<string, string>();
        const result = entries.map(record => {
            if (!record.sources.length || kind === 'edges' && 'attributes' in record && record.attributes !== null && typeof record.attributes === 'object' && 'referenceKind' in record.attributes && record.attributes.referenceKind === 'declared-type') return record;
            const id = digest(JSON.stringify(record.sources));
            mapping.set(record.id, id);
            if (!groups[id]) {
                const pages: string[] = [];
                for (let offset = 0; offset < record.sources.length; offset += 128) {
                    const text = JSON.stringify(record.sources.slice(offset, offset + 128));
                    const path = `evidence/${digest(text)}.json`; write(path, text); pages.push(path);
                }
                groups[id] = { count: record.sources.length, pages };
            }
            return { ...record, sources: [] };
        });
        records[kind] = Object.fromEntries(mapping);
        return result;
    };
    return { ...graph, edges: split('edges', graph.edges), facets: split('facets', graph.facets), findings: split('findings', graph.findings), views: split('views', graph.views), evidence: { version: 1, groups, records } };
}
