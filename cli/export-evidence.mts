import { writeJson } from './export-json.mjs';
import { createHash } from 'node:crypto';
import type { Graph, Source } from '../dist/core/model.js';
import type { DeferredSourceGroup } from '../dist/query/source-groups.js';
function evidenceWriter(write: (path: string, text: string) => void) {
    const groups: Record<string, Omit<DeferredSourceGroup, 'id'>> = {};
    const records: Record<string, Record<string, string>> = {};
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    const split = <T extends { readonly id: string; readonly sources: readonly Source[]; }>(kind: string, record: T): T => {
        const mapping = records[kind] ??= {};
        if (!record.sources.length || kind === 'edges' && 'attributes' in record && record.attributes !== null && typeof record.attributes === 'object' && 'referenceKind' in record.attributes && record.attributes.referenceKind === 'declared-type') return record;
        const hash = createHash('sha256');
        writeJson(record.sources, text => { hash.update(text); });
        const id = hash.digest('hex');
        Object.defineProperty(mapping, record.id, { value: id, enumerable: true, configurable: true });
        if (!groups[id]) {
            const pages: string[] = [];
            for (let offset = 0; offset < record.sources.length; offset += 128) {
                const text = JSON.stringify(record.sources.slice(offset, offset + 128));
                const path = `evidence/${digest(text)}.json`; write(path, text); pages.push(path);
            }
            groups[id] = { count: record.sources.length, pages };
        }
        return { ...record, sources: [] };
    };
    for (const kind of ['edges', 'facets', 'findings', 'views']) records[kind] = {};
    return { split, evidence: { version: 1, groups, records } };
}
export function thinGraph(graph: Graph, write: (path: string, text: string) => void) {
    const { split, evidence } = evidenceWriter(write);
    return { ...graph, edges: graph.edges.map(record => split('edges', record)), facets: graph.facets.map(record => split('facets', record)), findings: graph.findings.map(record => split('findings', record)), views: graph.views.map(record => split('views', record)), evidence };
}

export function writeThinGraph(graph: Graph, writeEvidence: (path: string, text: string) => void, write: (text: string) => void): void {
    const { split, evidence } = evidenceWriter(writeEvidence);
    write('{'); let separator = '';
    for (const [key, value] of Object.entries(graph)) {
        if (value === undefined) continue;
        write(`${separator}${JSON.stringify(key)}:`);
        if (key === 'edges' || key === 'facets' || key === 'findings' || key === 'views') {
            write('['); let comma = '';
            for (const record of graph[key]) { write(comma); writeJson(split(key, record), write); comma = ','; }
            write(']');
        } else writeJson(value, write);
        separator = ',';
    }
    write(`${separator}"evidence":`); writeJson(evidence, write); write('}');
}
