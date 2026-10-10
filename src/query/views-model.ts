import type { Node, Edge, Source, View } from '../core/model.js';
import type { JsonObject, JsonValue } from '../core/canonical.js';
export type Coverage = { readonly selected: number; readonly total: number; readonly excluded: number; };
export type Axis = { readonly key: string; readonly label: string; readonly nodeIds: readonly string[]; };
export type Bucket = Axis & { readonly count: number; readonly edgeIds: readonly string[]; readonly sources: readonly Source[]; };
export type Cell = { readonly row: string; readonly column: string; readonly count: number; readonly label: string; readonly nodeIds: readonly string[]; readonly edgeIds: readonly string[]; readonly sources: readonly Source[]; };
export type ViewColumn = { readonly id: string; readonly label: string; readonly role?: 'summary' | 'badge' | 'status'; };
type RowProjection<T extends 'table' | 'gallery' | 'status'> = { readonly type: T; readonly columns: readonly ViewColumn[]; readonly rows: readonly { readonly nodeId: string; readonly values: JsonObject; }[]; readonly edgeKinds?: readonly string[]; readonly coverage: Coverage; };
export type ViewProjection =
    | { readonly type: 'matrix'; readonly cellDisplay?: 'count' | 'label'; readonly mode: 'edges' | 'nodes'; readonly rows: readonly Axis[]; readonly columns: readonly Axis[]; readonly cells: readonly Cell[]; readonly coverage: Coverage; }
    | { readonly type: 'distribution'; readonly buckets: readonly Bucket[]; readonly coverage: Coverage; }
    | RowProjection<'table'> | RowProjection<'gallery'> | RowProjection<'status'>
    | { readonly type: 'graph'; readonly nodes: readonly Node[]; readonly edges: readonly Edge[]; readonly coverage: Coverage; }
    | { readonly type: 'cycle'; readonly nodes: readonly Node[]; readonly edges: readonly Edge[]; readonly coverage: Coverage; }
    | { readonly type: 'unsupported'; readonly reason: string; readonly coverage: Coverage; };
