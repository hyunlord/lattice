import { loopConfig, type LoopConfig } from './loop-config.js';
import { parseMediaManifest, type MediaManifest } from './media-model.js';
import { pictureMapConfig, type PictureMapConfig } from './picture-map-model.js';
import { homePresentation, detailPresentation, type HomePresentation, type DetailPresentation } from './presentation.js';
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function arrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(check); }
function string(value: unknown): value is string { return typeof value === 'string'; }
function optionalString(value: unknown): value is string | undefined { return value === undefined || string(value); }
type Kind = { id: string; label?: string; hidden?: boolean; columns?: string[]; };
type Layer = { id: string; label?: string; };
export type Presentation = { loop?: LoopConfig; mediaManifest?: MediaManifest; interpretations?: { targetId: string; summary: string; status: string; sources: { path: string; line?: number; url?: string; }[]; }[]; pictureMap?: PictureMapConfig; home?: HomePresentation; detail?: DetailPresentation; name?: string; description?: string; defaultLayer?: string; kinds: Kind[]; layers?: Layer[] | Record<string, { label?: string; }>; facets?: Record<string, { label?: string; values?: Record<string, string>; }>; };
function kind(value: unknown): value is Kind { return object(value) && string(value['id']) && optionalString(value['label']) && (value['hidden'] === undefined || typeof value['hidden'] === 'boolean') && (value['columns'] === undefined || arrayOf(value['columns'], string)); }
function layer(value: unknown): value is Layer { return object(value) && string(value['id']) && optionalString(value['label']); }
function labels(value: unknown): value is Record<string, { label?: string; }> { return object(value) && Object.values(value).every(item => object(item) && optionalString(item['label'])); }
function facetLabels(value: unknown): value is NonNullable<Presentation['facets']> { return object(value) && Object.values(value).every(item => object(item) && optionalString(item['label']) && (item['values'] === undefined || object(item['values']) && Object.values(item['values']).every(string))); }
export function parsePresentation(value: unknown): Presentation {
    if (!object(value)) return { kinds: [] };
    const result: Presentation = { kinds: arrayOf(value['kinds'], kind) ? value['kinds'] : [] };
    if (string(value['name'])) result.name = value['name'];
    if (string(value['description'])) result.description = value['description'];
    if (string(value['defaultLayer'])) result.defaultLayer = value['defaultLayer'];
    if (arrayOf(value['layers'], layer) || labels(value['layers'])) result.layers = value['layers'];
    if (facetLabels(value['facets'])) result.facets = value['facets'];
    const home = homePresentation(value['home']), detail = detailPresentation(value['detail']);
    const loop = loopConfig(value['loop']); if (loop) result.loop = loop;
    result.mediaManifest = parseMediaManifest(value['mediaManifest']);
    if (Array.isArray(value['interpretations'])) result.interpretations = value['interpretations'].filter(object).flatMap(note => typeof note['targetId'] === 'string' && typeof note['summary'] === 'string' && typeof note['status'] === 'string' ? [{ targetId: note['targetId'], summary: note['summary'], status: note['status'], sources: Array.isArray(note['sources']) ? note['sources'].filter(object).flatMap(source => typeof source['path'] === 'string' ? [{ path: source['path'], ...(typeof source['line'] === 'number' ? { line: source['line'] } : {}), ...(typeof source['url'] === 'string' ? { url: source['url'] } : {}) }] : []) : [] }] : []);
    const pictureMap = pictureMapConfig(value['pictureMap']); if (pictureMap) result.pictureMap = pictureMap;
    if (home) result.home = home;
    if (detail) result.detail = detail;
    return result;
}
