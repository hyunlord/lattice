import type { LoopStage, LoopUI } from './loop-map-types.js';
import { chip, element, interpretation, label, svg } from './loop-map-shared.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';
import { dependencyBandHeight, dependencyFlowDescription, dependencyLabelLines, dependencyLabelRowHeight, dependencyLevels, dependencyView, displayedDependencyFlows, factoredTitle, dependencyStageTitle, dependencyHeadingParts } from './dependency-layout.js';
import { drawDependencyArrows } from './dependency-arrows.js';

function pathText<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className = ''): HTMLElementTagNameMap[K] {
    const result = element(tag, '', `${className} lm-path-text`);
    value.split('/').forEach((part, index) => { if (index) result.append(document.createTextNode('/'), element('wbr')); result.append(element('span', part)); }); return result;
}
function pathTitle(value: string): HTMLElement { return pathText('h3', value, 'lm-path-title'); }
function appendPathParts(host: HTMLElement, paths: readonly string[], context?: readonly string[]): void {
    paths.forEach((path, index) => { if (index) host.append(document.createTextNode(' · '), element('wbr')); const factored = context ? factoredTitle(path, context) : { prefix: '', name: path }; const member = element('span', '', 'lm-heading-member'); if (factored.prefix) member.append(pathText('span', factored.prefix, 'lm-stage-category')); member.append(pathText('span', factored.name)); host.append(member); });
}

function summaryFacts(stage: LoopStage): readonly { readonly label: string; readonly text: string; }[] { return stage.summaryDetails?.length ? stage.summaryDetails : stage.summaryDetail ? [stage.summaryDetail] : []; }

export function dependencyPanelSummary(stage: LoopStage): string { const facts = summaryFacts(stage); return facts.length ? facts.map(fact => `${fact.label} — ${fact.text}`).join('\n') : stage.summary; }

