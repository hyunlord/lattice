import type { LoopMap, LoopMapContext, LoopUI } from './loop-map-types.js';
import { element, glyph, label } from './loop-map-shared.js';
import { renderLoopOverview } from './loop-map-loop.js';
import { createFocusView } from './loop-map-focus.js';
import { renderLoopCatalog } from './loop-map-catalog.js';
import { structuralScopeModel } from './dependency-layout.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';

export function renderLoopMap(host: HTMLElement, model: LoopMap, context: LoopMapContext = {}): () => void {
    const root = element('section', '', `loop-map${model.structural ? ' lm-structural' : ''}`); const wrap = element('div', '', 'lm-wrap'); root.append(wrap); host.append(root);
    const header = element('header', '', 'lm-top'); const heading = element('div'); heading.append(element('h1', model.title ?? '저장소 지도')); if (model.subtitle) heading.append(element('p', model.subtitle, 'lm-subtitle')); header.append(heading);
    const actions = element('div', '', 'lm-top-actions'); for (const [title, run] of [['자세히', context.onDetails], ['근거 보기', context.onEvidence]] as const) { if (!run) continue; const button = element('button', title); button.type = 'button'; button.onclick = run; actions.append(button); } header.append(actions); wrap.append(header);
    const names = [model.structural ? '한눈에 보는 구조' : '한눈에 보는 순환', '하나씩 보기', '도감'] as const; const keys = ['loop', 'focus', 'catalog'] as const; const tabs = element('nav', '', 'lm-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '보기'); const panels = keys.map(() => element('section')); const buttons: HTMLButtonElement[] = []; const id = `loop-map-${crypto.randomUUID()}`;
    let scopeItem: HTMLElement | undefined;
    const show = (key: typeof keys[number]): void => { const active = keys.indexOf(key); if (scopeItem) scopeItem.hidden = key !== 'loop'; panels.forEach((panel, index) => { panel.hidden = index !== active; }); buttons.forEach((button, index) => { button.setAttribute('aria-selected', String(index === active)); button.tabIndex = index === active ? 0 : -1; }); };
    const route = readLoopRoute(); let selectedItem = route.item && model.nodes.some(node => node.id === route.item) ? route.item : model.defaultFocus ?? model.nodes[0]?.id;
    const navigate = (key: typeof keys[number]): void => { show(key); writeLoopRoute({ view: key, ...(selectedItem ? { item: selectedItem } : {}) }); };
    const byId = new Map(model.nodes.map(node => [node.id, node])); const ui: LoopUI = { model, context, byId, openFocus: nodeId => { if (!byId.has(nodeId)) return; show('focus'); focus.select(nodeId); selectedItem = nodeId; writeLoopRoute({ view: 'focus', item: nodeId }); tabs.scrollIntoView({ block: 'start' }); } };
    const legend = element('ul', '', 'lm-legend'); legend.setAttribute('aria-label', '기호 설명'); const seen = new Set<string>(); for (const node of model.nodes) { const text = label(node, ui); if (seen.has(text)) continue; seen.add(text); const item = element('li'); item.append(glyph(node, 13), document.createTextNode(text)); legend.append(item); } if (model.nodes.some(node => node.status === 'present')) { const item = element('li'); item.append(element('i', '', 'lm-dot'), document.createTextNode(model.statusLabels.present)); legend.append(item); } if (model.structural) legend.replaceChildren(element('li', '폴더 덩어리 · 화살표: 가져다 쓰는 파일 수 · 위: 사용하는 쪽 ↓ 아래: 기반')); wrap.append(legend, tabs);
    keys.forEach((key, index) => { const button = element('button', names[index] ?? key); button.type = 'button'; button.id = `${id}-tab-${key}`; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `${id}-panel-${key}`); button.onclick = () => navigate(key); button.onkeydown = event => { let next = index; if (event.key === 'ArrowRight') next = (index + 1) % keys.length; else if (event.key === 'ArrowLeft') next = (index + keys.length - 1) % keys.length; else if (event.key === 'Home') next = 0; else if (event.key === 'End') next = keys.length - 1; else return; event.preventDefault(); navigate(keys[next] ?? 'loop'); buttons[next]?.focus(); }; buttons.push(button); tabs.append(button); const panel = panels[index]; if (panel) { panel.id = `${id}-panel-${key}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.hidden = index !== 0; wrap.append(panel); } });
    const loopPanel = panels[0], focusPanel = panels[1], catalogPanel = panels[2]; if (!loopPanel || !focusPanel || !catalogPanel) return () => { };
    let scope = model.structuralScope?.productionCount === 0 ? 'all' : route.scope ?? model.structuralScope?.default ?? 'production';
    let cleanupLoop = renderLoopOverview(loopPanel, { ...ui, model: structuralScopeModel(model, scope) });
    if (model.structural && model.structuralScope) {
        const scopeInfo = model.structuralScope; scopeItem = element('li', '', 'lm-scope'); const status = element('span'); const toggle = element('button'); toggle.type = 'button';
        const describeScope = (): void => { status.textContent = scope === 'all' ? `전체 코드 · 제품 ${scopeInfo.productionCount}개 · 보조 ${scopeInfo.auxiliaryCount}개` : `제품 코드 · 보조 코드 ${scopeInfo.auxiliaryCount}개 제외`; toggle.textContent = scope === 'all' ? '제품 코드만' : '보조 코드 포함'; toggle.setAttribute('aria-pressed', String(scope === 'all')); toggle.hidden = !scopeInfo.productionCount || !scopeInfo.auxiliaryCount; };
        toggle.onclick = () => { scope = scope === 'all' ? 'production' : 'all'; const scoped = structuralScopeModel(model, scope); writeLoopRoute({ view: 'loop', scope, ...(scoped.defaultStage ? { stage: scoped.defaultStage } : {}) }); cleanupLoop(); loopPanel.replaceChildren(); cleanupLoop = renderLoopOverview(loopPanel, { ...ui, model: scoped }); describeScope(); show('loop'); };
        scopeItem.append(status, toggle); legend.append(scopeItem); describeScope();
    }
    const focus = createFocusView(focusPanel, ui); renderLoopCatalog(catalogPanel, ui); if (selectedItem) focus.select(selectedItem); show(route.view); return () => { cleanupLoop(); focus.cleanup(); };
}
