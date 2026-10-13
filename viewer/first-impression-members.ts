import type { FirstImpressionComponent } from '../dist/query/first-impression-types.js';
import { object } from './data.js';
import { element, anchor, action } from './explore-controls.js';
export function firstImpressionPath(value: unknown): value is string { return typeof value === 'string' && /^first-impression\/[a-f0-9]{64}\/(?:[A-Za-z0-9_%.-]+)\/(?:members-\d+-\d+|remaining-\d+)\.json$/u.test(value) && !value.includes('/../') && !/%2f|%5c|%2e/i.test(value); }
export function membershipDisclosure(component: FirstImpressionComponent, graphHash: string, english: boolean): HTMLElement {
    const host = element('div', '', 'fi-membership'); let next: string | undefined = component.membershipPath;
    const output = element('ul'); const controls = element('div'); host.append(output, controls);
    const load = async (): Promise<void> => {
        if (!next || !firstImpressionPath(next)) return;
        const path = next; controls.replaceChildren(element('p', english ? 'Reading files…' : '파일을 읽는 중…')); host.setAttribute('aria-busy', 'true');
        try {
            const generation = document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content;
            const { createPackedLoader } = await import('./packed-data.js');
            const value: unknown = await createPackedLoader('./', generation ? '?generation=' + encodeURIComponent(generation) : '').json(path);
            if (!object(value) || value['graphHash'] !== graphHash || !Array.isArray(value['members']) || !value['members'].every(member => object(member) && typeof member['id'] === 'string' && typeof member['path'] === 'string') || value['nextPath'] !== undefined && !firstImpressionPath(value['nextPath'])) throw new Error(english ? 'File inventory does not match this snapshot.' : '파일 목록의 소스가 이 화면과 다릅니다.');
            for (const member of value['members']) { if (!object(member) || typeof member['id'] !== 'string' || typeof member['path'] !== 'string') continue; const row = element('li'); row.append(anchor(member['path'], '#/node/' + encodeURIComponent(member['id']))); output.append(row); }
            next = typeof value['nextPath'] === 'string' ? value['nextPath'] : undefined;
            controls.replaceChildren(); if (next) controls.append(action(english ? 'More files' : '파일 더 보기', () => { void load(); }));
        } catch (error) { controls.replaceChildren(element('p', error instanceof Error ? error.message : String(error)), action(english ? 'Retry' : '다시 시도', () => { void load(); })); }
        finally { host.removeAttribute('aria-busy'); }
    };
    controls.append(action(english ? 'Complete file inventory' : '전체 파일 목록', () => { void load(); })); return host;
}