export function renderDependencyOverview(host: HTMLElement, ui: LoopUI): () => void {
    const model = ui.model; const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    host.append(element('p', model.lead, 'lm-lead'));
    const hint = element('p', '설명 붙이기: Claude Code·Codex에서 lattice 스킬 실행', 'lm-summary-hint');
    const nav = element('nav', '', 'lm-dependency-nav'); nav.setAttribute('aria-label', '폴더 덩어리 탐색');
    const mode = element('div', '', 'lm-dependency-mode'); let showAll = false;
    const diagram = element('div', '', 'lm-dependency-map'); const graph = svg('svg'); graph.classList.add('lm-arrows'); graph.setAttribute('aria-hidden', 'true');
    const connections = element('details', '', 'lm-dependency-connections');
    const overview = element('div', '', 'lm-dependency-overview'); const roles = element('aside', '', 'lm-dependency-roles'); const roleHint = element('p', '역할 목록 · 아래로 스크롤', 'lm-role-scroll-hint'); roleHint.hidden = true; roles.setAttribute('aria-label', '덩어리 역할과 설명 근거'); overview.append(diagram, roles);
    const panel = element('section', '', 'lm-panel'); panel.setAttribute('aria-live', 'polite'); host.append(nav, mode, overview, connections, hint, panel);
    const roots = model.rootStageIds ?? model.stages.filter(stage => !stage.parentId).map(stage => stage.id);
    const routed = readLoopRoute().stage; let selected = routed ?? model.defaultStage ?? roots[0];
    let parentId = routed && !roots.includes(routed) ? byId.get(routed)?.parentId : undefined;
    let page = Math.floor(Math.max(0, (parentId ? byId.get(parentId)?.childIds : roots)?.indexOf(selected ?? '') ?? 0) / 9);
    let redraw = (): void => { };
    const renderPanel = (stage: LoopStage): void => {
        selected = stage.id; for (const role of roles.querySelectorAll<HTMLElement>('[data-role-stage]')) role.setAttribute('aria-current', String(role.dataset['roleStage'] === selected)); for (const button of diagram.querySelectorAll<HTMLButtonElement>('[data-stage]')) button.setAttribute('aria-pressed', String(button.dataset['stage'] === selected));
        panel.replaceChildren(); const header = element('div', '', 'lm-panel-head'); header.append(pathText('h2', stage.title), element('p', dependencyPanelSummary(stage), 'lm-muted lm-panel-summary')); panel.append(header); header.append(element('p', `${stage.nodeIds.length}개 ${stage.unit}`, 'lm-muted'));
        if (stage.scopePaths?.length) { const scope = element('details', '', 'lm-group'); scope.append(element('summary', `포함한 폴더 ${stage.scopePaths.length}개`)); const paths = element('ul'); for (const path of stage.scopePaths) paths.append(pathText('li', path)); scope.append(paths); panel.append(scope); }
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
        const drawingView = { ...view, stages: view.stages.map(stage => { const node = stage.nodeIds.length === 1 ? ui.byId.get(stage.nodeIds[0] ?? '') : undefined; return node?.kind === 'package' ? { ...stage, title: node.name } : { ...stage, title: dependencyStageTitle(stage) }; }) };
        const levels = dependencyLevels({ ...view, flows: displayedDependencyFlows(view, selected, showAll) }); const boxes = new Map<string, HTMLElement>();
        const probe = pathTitle(''); diagram.append(probe); const titleFont = getComputedStyle(probe).font; probe.remove(); const measure = document.createElement('canvas').getContext('2d'); if (measure) measure.font = titleFont;
        roles.replaceChildren(roleHint);
        for (const stage of view.stages) { const role = element('section', '', 'lm-dependency-role'); role.dataset['roleStage'] = stage.id; const choose = element('button'); appendPathParts(choose, dependencyHeadingParts(stage, view.stages)); choose.type = 'button'; choose.title = stage.title; choose.onclick = () => { selected = stage.id; render(); writeLoopRoute({ view: 'loop', stage: stage.id }); }; const heading = element('div', '', 'lm-role-heading'); heading.append(choose); role.append(heading); const facts = summaryFacts(stage); if (facts.length) for (const fact of facts) role.append(element('span', fact.label, 'lm-role-source'), element('p', fact.text, 'lm-role-description')); else role.append(element('p', stage.summary || '설명 근거가 아직 없습니다.', 'lm-role-description')); if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-role-evidence'); evidence.append(element('summary', '근거')); for (const source of stage.summaryEvidence) evidence.append(pathText('span', `${source.path}${source.line ? `:${source.line}` : ''}`)); heading.append(evidence); } roles.append(role); }
        for (const level of [...new Set(levels.map(group => group.level))]) {
            const row = element('div', '', 'lm-dependency-level'); row.dataset['level'] = String(level); const groups = levels.filter(group => group.level === level);
            for (const group of groups) {
                const region = element('div', '', `lm-dependency-group${group.cyclic ? ' lm-dependency-cycle' : group.foldedCycle ? ' lm-dependency-aggregate' : ''}`); if (group.cyclic || group.foldedCycle) region.append(element('span', group.cyclic ? '파일 참조 순환' : group.stages.length === 2 ? '폴더 사이의 양방향 연결' : '폴더 묶음의 순환 연결', 'lm-cycle-caption'));
                for (const stage of group.stages) {
                    const box = element('button', '', 'lm-station'); box.type = 'button'; box.dataset['stage'] = stage.id; box.setAttribute('aria-pressed', String(stage.id === selected));
                    const identity = stage.nodeIds.length === 1 ? ui.byId.get(stage.nodeIds[0] ?? '') : undefined;
                    const namespace = identity?.kind === 'package' ? identity : undefined;
                    if (namespace) box.append(element('span', label(namespace, ui), 'lm-stage-category'));
                    const parts = dependencyHeadingParts(stage, view.stages); const fullName = parts[0] ?? stage.title; const allPaths = view.stages.flatMap(item => item.headingParts ?? [item.title]); const factored = factoredTitle(fullName, allPaths);

                    const displayName = factored.prefix ? factored.name : fullName;
                    const minimum = `min(100%, calc(${Math.ceil(Math.max(...(parts.length > 1 ? parts.map(part => factoredTitle(part, allPaths).name) : [displayName]).flatMap(path => path.split('/')).map(part => measure?.measureText(part).width ?? part.length * 10))) + 26}px))`; box.style.minWidth = minimum; if (!group.cyclic && !group.foldedCycle) region.style.minWidth = minimum;
                    const counts = `${stage.nodeIds.length}개 ${stage.unit}${stage.childIds?.length ? ` · 하위 ${stage.childIds.length}덩어리` : ''}`; box.title = `${stage.title} — ${counts}`;
                    const metadata = element('span', counts, 'lm-station-meta');
                    const heading = element('h3', '', 'lm-path-title lm-member-title'); appendPathParts(heading, parts, allPaths); if (stage.headingRemainder) metadata.append(document.createTextNode(` · 그 외 ${stage.headingRemainder}폴더`)); box.append(heading, metadata);
                    box.onclick = () => { selected = stage.id; render(); writeLoopRoute({ view: 'loop', stage: stage.id }); }; region.append(box); boxes.set(stage.id, box);
                } row.append(region);
            }
            diagram.append(row);
            const outgoing = view.flows.filter(flow => groups.some(group => group.stages.some(stage => stage.id === flow.source))).length;
            const gap = element('div', '', 'lm-dependency-gap'); gap.dataset['flows'] = String(outgoing); diagram.append(gap);
        }
        const initial = view.stages.find(stage => stage.id === selected) ?? view.stages[0]; if (initial) renderPanel(initial);
        redraw = () => {
            const flows = displayedDependencyFlows(view, selected, showAll); roles.style.maxHeight = window.innerWidth > 900 ? `${Math.max(200, window.innerHeight - roles.getBoundingClientRect().top - 12)}px` : ''; roleHint.hidden = window.innerWidth <= 900 || roles.scrollHeight <= roles.clientHeight + 1; const labelRows = dependencyLabelLines({ ...drawingView, flows });
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
