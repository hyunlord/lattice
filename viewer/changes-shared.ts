import type { Node as GraphNode, Source, Snapshot } from '../dist/core/model.js';
import type { BrowserGraph, Presentation } from './data.js';
import { element, pager } from './explore-controls.js';
export type ChangesContext = {
    readonly nodes: readonly GraphNode[]; readonly kinds: Presentation['kinds'];
    readonly layer: string; readonly snapshots: readonly Snapshot[]; readonly params: URLSearchParams;
    readonly readSnapshot: (snapshot: Snapshot) => Promise<BrowserGraph>; readonly isCurrent: () => boolean;
    readonly heading: (title: string, description: string) => void; readonly kindLabel: (kind: string) => string;
    readonly facetLabel: (key: string) => string; readonly valueLabel: (key: string, value: unknown) => string;
    readonly nodeHref: (id: string) => string; readonly sources: (sources: readonly Source[]) => HTMLElement;
    readonly href: (params: Record<string, string>) => string;
};
export function changeSection(title: string): HTMLElement { const result = element('section', '', 'panel section history-section'); result.append(element('h2', title)); return result; }
export function historyPages<T>(container: HTMLElement, records: readonly T[], render: (record: T) => HTMLElement, size = 10): void {
    const host = element('div'); host.tabIndex = -1; container.append(host);
    const draw = (page: number, focus = false) => {
        host.replaceChildren(); for (const record of records.slice(page * size, (page + 1) * size)) host.append(render(record));
        if (records.length > size) pager(host, { total: records.length, page, size, change: next => draw(next, true) });
        if (focus) host.focus();
    }; draw(0);
}
export function historyHref(context: ChangesContext, changes: Record<string, string>): string { return context.href({ ...Object.fromEntries(context.params), ...changes }); }
export function snapshotLabel(snapshot: Snapshot, index: number): string { return `${index + 1} · ${snapshot.commit?.slice(0, 12) || '커밋 없음'} · ${snapshot.graphHash.slice(0, 8)}`; }