function object(value: JsonValue | undefined): value is JsonObject { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: JsonValue | undefined): value is string[] { return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string'); }
function objects(value: JsonValue | undefined): value is JsonObject[] { return Array.isArray(value) && value.every(object); }
function key(value: JsonValue | undefined): string {
    if (value === undefined) return 'missing';
    if (Array.isArray(value)) return '[' + value.map(key).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(name => JSON.stringify(name) + ':' + key(value[name])).join(',') + '}';
    return JSON.stringify(value);
}
function label(value: JsonValue | undefined): string { return value === undefined ? '미기재' : typeof value === 'string' ? value : key(value) + (typeof value === 'number' ? ' (숫자)' : typeof value === 'boolean' ? ' (논리)' : value === null ? ' (null)' : ''); }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function provenance(items: readonly { readonly sources: readonly Source[]; }[]): Source[] { return [...new Map(items.flatMap(item => item.sources).map(source => [JSON.stringify(source), source])).values()]; }
export function distributionFields(nodes: readonly Node[]): string[] {
    return ['@kind', ...[...new Set(nodes.flatMap(node => Object.entries(node.attributes).filter(([, value]) => value === null || typeof value !== 'object').map(([name]) => name)))].sort().filter(name => name !== '@kind')];
}
export function automaticViews(nodes: readonly Node[], edges: readonly Edge[], field = '@kind'): View[] {
    const byId = new Map(nodes.map(node => [node.id, node])), nodeIds = nodes.map(node => node.id);
    const cells = new Map<string, { row: string; column: string; edgeIds: string[]; }>();
    for (const edge of edges) {
        const source = byId.get(edge.source), target = byId.get(edge.target); if (!source || !target) continue;
        const pairs = edge.directed || source.kind === target.kind ? [[source.kind, target.kind]] : [[source.kind, target.kind], [target.kind, source.kind]];
        for (const [row, column] of pairs) { if (row === undefined || column === undefined) continue; const id = key([row, column]), cell = cells.get(id) ?? { row, column, edgeIds: [] }; cell.edgeIds.push(edge.id); cells.set(id, cell); }
    }
    const buckets = new Map<string, { value?: JsonValue; missing?: boolean; nodeIds: string[]; }>();
    for (const node of nodes) {
        const value = field === '@kind' ? node.kind : node.attributes[field], id = key(value);
        const bucket = buckets.get(id) ?? { ...(value === undefined ? { missing: true } : { value }), nodeIds: [] }; bucket.nodeIds.push(node.id); buckets.set(id, bucket);
    }
    return [
        { id: 'auto-kind-matrix', type: 'matrix', label: '종류 간 연결', description: '선택한 층의 실제 연결을 출발 종류와 도착 종류별로 셉니다.', query: { automatic: 'kind-matrix', nodeIds, cells: [...cells.values()] }, sources: provenance([...nodes, ...edges]) },
        { id: 'auto-field-distribution', type: 'distribution', label: '필드 분포', description: '값의 자료형과 미기재를 구분한 노드 분포입니다.', query: { automatic: 'field-distribution', field, nodeIds, buckets: [...buckets.values()] }, sources: provenance(nodes) },
    ];
}
export function normalizeView(view: View, nodes: readonly Node[], edges: readonly Edge[]): ViewProjection {
    const query = view.query, ids = query['nodeIds'];
    const all = new Map(nodes.map(node => [node.id, node])), selectedIds = new Set(strings(ids) ? ids.filter(id => all.has(id)) : []);
    const selected = nodes.filter(node => selectedIds.has(node.id)), total = strings(ids) ? unique(ids).length : 0;
    const coverage = { selected: selected.length, total, excluded: total - selected.length };
    const unsupported = (reason: string): ViewProjection => ({ type: 'unsupported', reason, coverage });
    if (!strings(ids)) return unsupported('보기 입력 nodeIds가 없거나 올바르지 않습니다.');
    const links = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target));
    const byEdge = new Map(links.map(edge => [edge.id, edge]));
    const members = (value: readonly string[]) => unique(value).filter(id => selectedIds.has(id));
    const evidence = (nodeIds: readonly string[], edgeIds: readonly string[]) => provenance([...selected.filter(node => nodeIds.includes(node.id)), ...links.filter(edge => edgeIds.includes(edge.id))]);
    switch (view.type) {
        case 'gallery': case 'status': case 'table': {
            const columns = query['columns'], rows = query['rows'];
            if (!objects(columns) || !objects(rows)) return unsupported('표 열 또는 행이 없습니다.');
            const normalizedColumns: ViewColumn[] = [], normalizedRows: { nodeId: string; values: JsonObject; }[] = [];
            for (const column of columns) { const id = column['id'], name = column['label']; if (typeof id !== 'string' || typeof name !== 'string') return unsupported('표 열의 이름이 올바르지 않습니다.'); const role = column['role']; if (role !== undefined && role !== 'summary' && role !== 'badge' && role !== 'status') return unsupported('Invalid column role'); normalizedColumns.push({ id, label: name, ...(role === undefined ? {} : { role }) }); }
            for (const row of rows) { const nodeId = row['nodeId'], values = row['values']; if (typeof nodeId !== 'string' || !object(values) || normalizedColumns.some(column => values[column.id] === undefined)) return unsupported('표 행의 값이 불완전합니다.'); if (selectedIds.has(nodeId)) normalizedRows.push({ nodeId, values }); }
            const edgeKinds = query['edgeKinds']; if (edgeKinds !== undefined && !strings(edgeKinds)) return unsupported('Invalid relationship kinds');
            return { type: view.type, columns: normalizedColumns, rows: normalizedRows, ...(edgeKinds === undefined ? {} : { edgeKinds }), coverage };
        }
        case 'graph': case 'cycle': {
            const edgeIds = query['edgeIds']; if (!strings(edgeIds)) return unsupported('순환 보기의 edgeIds가 없습니다.');
            const wanted = new Set(edgeIds); return { type: view.type, nodes: selected, edges: links.filter(edge => wanted.has(edge.id)), coverage };
        }
        case 'distribution': {
            const data = query['buckets']; if (!objects(data)) return unsupported('분포 구간이 없습니다.');
            const buckets: Bucket[] = [];
            for (const bucket of data) {
                const rawIds = bucket['nodeIds'], value = bucket['value'];
                if (!strings(rawIds) || value === undefined && !(query['automatic'] === 'field-distribution' && bucket['missing'] === true)) return unsupported('분포 구간의 값 또는 입력 노드가 없습니다.');
                const nodeIds = members(rawIds); if (!nodeIds.length) continue;
                buckets.push({ key: key(value), label: label(value), nodeIds, count: nodeIds.length, edgeIds: [], sources: evidence(nodeIds, []) });
            }
            return { type: 'distribution', buckets: buckets.sort((a, b) => a.key.localeCompare(b.key)), coverage };
        }
        case 'matrix': {
            const data = query['cells']; if (!objects(data)) return unsupported('행렬 칸이 없습니다.');
            const rows: Axis[] = [], columns: Axis[] = [], cells: Cell[] = [];
            const directed = query['rows'] !== undefined || query['columns'] !== undefined;
            const automatic = query['automatic'] === 'kind-matrix';
            if (directed) {
                const rowIds = query['rows'], columnIds = query['columns']; if (!strings(rowIds) || !strings(columnIds)) return unsupported('행렬 축이 올바르지 않습니다.');
                for (const id of members(rowIds)) rows.push({ key: id, label: all.get(id)?.name ?? id, nodeIds: [id] });
                for (const id of members(columnIds)) columns.push({ key: id, label: all.get(id)?.name ?? id, nodeIds: [id] });
            } else if (automatic) {
                for (const kind of [...new Set(selected.map(node => node.kind))].sort()) { const axis = { key: key(kind), label: kind, nodeIds: selected.filter(node => node.kind === kind).map(node => node.id) }; rows.push(axis); columns.push(axis); }
            }
            for (const cell of data) {
                let row: string, column: string, nodeIds: string[], edgeIds: string[];
                if (directed || automatic) {
                    const from = cell[directed ? 'source' : 'row'], to = cell[directed ? 'target' : 'column'], rawEdges = cell['edgeIds'];
                    if (typeof from !== 'string' || typeof to !== 'string' || !strings(rawEdges)) return unsupported('연결 행렬의 끝점 또는 간선 근거가 없습니다.');
                    row = directed ? from : key(from); column = directed ? to : key(to);
                    edgeIds = unique(rawEdges).filter(id => { const edge = byEdge.get(id); if (!edge) return false; const source = directed ? edge.source : all.get(edge.source)?.kind, target = directed ? edge.target : all.get(edge.target)?.kind; return source === from && target === to || !edge.directed && source === to && target === from; });
                    nodeIds = unique(edgeIds.flatMap(id => { const edge = byEdge.get(id); return edge ? [edge.source, edge.target] : []; }));
                    if (!rows.some(axis => axis.key === row) || !columns.some(axis => axis.key === column) || !edgeIds.length) continue;
                } else {
                    const from = cell['row'], to = cell['column'], rawNodes = cell['nodeIds'];
                    if (from === undefined || to === undefined || !strings(rawNodes)) return unsupported('분류 행렬의 값 또는 입력 노드가 없습니다.');
                    row = key(from); column = key(to); nodeIds = members(rawNodes); edgeIds = []; if (!nodeIds.length) continue;
                    for (const [axes, value, id] of [[rows, from, row], [columns, to, column]] as const) {
                        const previous = axes.find(axis => axis.key === id); const combined = unique([...(previous?.nodeIds ?? []), ...nodeIds]);
                        if (previous) axes.splice(axes.indexOf(previous), 1); axes.push({ key: id, label: label(value), nodeIds: combined });
                    }
                }
                cells.push({ row, column, count: directed || automatic ? edgeIds.length : nodeIds.length, label: typeof cell['label'] === 'string' ? cell['label'] : !directed && !automatic && query['cellDisplay'] === 'label' ? nodeIds.map(id => all.get(id)?.name ?? id).join(' · ') : '', nodeIds, edgeIds, sources: evidence(nodeIds, edgeIds) });
            }
            const compare = (a: Axis, b: Axis) => a.key.localeCompare(b.key);
            const cellDisplay = query['cellDisplay']; if (cellDisplay !== undefined && cellDisplay !== 'count' && cellDisplay !== 'label') return unsupported('Invalid matrix cell display');
            return { type: 'matrix', ...(cellDisplay === undefined ? {} : { cellDisplay }), mode: directed || automatic ? 'edges' : 'nodes', rows: directed ? rows : rows.sort(compare), columns: directed ? columns : columns.sort(compare), cells: cells.sort((a, b) => a.row.localeCompare(b.row) || a.column.localeCompare(b.column)), coverage };
        }
    }
}
