import type { LoopStage, LoopUI } from './loop-map-types.js';
import { chip, element, interpretation, label, svg } from './loop-map-shared.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';
import { dependencyBandHeight, dependencyFlowDescription, dependencyLabelLines, dependencyLabelRowHeight, dependencyLevels, dependencyView, displayedDependencyFlows, sharedFolderPrefix, factoredTitle } from './dependency-layout.js';
import { drawDependencyArrows } from './dependency-arrows.js';

function pathText<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className = ''): HTMLElementTagNameMap[K] {
    const result = element(tag, '', `${className} lm-path-text`);
    value.split('/').forEach((part, index) => { if (index) result.append(document.createTextNode('/'), element('wbr')); result.append(element('span', part)); }); return result;
}
function pathTitle(value: string): HTMLElement { return pathText('h3', value, 'lm-path-title'); }

export function renderDependencyOverview(host: HTMLElement, ui: LoopUI): () => void {
    const model = ui.model; const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    host.append(element('p', model.lead, 'lm-lead'));
    const hint = element('p', '설명 붙이기: Claude Code·Codex에서 lattice 스킬 실행', 'lm-summary-hint');
    const nav = element('nav', '', 'lm-dependency-nav'); nav.setAttribute('aria-label', '폴더 덩어리 탐색');
    const mode = element('div', '', 'lm-dependency-mode'); let showAll = false;
    const diagram = element('div', '', 'lm-dependency-map'); const graph = svg('svg'); graph.classList.add('lm-arrows'); graph.setAttribute('aria-hidden', 'true');
    const connections = element('details', '', 'lm-dependency-connections');
    const panel = element('section', '', 'lm-panel'); panel.setAttribute('aria-live', 'polite'); host.append(nav, mode, diagram, connections, hint, panel);
    const roots = model.rootStageIds ?? model.stages.filter(stage => !stage.parentId).map(stage => stage.id);
    const routed = readLoopRoute().stage; let selected = routed ?? model.defaultStage ?? roots[0];
    let parentId = routed && !roots.includes(routed) ? byId.get(routed)?.parentId : undefined;
    let page = Math.floor(Math.max(0, (parentId ? byId.get(parentId)?.childIds : roots)?.indexOf(selected ?? '') ?? 0) / 9);
    let redraw = (): void => { };
    const renderPanel = (stage: LoopStage): void => {
        selected = stage.id; for (const button of diagram.querySelectorAll<HTMLButtonElement>('[data-stage]')) button.setAttribute('aria-pressed', String(button.dataset['stage'] === selected));
        panel.replaceChildren(); const header = element('div', '', 'lm-panel-head'); header.append(pathText('h2', stage.title), element('p', stage.summary, 'lm-muted')); panel.append(header);
        if (stage.childIds?.length) { const expand = element('button', `하위 덩어리 ${stage.childIds.length}개 펼치기`, 'lm-dependency-expand'); expand.type = 'button'; expand.onclick = () => { parentId = stage.id; page = 0; selected = stage.childIds?.[0]; render(); if (selected) writeLoopRoute({ view: 'loop', stage: selected }); }; panel.append(expand); }
        const columns = element('div', '', 'lm-cols'); const content = element('div');
        for (const group of stage.groups) { const block = element('details', '', 'lm-group'); block.open = false; block.append(element('summary', `${group.title} ${group.items.length}`)); const items = element('div', '', 'lm-chips'); for (const item of group.items) { const button = chip(item.id, ui); if (button) items.append(button); } block.append(items); content.append(block); }
        const dependencies = element('div');
        for (const [title, values] of [['가져다 쓰는 덩어리', stage.outgoing], ['이 덩어리를 쓰는 곳', stage.incoming]] as const) {
            const block = element('div', '', 'lm-group'); block.append(element('h4', title)); const list = element('ul', '', 'lm-influence'); for (const value of values) {
                const item = element('li'); const target = model.stages.find(other => other.title === value.name);
                if (target) { const link = pathText('button', value.name, 'lm-dependency-link'); link.type = 'button'; link.onclick = () => { selected = target.id; parentId = roots.includes(target.id) ? undefined : target.parentId; const siblings = parentId ? byId.get(parentId)?.childIds ?? [] : roots; page = Math.floor(Math.max(0, siblings.indexOf(target.id)) / 9); render(); writeLoopRoute({ view: 'loop', stage: target.id }); }; item.append(link); } else item.append(pathText('b', value.name));
                item.append(element('p', value.description)); list.append(item);
            } block.append(values.length ? list : element('p', '없음', 'lm-muted')); dependencies.append(block);
        }
        columns.append(content, dependencies); panel.append(columns); const note = interpretation(stage.interpretation); if (note) panel.append(note);
        redraw();
        if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-interpretation'); evidence.append(element('summary', '설명 근거')); for (const source of stage.summaryEvidence) evidence.append(element('p', `${source.path}${source.line ? `:${source.line}` : ''}`)); panel.append(evidence); }
    };
    const render = (): void => {
        redraw = () => { }; nav.replaceChildren(); diagram.replaceChildren(graph); const ids = parentId ? byId.get(parentId)?.childIds ?? [] : roots; const visibleIds = ids.slice(page * 9, page * 9 + 9); const view = dependencyView(model, visibleIds);
        if (parentId) { const parent = byId.get(parentId); const back = pathText('button', `← ${parent?.parentId ? byId.get(parent.parentId)?.title ?? '상위' : '전체 구조'}`); back.type = 'button'; back.onclick = () => { selected = parentId; parentId = parent?.parentId; page = 0; render(); if (selected) writeLoopRoute({ view: 'loop', stage: selected }); }; nav.append(back, pathText('span', parent?.title ?? '')); }
        nav.hidden = !parentId && ids.length <= 9;
        if (ids.length > 9) for (const [text, delta] of [['이전', -1], ['다음', 1]] as const) { const button = element('button', text); button.type = 'button'; button.disabled = page + delta < 0 || (page + delta) * 9 >= ids.length; button.onclick = () => { page += delta; selected = ids[page * 9]; render(); if (selected) writeLoopRoute({ view: 'loop', stage: selected }); }; nav.append(button); }
        connections.replaceChildren(element('summary', `전체 덩어리 연결 ${view.flows.length}개`));
        const connectionList = element('ul', '', 'lm-influence'); for (const flow of view.flows) { const item = element('li'); item.append(pathText('span', byId.get(flow.source)?.title ?? flow.source), document.createTextNode(' → '), pathText('span', byId.get(flow.target)?.title ?? flow.target), document.createTextNode(` — ${dependencyFlowDescription(flow)}`)); connectionList.append(item); } connections.append(connectionList);
        const drawingView = { ...view, stages: view.stages.map(stage => { const node = stage.nodeIds.length === 1 ? ui.byId.get(stage.nodeIds[0] ?? '') : undefined; return node?.kind === 'package' ? { ...stage, title: node.name } : stage; }) };
        const levels = dependencyLevels({ ...view, flows: displayedDependencyFlows(view, selected, showAll) }); const boxes = new Map<string, HTMLElement>();
        const commonPrefix = sharedFolderPrefix(view.stages.filter(stage => !stage.nodeIds.some(id => ui.byId.get(id)?.kind === 'package')).map(stage => stage.title));
        for (const level of [...new Set(levels.map(group => group.level))]) {
            const row = element('div', '', 'lm-dependency-level'); row.dataset['level'] = String(level); const groups = levels.filter(group => group.level === level);
            const folders = groups.flatMap(group => group.stages).filter(stage => !stage.nodeIds.some(id => ui.byId.get(id)?.kind === 'package')); const prefix = sharedFolderPrefix(folders.map(stage => stage.title)) || (commonPrefix && folders.some(stage => stage.title.startsWith(`${commonPrefix}/`)) ? commonPrefix : '');
            if (prefix) { row.append(pathText('span', `${prefix}/`, 'lm-folder-prefix')); }
            for (const group of groups) {
                const region = element('div', '', `lm-dependency-group${group.cyclic ? ' lm-dependency-cycle' : group.foldedCycle ? ' lm-dependency-aggregate' : ''}`); if (group.cyclic || group.foldedCycle) region.append(element('span', group.cyclic ? '파일 참조 순환' : group.stages.length === 2 ? '폴더 사이의 양방향 연결' : '폴더 묶음의 순환 연결', 'lm-cycle-caption'));
                for (const stage of group.stages) {
                    const box = element('button', '', 'lm-station'); box.type = 'button'; box.dataset['stage'] = stage.id; box.setAttribute('aria-pressed', String(stage.id === selected));
                    const identity = stage.nodeIds.length === 1 ? ui.byId.get(stage.nodeIds[0] ?? '') : undefined;
                    const namespace = identity?.kind === 'package' ? identity : undefined;
                    if (namespace) box.append(element('span', label(namespace, ui), 'lm-stage-category'));
                    const fullName = namespace?.name ?? stage.title; const factored = factoredTitle(fullName, drawingView.stages.map(item => item.title));
                    if (factored.prefix) box.append(element('span', `${factored.prefix}…`, 'lm-stage-category'));
                    const displayName = factored.prefix ? factored.name : namespace?.name ?? (prefix && stage.title.startsWith(`${prefix}/`) ? stage.title.slice(prefix.length + 1) : stage.title);
                    const minimum = `min(100%, calc(${Math.max(...displayName.split('/').map(part => part.length))} * .6rem + 26px))`; box.style.minWidth = minimum; if (!group.cyclic && !group.foldedCycle) region.style.minWidth = minimum;
                    box.title = stage.title;
                    box.append(pathTitle(displayName), element('span', stage.summary, 'lm-station-line'), element('span', `${stage.nodeIds.length}개 모듈${stage.childIds?.length ? ` · 하위 ${stage.childIds.length}덩어리` : ''}`, 'lm-station-meta'));
                    box.onclick = () => { selected = stage.id; render(); writeLoopRoute({ view: 'loop', stage: stage.id }); }; region.append(box); boxes.set(stage.id, box);
                } row.append(region);
            }
            diagram.append(row);
            const outgoing = view.flows.filter(flow => groups.some(group => group.stages.some(stage => stage.id === flow.source))).length;
            const gap = element('div', '', 'lm-dependency-gap'); gap.dataset['flows'] = String(outgoing); diagram.append(gap);
        }
        const initial = view.stages.find(stage => stage.id === selected) ?? view.stages[0]; if (initial) renderPanel(initial);
        redraw = () => {
            const flows = displayedDependencyFlows(view, selected, showAll); const labelRows = dependencyLabelLines({ ...drawingView, flows });
            mode.replaceChildren(); mode.hidden = view.flows.length <= 12;
            if (!mode.hidden) { const title = byId.get(selected ?? '')?.title ?? '선택한 덩어리'; const status = element('span'); if (showAll) status.textContent = `전체 ${view.flows.length}개 연결 표시`; else status.append(pathText('span', title), document.createTextNode(`의 연결 ${flows.length}개 표시 · 전체 ${view.flows.length}개`)); mode.append(status); const toggle = element('button', showAll ? '선택한 덩어리만' : '전체 화살표'); toggle.type = 'button'; toggle.setAttribute('aria-pressed', String(showAll)); toggle.onclick = () => { showAll = !showAll; render(); }; mode.append(toggle); }
            for (const gap of diagram.querySelectorAll<HTMLElement>('.lm-dependency-gap')) { const peers = flows.filter(flow => boxes.get(flow.source)?.closest('.lm-dependency-level') === gap.previousElementSibling); gap.style.height = `${dependencyBandHeight(peers.length, diagram.clientWidth, dependencyLabelRowHeight(peers, labelRows))}px`; }
            drawDependencyArrows({ host: diagram, graph, view: { ...drawingView, flows }, boxes });
            if (Number(graph.dataset['unrouted']) > 0) { connections.open = true; const summary = connections.querySelector('summary'); if (summary) summary.textContent = `전체 덩어리 연결 ${view.flows.length}개 · 밀집한 연결은 아래 목록에서 확인`; }
        }; requestAnimationFrame(redraw);
    };
    const observer = new ResizeObserver(() => redraw()); observer.observe(diagram); render();
    return () => observer.disconnect();
}
