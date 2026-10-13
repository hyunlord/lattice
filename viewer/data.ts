import { registerSourceGroups, type DeferredSourceGroup } from './source-groups.js';
import type { Node, Edge, Facet, Finding, Source, Snapshot, View, Repository } from '../dist/core/model.js';
import type { JsonObject, JsonValue } from '../dist/core/canonical.js';
export type BrowserGraph = { schemaVersion: 1; hash: string; nodes: Node[]; edges: Edge[]; facets: Facet[]; findings: Finding[]; views: View[]; repository: Repository; };
export { parsePresentation } from './map-presentation.js';
export type { Presentation } from './map-presentation.js';
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function arrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(check); }
function string(value: unknown): value is string { return typeof value === 'string'; }
function optionalString(value: unknown): value is string | undefined { return value === undefined || string(value); }
function json(value: unknown): value is JsonValue { return value === null || string(value) || typeof value === 'boolean' || typeof value === 'number' || (Array.isArray(value) ? value.every(json) : object(value) && Object.values(value).every(json)); }
function jsonObject(value: unknown): value is JsonObject { return object(value) && Object.values(value).every(json); }
export function source(value: unknown): value is Source { return object(value) && string(value['path']) && typeof value['line'] === 'number' && (value['endLine'] === undefined || typeof value['endLine'] === 'number') && string(value['pointer']) && string(value['contentHash']) && optionalString(value['revision']) && optionalString(value['url']); }
function node(value: unknown): value is Node { return object(value) && string(value['id']) && string(value['kind']) && string(value['name']) && string(value['contentHash']) && jsonObject(value['attributes']) && arrayOf(value['sources'], source); }
function edge(value: unknown): value is Edge { return object(value) && string(value['id']) && string(value['kind']) && string(value['source']) && string(value['target']) && typeof value['directed'] === 'boolean' && string(value['field']) && arrayOf(value['sources'], source) && (value['attributes'] === undefined || jsonObject(value['attributes'])); }
function facet(value: unknown): value is Facet { return object(value) && string(value['id']) && string(value['nodeId']) && string(value['key']) && json(value['value']) && string(value['ruleId']) && arrayOf(value['sources'], source); }
function gate(value: unknown): value is Finding['gate'] { return value === undefined || object(value) && string(value['metric']) && ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].some(item => item === value['comparator']) && typeof value['threshold'] === 'number' && ['pass', 'fail', 'unknown'].some(item => item === value['status']); }
function finding(value: unknown): value is Finding { return object(value) && string(value['id']) && string(value['ruleId']) && ['info', 'warning', 'error'].some(item => item === value['severity']) && arrayOf(value['targetIds'], string) && jsonObject(value['metrics']) && string(value['message']) && ['computed', 'authored-interpretation', 'source-support'].some(item => item === value['basis']) && arrayOf(value['sources'], source) && optionalString(value['intent']) && optionalString(value['implementation']) && gate(value['gate']); }
function view(value: unknown): value is View { return object(value) && string(value['id']) && ['matrix', 'cycle', 'distribution', 'table', 'gallery', 'status', 'graph'].some(item => item === value['type']) && string(value['label']) && optionalString(value['description']) && jsonObject(value['query']) && arrayOf(value['sources'], source); }
function repository(value: unknown): value is Repository { return object(value) && string(value['name']) && optionalString(value['commit']) && optionalString(value['remoteUrl']) && typeof value['dirty'] === 'boolean' && string(value['sourceFingerprint']); }
function attachEvidence(graph: BrowserGraph, value: unknown): void {
    if (value === undefined) return;
    if (!object(value) || value['version'] !== 1 || !object(value['groups']) || !object(value['records'])) throw new Error('근거 파일 목록 형식이 올바르지 않습니다.');
    const groups = new Map<string, DeferredSourceGroup>();
    for (const [id, entry] of Object.entries(value['groups'])) {
        if (!/^[a-f0-9]{64}$/u.test(id) || !object(entry) || typeof entry['count'] !== 'number' || !Number.isSafeInteger(entry['count']) || entry['count'] < 1 || !arrayOf(entry['pages'], string) || entry['pages'].length !== Math.ceil(entry['count'] / 128) || !entry['pages'].every(path => /^(?:evidence\/|records\/\d+\/\d+\/)[a-f0-9]{64}\.json$/u.test(path))) throw new Error('근거 페이지 목록 형식이 올바르지 않습니다.');
        groups.set(id, { id, count: entry['count'], pages: entry['pages'] });
    }
    for (const [kind, mapping] of Object.entries(value['records'])) {
        const entries = kind === 'edges' ? graph.edges : kind === 'facets' ? graph.facets : kind === 'findings' ? graph.findings : kind === 'views' ? graph.views : undefined;
        if (!entries || !object(mapping)) throw new Error('근거 레코드 목록 형식이 올바르지 않습니다.');
        const records = new Map(entries.map(record => [record.id, record.sources]));
        for (const [id, groupId] of Object.entries(mapping)) {
            const sources = records.get(id), group = typeof groupId === 'string' ? groups.get(groupId) : undefined;
            if (!sources || sources.length || !group) throw new Error('근거 레코드 참조가 올바르지 않습니다.');
            registerSourceGroups(sources, [group]);
        }
    }
}
export function parseGraph(value: unknown): BrowserGraph {
    if (!object(value) || value['schemaVersion'] !== 1 || !string(value['hash']) || !arrayOf(value['nodes'], node) || !arrayOf(value['edges'], edge) || !arrayOf(value['facets'], facet) || !arrayOf(value['findings'], finding) || !arrayOf(value['views'], view) || !repository(value['repository'])) throw new Error('지원하지 않거나 불완전한 그래프 형식입니다.');
    const graph: BrowserGraph = { schemaVersion: 1, hash: value['hash'], nodes: value['nodes'], edges: value['edges'], facets: value['facets'], findings: value['findings'], views: value['views'], repository: value['repository'] };
    attachEvidence(graph, value['evidence']);
    return graph;
}
function snapshot(value: unknown): value is Snapshot { return object(value) && string(value['id']) && /^[a-f0-9]{64}$/.test(value['id']) && value['artifactPath'] === `snapshots/${value['id']}.json` && string(value['graphHash']) && optionalString(value['commit']) && (value['lensHash'] === null || string(value['lensHash'])) && string(value['inputFingerprint']) && string(value['coverage']); }
export function parseSnapshots(value: unknown): Snapshot[] { return Array.isArray(value) ? value.filter(snapshot) : []; }
type Cell = { source: string; target: string; row: JsonValue | undefined; column: JsonValue | undefined; label: JsonValue | undefined; edgeIds: string[]; nodeIds: string[]; count: number; };
export function matrixData(value: JsonObject): { directed: boolean; rows: string[]; columns: string[]; cells: Cell[]; } {
    const rows = value['rows'], columns = value['columns'], cells = value['cells'];
    return { directed: Array.isArray(rows) && Array.isArray(columns), rows: arrayOf(rows, string) ? rows : [], columns: arrayOf(columns, string) ? columns : [], cells: Array.isArray(cells) ? cells.filter(jsonObject).map(cell => ({ source: string(cell['source']) ? cell['source'] : '', target: string(cell['target']) ? cell['target'] : '', row: cell['row'], column: cell['column'], label: cell['label'], edgeIds: arrayOf(cell['edgeIds'], string) ? cell['edgeIds'] : [], nodeIds: arrayOf(cell['nodeIds'], string) ? cell['nodeIds'] : [], count: typeof cell['count'] === 'number' ? cell['count'] : 0 })) : [] };
}
