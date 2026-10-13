import type { FirstImpression } from '../dist/query/first-impression-types.js';
import { firstImpressionPath } from './first-impression-members.js';
import { object, source } from './data.js';
const text = (value: unknown): value is string => typeof value === 'string';
const count = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const sources = (value: unknown): boolean => Array.isArray(value) && value.every(source);
const list = (value: unknown, check: (item: Record<string, unknown>) => boolean): boolean => Array.isArray(value) && value.every(item => object(item) && check(item));
const path = firstImpressionPath;
export function firstImpression(value: unknown, hash: string): value is FirstImpression {
    if (!object(value) || value['schemaVersion'] !== 1 || value['graphHash'] !== hash) return false;
    const purpose = value['purpose'];
    if (!object(purpose) || !text(purpose['text']) || !['source-description', 'inventory'].includes(String(purpose['basis'])) || !sources(purpose['sources'])) return false;
    return ['componentCount', 'fileCount', 'auxiliaryFileCount', 'entrypointCount', 'dependencyCount', 'unprojectedDependencyCount'].every(key => count(value[key]))
        && list(value['components'], item => text(item['id']) && text(item['title']) && text(item['description']) && ['source-description', 'public-names', 'inventory'].includes(String(item['basis'])) && count(item['fileCount']) && sources(item['sources']) && (item['claims'] === undefined || list(item['claims'], claim => text(claim['text']) && list(claim['citations'], citation => text(citation['path']) && text(citation['contentHash']) && count(citation['startLine']) && count(citation['endLine'])))) && path(item['membershipPath']) && list(item['memberPreview'], member => ['id', 'name', 'path'].every(key => text(member[key]))))
        && list(value['dependencies'], item => text(item['source']) && text(item['target']) && count(item['importingFileCount']) && count(item['declarationCount']) && sources(item['sources']))
        && list(value['entrypoints'], item => text(item['id']) && text(item['name']) && ['executable', 'public-api'].includes(String(item['category'])) && source(item['source']))
        && list(value['flows'], item => text(item['rootId']) && item['basis'] === 'static-call-graph' && typeof item['truncated'] === 'boolean' && list(item['nodes'], node => text(node['id']) && text(node['name']) && (node['source'] === undefined || source(node['source']))) && list(item['edges'], edge => ['id', 'source', 'target'].every(key => text(edge[key])) && sources(edge['sources'])))
        && list(value['stack'], item => text(item['name']) && ['language', 'manifest'].includes(String(item['basis'])) && count(item['fileCount']) && sources(item['sources']))
        && (value['remainder'] === undefined || object(value['remainder']) && count(value['remainder']['componentCount']) && count(value['remainder']['fileCount']) && path(value['remainder']['path']));
}
