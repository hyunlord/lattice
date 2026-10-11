import { writeOverviewParts } from './export-overview-parts.mjs';
import { thinStructuralOverview } from '../dist/query/thin-structural-model.js';
import { object } from './types.mjs';
import { createHash } from 'node:crypto';
import type { Graph } from '../dist/core/model.js';
import { parsePresentation } from '../dist/query/map-presentation.js';
import { buildLoopMap } from '../dist/query/loop-map-model.js';

// The overview is derived transport, never a replacement for the canonical graph.
export function writeOverview(graph: Pick<Graph, 'hash' | 'repository' | 'nodes' | 'edges' | 'facets'>, rawPresentation: unknown, write: (path: string, text: string) => void): void {
    const presentation = parsePresentation(rawPresentation);
    const diagnostics = object(rawPresentation) ? rawPresentation['inputDiagnostics'] : undefined;
    const limitations = Array.isArray(diagnostics) ? diagnostics.flatMap(item => object(item) && item['code'] === 'unsupported-language' && typeof item['language'] === 'string' && typeof item['fileCount'] === 'number' && Number.isSafeInteger(item['fileCount']) && item['fileCount'] > 0 ? [{ language: item['language'], fileCount: item['fileCount'] }] : []) : [];
    const hidden = new Set(presentation.kinds.filter(kind => kind.hidden).map(kind => kind.id));
    const visible = graph.nodes.filter(node => !hidden.has(node.kind));
    const layerIds = [...new Set(visible.map(node => String(node.attributes['layer'] ?? '')))];
    if (!layerIds.length) layerIds.push('');
    const layers = layerIds.map(id => {
        const nodes = visible.filter(node => String(node.attributes['layer'] ?? '') === id);
        const model = buildLoopMap(nodes, graph.edges, graph.facets, presentation, graph.repository.name, { projection: 'overview' });
        const text = JSON.stringify({ schemaVersion: 1, hash: graph.hash, repository: graph.repository, model });
        const path = `overview/${createHash('sha256').update(text).digest('hex')}.json`;
        write(path, text);
        const initial = thinStructuralOverview(model);
        const parts = model.structural ? writeOverviewParts(graph, model, id, write) : undefined;
        const labels = presentation.layers;
        const label = (Array.isArray(labels) ? labels.find(layer => layer.id === id)?.label : labels?.[id]?.label) ?? id;
        return { id, label, path, ...(parts ? { parts } : {}), deferred: Boolean(model.structural), model: initial };
    });
    write('overview.json', JSON.stringify({ schemaVersion: 1, hash: graph.hash, repository: graph.repository, limitations, defaultLayer: layerIds.includes(presentation.defaultLayer ?? '') ? presentation.defaultLayer ?? '' : layerIds[0], kinds: presentation.kinds, layers }));
}
