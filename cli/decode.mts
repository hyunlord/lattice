import { GraphInputError } from '../dist/index.js';
import type { Graph, Node, ExtractedRecord, MarkdownDocument, CodeModule } from '../dist/index.js';
import { record, text, bool, list, optional, source, node } from './decode-values.mjs';
import { parseGraph, edge } from './decode-graph.mjs';
export { parseGraph, parseSnapshots } from './decode-graph.mjs';

export function parseStoredGraph(value: unknown): Graph {
    const item = record(value);
    if (item['schemaVersion'] !== 1) throw new GraphInputError('$cache/schemaVersion', 'expected schema version 1');
    const nodes = list(item['nodes'], (entry): Node => ({ ...node(entry), contentHash: text(record(entry)['contentHash']) }));
    return { ...parseGraph(value), schemaVersion: 1, hash: text(item['hash']), nodes };
}
export function parseRecords(value: unknown): readonly ExtractedRecord[] {
    return list(value, entry => {
        const item = record(entry);
        const references = optional(item['references'], bool);
        return { node: node(item['node']), fields: Object.fromEntries(Object.entries(record(item['fields'])).map(([key, value]) => [key, source(value)])), ...(references === undefined ? {} : { references }) };
    });
}
export function parseDocument(value: unknown): MarkdownDocument {
    const item = record(value);
    return {
        nodes: list(item['nodes'], node), edges: list(item['edges'], edge), links: list(item['links'], entry => {
            const link = record(entry);
            return { sourceId: text(link['sourceId']), target: text(link['target']), source: source(link['source']) };
        })
    };
}
export function parseModule(value: unknown): CodeModule {
    const item = record(value);
    return {
        node: node(item['node']), language: text(item['language']), imports: list(item['imports'], entry => {
            const imported = record(entry);
            const member = optional(imported['member'], text);
            const scope = optional(imported['scope'], text), form = optional(imported['form'], text);
            return { specifier: text(imported['specifier']), source: source(imported['source']), ...(member === undefined ? {} : { member }), ...(scope === undefined ? {} : { scope }), ...(form === undefined ? {} : { form }) };
        })
    };
}
