import type { Node, Facet, Source } from '../dist/core/model.js';
import type { JsonValue } from '../dist/core/canonical.js';
import type { Presentation } from './data.js';

export type Column = { readonly id: string; readonly label: string; readonly type: 'attribute' | 'facet'; readonly key: string; };
export type ValueOption = { readonly key: string; readonly label: string; readonly count: number; };
function array(value: JsonValue): value is readonly JsonValue[] { return Array.isArray(value); }
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export function valueKey(value: JsonValue | undefined): string {
    if (value === undefined) return '@missing';
    if (array(value)) return `[${value.map(valueKey).join(',')}]`;
    if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort(compareText).map(key => `${JSON.stringify(key)}:${valueKey(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
export function valueLabel(value: JsonValue | undefined): string { return value === undefined ? '(없음)' : valueKey(value); }
function column(id: string): Column {
    const type = id.startsWith('facet:') ? 'facet' : 'attribute';
    const key = id.startsWith(`${type}:`) ? id.slice(type.length + 1) : id;
    return { id: `${type}:${key}`, label: key, type, key };
}
export function cellValue(node: Node, column: Column, facets: readonly Facet[]): { readonly value: JsonValue | undefined; readonly sources: readonly Source[]; } {
    switch (column.type) {
        case 'attribute': return { value: node.attributes[column.key], sources: node.attributes[column.key] === undefined ? [] : node.sources };
        case 'facet': {
            const selected = facets.filter(facet => facet.nodeId === node.id && facet.key === column.key);
            const values = [...new Map(selected.map(facet => [valueKey(facet.value), facet.value])).entries()].sort(([a], [b]) => compareText(a, b)).map(([, value]) => value);
            const sources = [...new Map(selected.flatMap(facet => facet.sources).map(source => [JSON.stringify(source), source])).values()];
            return { value: values.length > 1 ? values : values[0], sources };
        }
    }
}
function scalar(value: JsonValue | undefined): boolean { return value !== undefined && (value === null || typeof value !== 'object') && (typeof value !== 'string' || value.length <= 100); }
function automaticColumns(nodes: readonly Node[]): Column[] {
    const counts = new Map<string, number>();
    for (const node of nodes) for (const [key, value] of Object.entries(node.attributes)) if (!['id', 'name', 'kind'].includes(key) && scalar(value)) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts].sort(([a, countA], [b, countB]) => countB - countA || compareText(a, b)).slice(0, 2).map(([key]) => column(`attribute:${key}`));
}
function options(values: readonly (JsonValue | undefined)[]): ValueOption[] {
    const buckets = new Map<string, ValueOption>();
    for (const value of values) { const key = valueKey(value); buckets.set(key, { key, label: valueLabel(value), count: (buckets.get(key)?.count ?? 0) + 1 }); }
    return [...buckets.values()].sort((a, b) => compareText(a.key, b.key));
}
function compareValues(a: JsonValue | undefined, b: JsonValue | undefined, direction: 'asc' | 'desc'): number {
    if (a === undefined || a === null || b === undefined || b === null) {
        const rank = (value: JsonValue | undefined) => value === undefined ? 2 : value === null ? 1 : 0;
        return rank(a) - rank(b);
    }
    const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : compareText(typeof a, typeof b) || compareText(typeof a === 'string' ? a : valueKey(a), typeof b === 'string' ? b : valueKey(b));
    return direction === 'desc' ? -comparison : comparison;
}
export function projectList(nodes: readonly Node[], facets: readonly Facet[], kinds: Presentation['kinds'], params: URLSearchParams) {
    const kind = params.get('kind') ?? '', q = (params.get('q') ?? '').toLowerCase();
    const hidden = new Set(kinds.filter(entry => entry.hidden).map(entry => entry.id));
    const scope = nodes.filter(node => !hidden.has(node.kind) && (!kind || node.kind === kind));
    const kindIds = [...new Set(scope.map(node => node.kind))].sort(compareText);
    const unconfigured = new Set(kindIds.filter(id => kinds.find(entry => entry.id === id)?.columns === undefined));
    const configured = kindIds.flatMap(id => (kinds.find(entry => entry.id === id)?.columns ?? []).filter(id => !['id', 'name', 'kind'].includes(id)).map(column));
    const columns = [...new Map([...configured, ...automaticColumns(scope.filter(node => unconfigured.has(node.kind)))].map(entry => [entry.id, entry])).values()];
    const fields = [...new Set(scope.flatMap(node => Object.entries(node.attributes).filter(([, value]) => value === null || typeof value !== 'object').map(([key]) => key)))].sort(compareText).map(key => column(`attribute:${key}`));
    const fieldId = params.get('field') ?? '', field = fields.find(entry => entry.id === fieldId || entry.key === fieldId);
    const facetKey = params.get('facet') ?? '', scopedIds = new Set(scope.map(node => node.id));
    const scopedFacets = facets.filter(facet => scopedIds.has(facet.nodeId));
    const facetsByNode = new Map<string, Facet[]>();
    for (const facet of scopedFacets) { const entries = facetsByNode.get(facet.nodeId) ?? []; entries.push(facet); facetsByNode.set(facet.nodeId, entries); }
    const facetValues = options([...new Map(scopedFacets.filter(facet => facet.key === facetKey).map(facet => [valueKey([facet.nodeId, facet.value]), facet.value])).values()]);
    const fieldValues = field ? options(scope.map(node => node.attributes[field.key])) : [];
    const rawSort = params.get('sort') ?? 'name', sort = rawSort === 'name-desc' ? 'name' : rawSort;
    const direction: 'asc' | 'desc' = rawSort === 'name-desc' || params.get('dir') === 'desc' ? 'desc' : 'asc';
    const sortable = [...columns, ...fields], sortColumn = sortable.find(entry => entry.id === sort);
    let unsupported: string | undefined;
    if (kind && !scope.length && !nodes.some(node => node.kind === kind && !hidden.has(node.kind))) unsupported = `현재 층에 종류 ${kind}가 없습니다.`;
    if (fieldId && !field) unsupported = `현재 종류에 필드 ${fieldId}가 없습니다.`;
    if (facetKey && !scopedFacets.some(facet => facet.key === facetKey)) unsupported = `현재 종류에 분류 ${facetKey}가 없습니다.`;
    if (!['name', 'id', 'kind'].includes(sort) && !sortColumn) unsupported = `정렬 필드 ${sort}가 없습니다.`;
    const fieldValue = params.get('fieldValue') || null, facetValue = params.get('value') || null;
    if (field && fieldValue !== null && !fieldValues.some(value => value.key === fieldValue)) unsupported = `필드 값 ${fieldValue}가 현재 종류에 없습니다.`;
    const selected = unsupported ? [] : scope.filter(node => {
        if (q && ![node.name, node.id, JSON.stringify(node.attributes), ...columns.filter(entry => entry.type === 'facet').map(entry => valueKey(cellValue(node, entry, facetsByNode.get(node.id) ?? []).value))].some(value => value.toLowerCase().includes(q))) return false;
        if (field && fieldValue !== null && valueKey(node.attributes[field.key]) !== fieldValue) return false;
        return !facetKey || (facetsByNode.get(node.id) ?? []).some(facet => facet.key === facetKey && (facetValue === null || (params.get('valueType') === 'json' ? valueKey(facet.value) === facetValue : (typeof facet.value === 'string' ? facet.value : JSON.stringify(facet.value)) === facetValue)));
    });
    const sortedValue = (node: Node): JsonValue | undefined => sortColumn ? cellValue(node, sortColumn, facetsByNode.get(node.id) ?? []).value : sort === 'id' ? node.id : sort === 'kind' ? node.kind : node.name;
    selected.sort((a, b) => compareValues(sortedValue(a), sortedValue(b), direction) || compareText(a.id, b.id));
    return { nodes: selected, scope, columns, fields, fieldValues, facetValues, unsupported, sort, direction };
}
