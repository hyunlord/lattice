import type { Node, Edge, Source, View } from '../dist/core/model.js';
import { element, anchor, pager, pageNumber } from './explore-controls.js';
export type ViewsContext = {
    readonly views: readonly View[]; readonly nodes: readonly Node[]; readonly edges: readonly Edge[];
    readonly id: string; readonly params: URLSearchParams; readonly heading: (title: string, description: string) => void;
    readonly href: (id: string, params: Record<string, string>) => string;
    readonly nodeHref: (id: string) => string; readonly kindLabel: (kind: string) => string;
    readonly sources: (sources: readonly Source[]) => HTMLElement;
};
export function viewRoute(context: ViewsContext, changes: Record<string, string>): string { return context.href(context.id, { ...Object.fromEntries(context.params), ...changes }); }
export function panel(title: string): HTMLElement { const result = element('section', '', 'panel section'); result.append(element('h2', title)); return result; }
export function region(table: HTMLTableElement, label: string): HTMLElement { const wrap = element('div', '', 'table-region'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', label); wrap.append(table); const container = element('div'); container.append(element('p', '열이 화면을 벗어나면 표를 가로로 스크롤하세요. 표에 초점을 두고 ← → 키로도 이동할 수 있습니다.', 'meta view-scroll-hint'), wrap); return container; }
export function selection(container: HTMLElement, context: ViewsContext, ids: { readonly nodeIds: readonly string[]; readonly edgeIds: readonly string[]; }): void {
    const nodes = new Map(context.nodes.map(node => [node.id, node])); const edges = new Map(context.edges.map(edge => [edge.id, edge]));
    if (ids.nodeIds.length) {
        const list = element('ul', '', 'neighbors'); const page = pageNumber(context.params.get('detailPage'), ids.nodeIds.length, 30);
        for (const id of ids.nodeIds.slice(page * 30, (page + 1) * 30)) { const item = element('li'); item.append(anchor(nodes.get(id)?.name ?? id, context.nodeHref(id))); list.append(item); }
        container.append(element('h3', `노드 ${ids.nodeIds.length}개`), list); paging(container, context, { total: ids.nodeIds.length, size: 30, key: 'detailPage' });
    }
    if (ids.edgeIds.length) {
        const page = pageNumber(context.params.get('edgePage'), ids.edgeIds.length, 30); const list = element('ul', '', 'view-evidence');
        for (const id of ids.edgeIds.slice(page * 30, (page + 1) * 30)) { const edge = edges.get(id); if (!edge) continue; const item = element('li'); item.append(anchor(nodes.get(edge.source)?.name ?? edge.source, context.nodeHref(edge.source)), element('span', edge.directed ? ' → ' : ' ↔ '), anchor(nodes.get(edge.target)?.name ?? edge.target, context.nodeHref(edge.target)), element('p', String(edge.attributes?.['label'] ?? edge.kind)), context.sources(edge.sources)); list.append(item); }
        container.append(element('h3', `연결 ${ids.edgeIds.length}개`), list); paging(container, context, { total: ids.edgeIds.length, size: 30, key: 'edgePage' });
    }
}
export function paging(container: HTMLElement, context: ViewsContext, options: { readonly total: number; readonly size: number; readonly key: string; }): void {
    const page = pageNumber(context.params.get(options.key), options.total, options.size);
    pager(container, { total: options.total, page, size: options.size, change: next => { location.hash = viewRoute(context, { [options.key]: String(next) }); } });
}
export function valueText(value: unknown): string { return value === undefined ? '미기재' : typeof value === 'string' ? value : JSON.stringify(value); }
