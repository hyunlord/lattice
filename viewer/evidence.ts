import type { Source } from '../dist/core/model.js';
import { source } from './data.js';
import { deferredSources, sourceCount, type DeferredSourceGroup } from './source-groups.js';
import { element, action } from './explore-controls.js';
const pages = new Map<string, Promise<readonly Source[]>>();
let transport: Promise<ReturnType<typeof import('./packed-data.js')['createPackedLoader']>> | undefined;
export function readEvidencePage(path: string): Promise<readonly Source[]> {
    if (!/^evidence\/[a-f0-9]{64}\.json$/u.test(path)) return Promise.reject(new Error('올바르지 않은 근거 경로입니다.'));
    const cached = pages.get(path); if (cached) return cached;
    const pending = (async () => {
        const generation = typeof document === 'undefined' ? undefined : document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content;
        const suffix = generation ? '?generation=' + encodeURIComponent(generation) : '';
        const text = await (transport ??= import('./packed-data.js').then(module => module.createPackedLoader('./', suffix))).then(loader => loader.text(path));
        if (globalThis.crypto?.subtle) {
            const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
            if (path !== `evidence/${hash}.json`) throw new Error('근거 파일 해시가 일치하지 않습니다. 새로고침 후 다시 시도하세요.');
        }
        const value: unknown = JSON.parse(text);
        if (!Array.isArray(value) || value.length > 128 || !value.every(source)) throw new Error('근거 파일 형식이 올바르지 않습니다.');
        return value;
    })();
    pages.set(path, pending);
    void pending.catch(() => { if (pages.get(path) === pending) pages.delete(path); });
    return pending;
}
async function groupPage(group: DeferredSourceGroup, index: number): Promise<readonly Source[]> {
    const path = group.pages[index]; if (!path) throw new Error('근거 페이지를 찾을 수 없습니다.');
    const sources = await readEvidencePage(path);
    if (sources.length !== Math.min(128, group.count - index * 128)) throw new Error('근거 개수가 일치하지 않습니다.');
    return sources;
}
export async function hydrateSources(sources: readonly Source[]): Promise<readonly Source[]> {
    const result = [...sources];
    for (const group of deferredSources(sources)) for (let page = 0; page < group.pages.length; page++) result.push(...await groupPage(group, page));
    return result;
}
export function renderSources(sources: readonly Source[], renderInline: (sources: readonly Source[]) => HTMLElement): HTMLElement {
    const groups = deferredSources(sources);
    if (!groups.length) return renderInline(sources);
    const result = element('div', '', 'lazy-evidence'), output = element('div'), controls = element('div');
    const loaded = [...sources]; let groupIndex = 0, pageIndex = 0, busy = false;
    if (loaded.length) output.append(renderInline(loaded));
    result.append(output, controls);
    const load = async (): Promise<void> => {
        if (busy) return;
        const group = groups[groupIndex]; if (!group) return;
        busy = true; controls.replaceChildren(element('p', '근거를 읽는 중…', 'muted')); result.setAttribute('aria-busy', 'true');
        try {
            const page = await groupPage(group, pageIndex);
            if (!result.isConnected) return;
            loaded.push(...page); pageIndex++;
            if (pageIndex === group.pages.length) { groupIndex++; pageIndex = 0; }
            output.replaceChildren(renderInline(loaded));
            controls.replaceChildren(element('p', `${loaded.length} / ${sourceCount(sources)}개 근거 항목 (중복 포함)`, 'meta'));
            if (groupIndex < groups.length) controls.append(action('근거 더 보기', () => { void load(); }));
        } catch (error) {
            if (result.isConnected) controls.replaceChildren(element('p', error instanceof Error ? error.message : '근거를 읽지 못했습니다.', 'empty'), action('근거 다시 시도', () => { void load(); }));
        } finally { busy = false; result.removeAttribute('aria-busy'); }
    };
    controls.append(action(`근거 ${sourceCount(sources)}개 항목 보기`, () => { void load(); }));
    return result;
}
export function rawRecord(record: { readonly sources: readonly Source[]; }): HTMLElement {
    const detail = element('details'); detail.append(element('summary', '원본 레코드 JSON'));
    const output = element('div'); detail.append(output); let loaded = false, busy = false;
    const load = async (): Promise<void> => {
        if (loaded || busy) return;
        busy = true; output.replaceChildren(element('p', '원본 근거를 읽는 중…', 'muted'));
        try {
            const sources = await hydrateSources(record.sources);
            if (!detail.isConnected) return;
            output.replaceChildren(element('pre', JSON.stringify({ ...record, sources }, null, 2))); loaded = true;
        } catch (error) {
            if (detail.isConnected) output.replaceChildren(element('p', error instanceof Error ? error.message : '근거를 읽지 못했습니다.', 'empty'), action('근거 다시 시도', () => { void load(); }));
        } finally { busy = false; }
    };
    detail.addEventListener('toggle', () => { if (detail.open) void load(); });
    return detail;
}
