import type { Node, Edge, Facet, Finding, Source, Snapshot, View, Repository } from '../dist/core/model.js';
import type { JsonObject, JsonValue } from '../dist/core/canonical.js';
export type BrowserGraph = { schemaVersion: 1; hash: string; nodes: Node[]; edges: Edge[]; facets: Facet[]; findings: Finding[]; views: View[]; repository: Repository; };
type Kind = { id: string; label?: string; hidden?: boolean; columns?: string[]; };
type Layer = { id: string; label?: string; };
export type Presentation = { name?: string; description?: string; defaultLayer?: string; kinds: Kind[]; layers?: Layer[] | Record<string, { label?: string; }>; facets?: Record<string, { label?: string; values?: Record<string, string>; }>; };
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function arrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(check); }
function string(value: unknown): value is string { return typeof value === 'string'; }
function optionalString(value: unknown): value is string | undefined { return value === undefined || string(value); }
function json(value: unknown): value is JsonValue { return value === null || string(value) || typeof value === 'boolean' || typeof value === 'number' || (Array.isArray(value) ? value.every(json) : object(value) && Object.values(value).every(json)); }
function jsonObject(value: unknown): value is JsonObject { return object(value) && Object.values(value).every(json); }
function source(value: unknown): value is Source { return object(value) && string(value['path']) && typeof value['line'] === 'number' && (value['endLine'] === undefined || typeof value['endLine'] === 'number') && string(value['pointer']) && string(value['contentHash']) && optionalString(value['revision']) && optionalString(value['url']); }
function node(value: unknown): value is Node { return object(value) && string(value['id']) && string(value['kind']) && string(value['name']) && string(value['contentHash']) && jsonObject(value['attributes']) && arrayOf(value['sources'], source); }
function edge(value: unknown): value is Edge { return object(value) && string(value['id']) && string(value['kind']) && string(value['source']) && string(value['target']) && typeof value['directed'] === 'boolean' && string(value['field']) && arrayOf(value['sources'], source) && (value['attributes'] === undefined || jsonObject(value['attributes'])); }
function facet(value: unknown): value is Facet { return object(value) && string(value['id']) && string(value['nodeId']) && string(value['key']) && json(value['value']) && string(value['ruleId']) && arrayOf(value['sources'], source); }
function gate(value: unknown): value is Finding['gate'] { return value === undefined || object(value) && string(value['metric']) && ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].some(item => item === value['comparator']) && typeof value['threshold'] === 'number' && ['pass', 'fail', 'unknown'].some(item => item === value['status']); }
function finding(value: unknown): value is Finding { return object(value) && string(value['id']) && string(value['ruleId']) && ['info', 'warning', 'error'].some(item => item === value['severity']) && arrayOf(value['targetIds'], string) && jsonObject(value['metrics']) && string(value['message']) && ['computed', 'authored-interpretation', 'source-support'].some(item => item === value['basis']) && arrayOf(value['sources'], source) && optionalString(value['intent']) && optionalString(value['implementation']) && gate(value['gate']); }
function view(value: unknown): value is View { return object(value) && string(value['id']) && ['matrix', 'cycle', 'distribution', 'table'].some(item => item === value['type']) && string(value['label']) && optionalString(value['description']) && jsonObject(value['query']) && arrayOf(value['sources'], source); }
function repository(value: unknown): value is Repository { return object(value) && string(value['name']) && optionalString(value['commit']) && optionalString(value['remoteUrl']) && typeof value['dirty'] === 'boolean' && string(value['sourceFingerprint']); }
export function parseGraph(value: unknown): BrowserGraph {
    if (!object(value) || value['schemaVersion'] !== 1 || !string(value['hash']) || !arrayOf(value['nodes'], node) || !arrayOf(value['edges'], edge) || !arrayOf(value['facets'], facet) || !arrayOf(value['findings'], finding) || !arrayOf(value['views'], view) || !repository(value['repository'])) throw new Error('지원하지 않거나 불완전한 그래프 형식입니다.');
    return { schemaVersion: 1, hash: value['hash'], nodes: value['nodes'], edges: value['edges'], facets: value['facets'], findings: value['findings'], views: value['views'], repository: value['repository'] };
}
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
    return result;
}
function snapshot(value: unknown): value is Snapshot { return object(value) && string(value['id']) && /^[a-f0-9]{64}$/.test(value['id']) && value['artifactPath'] === `snapshots/${value['id']}.json` && string(value['graphHash']) && optionalString(value['commit']) && (value['lensHash'] === null || string(value['lensHash'])) && string(value['inputFingerprint']) && string(value['coverage']); }
export function parseSnapshots(value: unknown): Snapshot[] { return Array.isArray(value) ? value.filter(snapshot) : []; }
type Cell = { source: string; target: string; row: JsonValue | undefined; column: JsonValue | undefined; label: JsonValue | undefined; edgeIds: string[]; nodeIds: string[]; count: number; };
export function matrixData(value: JsonObject): { directed: boolean; rows: string[]; columns: string[]; cells: Cell[]; } {
    const rows = value['rows'], columns = value['columns'], cells = value['cells'];
    return { directed: Array.isArray(rows) && Array.isArray(columns), rows: arrayOf(rows, string) ? rows : [], columns: arrayOf(columns, string) ? columns : [], cells: Array.isArray(cells) ? cells.filter(jsonObject).map(cell => ({ source: string(cell['source']) ? cell['source'] : '', target: string(cell['target']) ? cell['target'] : '', row: cell['row'], column: cell['column'], label: cell['label'], edgeIds: arrayOf(cell['edgeIds'], string) ? cell['edgeIds'] : [], nodeIds: arrayOf(cell['nodeIds'], string) ? cell['nodeIds'] : [], count: typeof cell['count'] === 'number' ? cell['count'] : 0 })) : [] };
}
