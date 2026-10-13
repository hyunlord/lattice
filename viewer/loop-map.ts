import type { LoopMap, LoopMapContext, LoopUI } from './loop-map-types.js';
import { element, glyph, label } from './loop-map-shared.js';
import { renderLoopOverview } from './loop-map-loop.js';
import type { createFocusView } from './loop-map-focus.js';
import type { renderLoopCatalog } from './loop-map-catalog.js';
import { structuralScopeModel } from './dependency-layout.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';

export function renderLoopMap(host: HTMLElement, model: LoopMap, context: LoopMapContext = {}): () => void {
    const root = element('section', '', `loop-map${model.structural ? ' lm-structural' : ''}`); const wrap = element('div', '', 'lm-wrap'); root.append(wrap); host.append(root);
    const header = element('header', '', 'lm-top'); const heading = element('div'); heading.append(element('h1', model.title ?? '저장소 지도')); if (model.subtitle) heading.append(element('p', model.subtitle, 'lm-subtitle')); if (model.structural) { heading.append(element('p', model.lead, 'lm-lead lm-repo-description')); if (model.structuralSourceRoot) heading.append(element('p', `소스 루트: ${model.structuralSourceRoot}`, 'lm-source-root lm-analysis-evidence')); } header.append(heading);
    const actions = element('div', '', 'lm-top-actions'); for (const [title, run] of [['자세히', context.onDetails], ['근거 보기', context.onEvidence]] as const) { if (!run) continue; const button = element('button', title); button.type = 'button'; button.onclick = run; actions.append(button); } header.append(actions); wrap.append(header);
    const names = [model.structural ? '한눈에 보는 구조' : '한눈에 보는 순환', '하나씩 보기', '도감'] as const; const keys = ['loop', 'focus', 'catalog'] as const; const tabs = element('nav', '', 'lm-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '보기'); const panels = keys.map(() => element('section')); const buttons: HTMLButtonElement[] = []; const id = `loop-map-${crypto.randomUUID()}`;
    let scopeItem: HTMLElement | undefined;
    let focus: ReturnType<typeof createFocusView> | undefined;
    let catalogReady = false;
    let disposed = false, panelRequest = 0;
    let focusModule: Promise<{ createFocusView: typeof createFocusView; }> | undefined;
    let catalogModule: Promise<{ renderLoopCatalog: typeof renderLoopCatalog; }> | undefined;
    const ensurePanel = async (key: typeof keys[number], request: number): Promise<void> => {
        const current = (): boolean => !disposed && request === panelRequest;
        if (key === 'loop' || key === 'focus' && focus || key === 'catalog' && catalogReady) return;
        const panel = panels[key === 'focus' ? 1 : 2]; if (!panel) return;
        if (key === 'focus' && selectedItem && !model.nodes.some(node => node.id === selectedItem)) { context.onMissingNode?.(selectedItem); return; }
        panel.setAttribute('aria-busy', 'true'); const status = element('p', '보기를 불러오는 중…', 'lm-muted'); status.setAttribute('role', 'status'); panel.replaceChildren(status);
        try {
            if (key === 'focus') {
                focusModule ??= import('./loop-map-focus.js'); const module = await focusModule;
                if (!current()) return;
                panel.replaceChildren(); const created = module.createFocusView(panel, ui);
                if (!current()) { created.cleanup(); return; }
                try { if (selectedItem) created.select(selectedItem); }
                catch (error) { created.cleanup(); throw error; }
                if (!current()) { created.cleanup(); return; }
                focus = created;
            } else {
                catalogModule ??= import('./loop-map-catalog.js'); const module = await catalogModule;
                if (!current()) return;
                panel.replaceChildren(); module.renderLoopCatalog(panel, ui);
                if (!current()) return;
                catalogReady = true;
            }
        } catch (error) {
            if (!current()) return;
            if (key === 'focus') focusModule = undefined; else catalogModule = undefined;
            const message = element('p', error instanceof Error ? `보기를 불러오지 못했습니다: ${error.message}` : '보기를 불러오지 못했습니다.'); message.setAttribute('role', 'alert');
            const retry = element('button', '다시 시도'); retry.type = 'button'; retry.onclick = () => { if (!disposed) show(key); }; panel.replaceChildren(message, retry);
        } finally { if (current()) panel.removeAttribute('aria-busy'); }
    };
    const show = (key: typeof keys[number]): void => { if (disposed) return; const request = ++panelRequest; const active = keys.indexOf(key); if (scopeItem) scopeItem.hidden = key !== 'loop'; panels.forEach((panel, index) => { panel.hidden = index !== active; }); buttons.forEach((button, index) => { button.setAttribute('aria-selected', String(index === active)); button.tabIndex = index === active ? 0 : -1; }); void ensurePanel(key, request); };
    const route = readLoopRoute(); let selectedItem = route.item && model.nodes.some(node => node.id === route.item) ? route.item : model.defaultFocus ?? model.nodes[0]?.id;
    const navigate = (key: typeof keys[number]): void => { show(key); if (disposed) return; writeLoopRoute({ view: key, ...(selectedItem ? { item: selectedItem } : {}) }); };
    const byId = new Map(model.nodes.map(node => [node.id, node])); const ui: LoopUI = { model, context, byId, openFocus: nodeId => { if (!byId.has(nodeId) || model.structural && byId.get(nodeId)?.kind === 'function' && nodeId !== model.defaultFocus) { context.onMissingNode?.(nodeId); return; } selectedItem = nodeId; show('focus'); if (disposed) return; focus?.select(nodeId); if (disposed) return; writeLoopRoute({ view: 'focus', item: nodeId }); if (!disposed) tabs.scrollIntoView({ block: 'start' }); } };
    const legend = element('ul', '', 'lm-legend'); legend.setAttribute('aria-label', '기호 설명'); const seen = new Set<string>(); for (const node of model.nodes) { const text = label(node, ui); if (seen.has(text)) continue; seen.add(text); const item = element('li'); item.append(glyph(node, 13), document.createTextNode(text)); legend.append(item); } if (model.nodes.some(node => node.status === 'present')) { const item = element('li'); item.append(element('i', '', 'lm-dot'), document.createTextNode(model.statusLabels.present)); legend.append(item); } if (model.structural) legend.replaceChildren(element('li', '폴더 · A → B: A의 파일 n개가 B를 씀 · 위가 아래를 사용', 'lm-analysis-evidence')); wrap.append(legend, tabs);
    keys.forEach((key, index) => { const button = element('button', names[index] ?? key); button.type = 'button'; button.id = `${id}-tab-${key}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${id}-panel-${key}`); button.onclick = () => navigate(key); button.onkeydown = event => { let next = index; if (event.key === 'ArrowRight') next = (index + 1) % keys.length; else if (event.key === 'ArrowLeft') next = (index + keys.length - 1) % keys.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = keys.length - 1; else return; event.preventDefault(); navigate(keys[next] ?? 'loop'); if (!disposed) buttons[next]?.focus(); }; buttons.push(button); tabs.append(button); const panel = panels[index]; if (panel) { panel.id = `${id}-panel-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.hidden = index !== 0; wrap.append(panel); } });
    const loopPanel = panels[0], focusPanel = panels[1], catalogPanel = panels[2]; if (!loopPanel || !focusPanel || !catalogPanel) return () => { };
    let scope = model.structuralScope?.productionCount === 0 ? 'all' : route.scope ?? model.structuralScope?.default ?? 'production';
    let cleanupLoop = renderLoopOverview(loopPanel, { ...ui, model: structuralScopeModel(model, scope) });
    if (model.structural && model.structuralScope) {
        const scopeInfo = model.structuralScope; scopeItem = element('li', '', 'lm-scope'); const status = element('span', '', 'lm-analysis-evidence'); const toggle = element('button'); toggle.type = 'button';
        const describeScope = (): void => { const scoped = structuralScopeModel(model, scope); const roots = scoped.rootStageIds ?? []; const flat = roots.length === 1 && scoped.stages.some(stage => stage.id === roots[0] && stage.filePreviews?.length); const legendText = legend.firstElementChild; if (legendText) legendText.textContent = flat ? '파일 구성 · 타입 참조: 이 파일 → 타입을 정의한 파일' : '폴더 · A → B: A의 파일 n개가 B를 씀 · 위가 아래를 사용'; const sourceRoot = header.querySelector('.lm-source-root'); if (sourceRoot) sourceRoot.textContent = `소스 루트: ${scope === 'all' ? scopeInfo.allSourceRoot ?? model.structuralSourceRoot ?? '.' : model.structuralSourceRoot ?? '.'}`; status.textContent = scope === 'all' ? `전체 저장소 · 파일 ${scopeInfo.productionCount + scopeInfo.auxiliaryCount}개` : `테스트를 제외한 코드 · 파일 ${scopeInfo.selectedCount ?? scopeInfo.productionCount}개 · ${scopeInfo.excludedDescription ?? `테스트·검사 자료 파일 ${scopeInfo.auxiliaryCount}개 제외`}`; toggle.textContent = scope === 'all' ? '테스트를 제외한 코드' : '전체 저장소'; toggle.setAttribute('aria-pressed', String(scope === 'all')); toggle.hidden = !scopeInfo.productionCount || !scopeInfo.auxiliaryCount; };
        toggle.onclick = () => { scope = scope === 'all' ? 'production' : 'all'; const scoped = structuralScopeModel(model, scope); writeLoopRoute({ view: 'loop', scope, stage: '', parent: '', page: 0 }); if (disposed) return; cleanupLoop(); loopPanel.replaceChildren(); cleanupLoop = renderLoopOverview(loopPanel, { ...ui, model: scoped }); describeScope(); show('loop'); };
        scopeItem.append(status, toggle); legend.append(scopeItem); describeScope();
    }
    show(route.view); return () => { if (disposed) return; disposed = true; ++panelRequest; cleanupLoop(); focus?.cleanup(); };
}
