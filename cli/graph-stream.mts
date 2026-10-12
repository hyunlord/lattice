import { canonicalJson, GraphInputError } from '../dist/index.js';
import type { GraphDraft, Source } from '../dist/index.js';
import { edge, facet, finding, view, parseGraphEnvelope } from './decode-graph.mjs';
import { node } from './decode-values.mjs';
import { readJsonObject } from './json-stream.mjs';

/** Validate each record before retaining it; repeated evidence has one immutable identity. */
export function readGraphDraft(path: string): { readonly draft: GraphDraft; readonly hash: unknown; } {
    const sources = new Map<string, { readonly source: Source; readonly id: number; }>();
    const groups = new Map<string, readonly Source[]>();
    const share = <T extends { readonly sources: readonly Source[]; }>(record: T): T => {
        const ids: number[] = [], values: Source[] = [];
        for (const source of record.sources) {
            const key = canonicalJson(source);
            let existing = sources.get(key);
            if (!existing) { existing = { source, id: sources.size }; sources.set(key, existing); }
            ids.push(existing.id); values.push(existing.source);
        }
        const key = ids.join(',');
        const shared = groups.get(key) ?? values;
        groups.set(key, shared);
        return { ...record, sources: shared };
    };
    const nodes: GraphDraft['nodes'][number][] = [], edges: GraphDraft['edges'][number][] = [], facets: GraphDraft['facets'][number][] = [], findings: GraphDraft['findings'][number][] = [], views: GraphDraft['views'][number][] = [];
    const stored = readJsonObject(path, (key, value) => {
        switch (key) {
            case 'nodes': nodes.push(share(node(value))); return null;
            case 'edges': edges.push(share(edge(value))); return null;
            case 'facets': facets.push(share(facet(value))); return null;
            case 'findings': findings.push(share(finding(value))); return null;
            case 'views': views.push(share(view(value))); return null;
            default: return value;
        }
    });
    if (stored['schemaVersion'] !== 1) throw new Error(`Unsupported graph schema: ${path}`);
    for (const key of ['nodes', 'edges', 'facets', 'findings', 'views']) if (!Array.isArray(stored[key])) throw new GraphInputError('$cache', 'expected array');
    return { draft: { ...parseGraphEnvelope(stored), nodes, edges, facets, findings, views }, hash: stored['hash'] };
}
