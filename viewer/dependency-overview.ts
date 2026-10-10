import type { LoopStage, LoopUI } from './loop-map-types.js';
import { chip, element, interpretation, svg } from './loop-map-shared.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';
import { dependencyFlowDescription, internalDependencyFacts, dependencyLevels, dependencyView, displayedDependencyFlows, dependencyHeadingParts } from './dependency-layout.js';
import { drawDependencyArrows } from './dependency-arrows.js';

function pathText<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className = ''): HTMLElementTagNameMap[K] {
    const result = element(tag, '', `${className} lm-path-text`);
    value.split('/').forEach((part, index) => { if (index) result.append(document.createTextNode('/'), element('wbr')); result.append(element('span', part)); }); return result;
}
function pathTitle(value: string): HTMLElement { return pathText('h3', value, 'lm-path-title'); }
function appendPathParts(host: HTMLElement, paths: readonly string[], _context?: readonly string[]): void {
    paths.forEach((path, index) => { if (index) host.append(document.createTextNode(' · '), element('wbr')); const factored = { prefix: '', name: path }; const member = element('span', '', 'lm-heading-member'); if (factored.prefix) member.append(pathText('span', factored.prefix, 'lm-stage-category')); member.append(pathText('span', factored.name)); host.append(member); });
}

function summaryFacts(stage: LoopStage): readonly { readonly label: string; readonly text: string; }[] { return stage.summaryDetails?.length ? stage.summaryDetails : stage.summaryDetail ? [stage.summaryDetail] : []; }

export function dependencyPanelSummary(stage: LoopStage): string { const facts = summaryFacts(stage); return facts.length ? facts.map(fact => `${fact.label} — ${fact.text}`).join('\n') : stage.summary; }

export function renderDependencyOverview(host: HTMLElement, ui: LoopUI): () => void {
    const model = ui.model; const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    const hint = element('p', '설명 붙이기: Claude Code·Codex에서 lattice 스킬 실행', 'lm-summary-hint');
    const nav = element('nav', '', 'lm-dependency-nav'); nav.setAttribute('aria-label', '폴더 덩어리 탐색');
    const mode = element('div', '', 'lm-dependency-mode');
    const diagram = element('div', '', 'lm-dependency-map'); const graph = svg('svg'); graph.classList.add('lm-arrows'); graph.setAttribute('aria-hidden', 'true');
    const connections = element('details', '', 'lm-dependency-connections');
    const overview = element('div', '', 'lm-dependency-overview'); const roles = element('aside', '', 'lm-dependency-roles'); const roleHint = element('p', '역할 목록 · 아래로 스크롤', 'lm-role-scroll-hint'); roleHint.hidden = true; roles.setAttribute('aria-label', '덩어리 역할과 설명 근거'); overview.append(diagram, roles);
    const panel = element('section', '', 'lm-panel'); panel.setAttribute('aria-live', 'polite'); host.append(nav, mode, overview, connections, hint, panel);
    const roots = model.rootStageIds ?? model.stages.filter(stage => !stage.parentId).map(stage => stage.id);
    const route = readLoopRoute(); const routed = route.stage; let selected = routed;
    let parentId = routed && !roots.includes(routed) ? byId.get(routed)?.parentId : route.parent && byId.has(route.parent) ? route.parent : undefined;
    let page = Math.floor(Math.max(0, (parentId ? byId.get(parentId)?.childIds : roots)?.indexOf(selected ?? '') ?? 0) / 9);
    if (!routed) page = Math.min(route.page ?? 0, Math.max(0, Math.ceil((parentId ? byId.get(parentId)?.childIds?.length ?? 0 : roots.length) / 9) - 1));
    const saveRoute = (): void => writeLoopRoute({ view: 'loop', stage: selected ?? '', parent: parentId ?? '', page });
    let redraw = (): void => { };
    const renderPanel = (stage: LoopStage): void => {
        panel.hidden = false; selected = stage.id; for (const role of roles.querySelectorAll<HTMLElement>('[data-role-stage]')) role.setAttribute('aria-current', String(role.dataset['roleStage'] === selected)); for (const button of diagram.querySelectorAll<HTMLButtonElement>('button[data-stage], .lm-folder-select')) button.setAttribute('aria-pressed', String((button.dataset['stage'] ?? button.closest<HTMLElement>('[data-stage]')?.dataset['stage']) === selected));
        panel.replaceChildren(); const header = element('div', '', 'lm-panel-head'); header.append(pathText('h2', stage.title), element('p', dependencyPanelSummary(stage), 'lm-muted lm-panel-summary')); panel.append(header); header.append(element('p', `${stage.nodeIds.length}개 ${stage.unit}`, 'lm-muted'));
        if (stage.scopePaths?.length) { const scope = element('details', '', 'lm-group'); scope.append(element('summary', `포함한 폴더 ${stage.scopePaths.length}개`)); const paths = element('ul'); for (const path of stage.scopePaths) paths.append(pathText('li', path)); scope.append(paths); panel.append(scope); }
        if (stage.childIds?.length) { const expand = element('button', `하위 덩어리 ${stage.childIds.length}개 펼치기`, 'lm-dependency-expand'); expand.type = 'button'; expand.onclick = () => { parentId = stage.id; page = 0; selected = stage.childIds?.[0]; render(); saveRoute(); }; panel.append(expand); }
        const columns = element('div', '', 'lm-cols'); const content = element('div');
        for (const group of stage.groups) { const block = element('details', '', 'lm-group'); block.open = false; block.append(element('summary', `${group.title} ${group.items.length}`)); const items = element('div', '', 'lm-chips'); for (const item of group.items) { const button = chip(item.id, ui); if (button) items.append(button); } block.append(items); content.append(block); }
        const dependencies = element('div');
        for (const [title, values] of [['가져다 쓰는 덩어리', stage.outgoing], ['이 덩어리를 쓰는 곳', stage.incoming]] as const) {
            const block = element('div', '', 'lm-group'); block.append(element('h4', title)); const list = element('ul', '', 'lm-influence'); for (const value of values) {
                const item = element('li'); const target = model.stages.find(other => other.title === value.name);
                if (target) { const link = pathText('button', value.name, 'lm-dependency-link'); link.type = 'button'; link.onclick = () => { selected = target.id; parentId = roots.includes(target.id) ? undefined : target.parentId; const siblings = parentId ? byId.get(parentId)?.childIds ?? [] : roots; page = Math.floor(Math.max(0, siblings.indexOf(target.id)) / 9); render(); saveRoute(); }; item.append(link); } else item.append(pathText('b', value.name));
                item.append(element('p', value.description)); list.append(item);
            } block.append(values.length ? list : element('p', '없음', 'lm-muted')); dependencies.append(block);
        }
        columns.append(content, dependencies); panel.append(columns); const note = interpretation(stage.interpretation); if (note) panel.append(note);
        redraw();
        if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-interpretation'); evidence.append(element('summary', '설명 근거')); for (const source of stage.summaryEvidence) evidence.append(element('p', `${source.path}${source.line ? `:${source.line}` : ''}`)); panel.append(evidence); }
    };
    const render = (): void => {
        redraw = () => { }; nav.replaceChildren(); diagram.replaceChildren(graph); const ids = parentId ? byId.get(parentId)?.childIds ?? [] : roots; const visibleIds = ids.slice(page * 9, page * 9 + 9); const view = dependencyView(model, visibleIds);
        if (parentId) { const parent = byId.get(parentId); const back = pathText('button', `← ${parent?.parentId ? byId.get(parent.parentId)?.title ?? '상위' : '전체 구조'}`); back.type = 'button'; back.onclick = () => { selected = parentId; parentId = parent?.parentId; page = 0; render(); saveRoute(); }; nav.append(back, pathText('span', parent?.title ?? '')); }
        nav.hidden = !parentId && ids.length <= 9;
        if (ids.length > 9) nav.append(element('span', `폴더 ${ids.length}개 중 ${page * 9 + 1}–${Math.min(ids.length, (page + 1) * 9)}개 표시`));
        if (ids.length > 9) for (const [text, delta] of [['이전', -1], ['다음', 1]] as const) { const button = element('button', delta > 0 && (page + 1) * 9 < ids.length ? `다음 ${Math.min(9, ids.length - (page + 1) * 9)}개` : text); button.type = 'button'; button.disabled = page + delta < 0 || (page + delta) * 9 >= ids.length; button.onclick = () => { page += delta; selected = undefined; render(); saveRoute(); }; nav.append(button); }
        connections.replaceChildren(element('summary', `전체 덩어리 연결 ${view.flows.length}개`));
        const connectionList = element('ul', '', 'lm-influence'); for (const flow of view.flows) { const item = element('li'); item.append(pathText('span', byId.get(flow.source)?.title ?? flow.source), document.createTextNode(' → '), pathText('span', byId.get(flow.target)?.title ?? flow.target), document.createTextNode(` — ${dependencyFlowDescription(flow)}`)); connectionList.append(item); } connections.append(connectionList);

        const levels = dependencyLevels(view); const boxes = new Map<string, HTMLElement>();
        const probe = pathTitle(''); diagram.append(probe); const titleFont = getComputedStyle(probe).font; probe.remove(); const measure = document.createElement('canvas').getContext('2d'); if (measure) measure.font = titleFont;
        roles.replaceChildren(roleHint);
        for (const stage of view.stages) { const role = element('section', '', 'lm-dependency-role'); role.dataset['roleStage'] = stage.id; const choose = element('button'); appendPathParts(choose, dependencyHeadingParts(stage, view.stages)); choose.type = 'button'; choose.title = `${stage.title} — 전체 설명 보기`; choose.onclick = () => { selected = stage.id; render(); saveRoute(); }; const heading = element('div', '', 'lm-role-heading'); heading.append(choose); role.append(heading); const facts = summaryFacts(stage); if (facts.length) for (const fact of facts) role.append(element('span', fact.label, 'lm-role-source'), element('p', fact.text, 'lm-role-description')); else role.append(element('p', stage.summary || '설명 근거가 아직 없습니다.', 'lm-role-description')); if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-role-evidence'); evidence.append(element('summary', '근거')); for (const source of stage.summaryEvidence) evidence.append(pathText('span', `${source.path}${source.line ? `:${source.line}` : ''}`)); heading.append(evidence); } const ai = interpretation(stage.interpretation); if (ai) { ai.classList.add('lm-role-ai'); role.append(ai); } roles.append(role); }
        for (const level of [...new Set(levels.map(group => group.level))]) {
            const row = element('div', '', 'lm-dependency-level'); row.dataset['level'] = String(level); const groups = levels.filter(group => group.level === level);
            for (const group of groups) {
                const region = element('div', '', `lm-dependency-group${group.cyclic ? ' lm-dependency-cycle' : group.foldedCycle ? ' lm-dependency-aggregate' : ''}`); if (group.cyclic || group.foldedCycle) region.append(element('span', '서로 참조하는 폴더 · 안쪽 연결 생략', 'lm-cycle-caption'));
                for (const stage of group.stages) {
                    const box = stage.filePreviews?.length ? element('article', '', 'lm-station lm-folder-files') : element('button', '', 'lm-station'); if (box instanceof HTMLButtonElement) box.type = 'button'; box.dataset['stage'] = stage.id; if (box instanceof HTMLButtonElement) box.setAttribute('aria-pressed', String(stage.id === selected));
                    box.dataset['entry'] = String(model.structuralEntryStageIds?.some(id => { let current: string | undefined = id; while (current) { if (current === stage.id) return true; current = byId.get(current)?.parentId; } return false; }) ?? false);
                    const parts = dependencyHeadingParts(stage, view.stages); const fullName = parts[0] ?? stage.title;
                    const minimum = `min(100%, calc(${Math.ceil(Math.max(...fullName.split('/').map(part => measure?.measureText(part).width ?? part.length * 10))) + 26}px))`; box.style.minWidth = minimum; if (!group.cyclic && !group.foldedCycle) region.style.minWidth = minimum;
                    const counts = `${stage.nodeIds.length}개 파일${stage.folderCount ? ` · 하위 폴더 ${stage.folderCount}개` : ''}`; box.title = `${stage.title} — ${counts}`;
                    const metadata = element('span', counts, 'lm-station-meta');
                    const heading = element('h3', '', 'lm-path-title lm-member-title'); appendPathParts(heading, parts); box.append(heading, metadata);
                    const selectFolder = (): void => { selected = stage.id; render(); saveRoute(); };
                    if (stage.filePreviews?.length) {
                        const select = element('button', '', 'lm-folder-select'); select.type = 'button'; select.setAttribute('aria-pressed', String(stage.id === selected)); select.append(heading, metadata); select.onclick = selectFolder; box.append(select);
                        const files = element('ul', '', 'lm-file-previews');
                        for (const file of stage.filePreviews) {
                            const item = element('li'); const open = element('button', file.name, 'lm-file-open'); open.type = 'button'; open.title = file.name; open.dataset['node'] = file.id; open.onclick = () => ui.openFocus(file.id); item.append(open, element('p', file.summary, 'lm-file-role'));
                            if (file.definition) item.append(element('p', `정의: ${file.definition.name} — ${file.definition.summary}`, 'lm-file-definition'));
                            const evidence = element('details', '', 'lm-file-evidence'); evidence.append(element('summary', '근거'));
                            for (const source of file.summaryEvidence) evidence.append(pathText('span', `${source.path}:${source.line}`));
                            if (file.definition) { const path = stage.directoryPath && stage.directoryPath !== '.' ? `${stage.directoryPath}/${file.name}` : file.name; evidence.append(pathText('span', `${path}:${file.definition.line}`)); }
                            if (evidence.childElementCount > 1) item.append(evidence); files.append(item);
                        }
                        const allFiles = element('button', `파일 ${stage.nodeIds.length}개 모두 보기`, 'lm-file-all'); allFiles.type = 'button'; allFiles.onclick = () => { selectFolder(); for (const group of panel.querySelectorAll<HTMLDetailsElement>('details.lm-group')) group.open = true; panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; box.append(files, allFiles);
                    } else box.onclick = selectFolder;
                    region.append(box); boxes.set(stage.id, box);
                } if (group.stages.length > 1) {
                    const facts = element('div', '', 'lm-internal-facts');
                    for (const flow of internalDependencyFacts(view, group.stages.map(stage => stage.id))) {
                        const source = byId.get(flow.source)?.title ?? flow.source, target = byId.get(flow.target)?.title ?? flow.target;
                        const projectCount = new Set(flow.projectSourceFiles ?? []).size;
                        const count = (flow.count ?? 0) - projectCount;
                        const fact = element('details', '', 'lm-internal-fact'); fact.append(element('summary', `${source}의 파일 ${count}개가 ${target} 사용${projectCount ? ` · 프로젝트 공통 선언 ${projectCount}개` : ''}`), element('p', dependencyFlowDescription(flow)));
                        facts.append(fact);
                    }
                    region.append(facts);
                } if (group.stages.length > 1) { region.dataset['regionIds'] = JSON.stringify(group.stages.map(stage => stage.id)); for (const stage of group.stages) boxes.set(stage.id, region); } row.append(region);
            }
            diagram.append(row);
            const outgoing = view.flows.filter(flow => groups.some(group => group.stages.some(stage => stage.id === flow.source))).length;
            const gap = element('div', '', 'lm-dependency-gap'); gap.dataset['flows'] = String(outgoing); diagram.append(gap);
        }
        const initial = view.stages.find(stage => stage.id === selected); panel.hidden = !initial; panel.replaceChildren(); if (initial) renderPanel(initial);
        redraw = () => {
            const flows = displayedDependencyFlows(view, selected, false).slice(0, 5); roles.style.maxHeight = window.innerWidth > 900 ? `${Math.max(200, window.innerHeight - roles.getBoundingClientRect().top - 12)}px` : ''; roleHint.hidden = window.innerWidth <= 900 || roles.scrollHeight <= roles.clientHeight + 1;
            mode.replaceChildren(); mode.hidden = false;
            const status = element('span', selected ? `선택한 폴더의 연결 ${flows.length}개` : `전체 구조 · 폴더 사이 연결 ${flows.length}개 · 굵기와 숫자: 사용하는 파일 수`); mode.append(status); if (view.stages.length === 1 && view.stages[0]?.filePreviews?.length) mode.append(element('span', '한 폴더 안의 파일을 표시합니다. 파일 간 의존 유무를 뜻하지 않습니다.', 'lm-flat-note'));
            if (selected) { const reset = element('button', '전체 구조'); reset.type = 'button'; reset.onclick = () => { selected = undefined; render(); saveRoute(); }; mode.append(reset); }
            if (view.flows.length > 5) { const toggle = element('button', '전체 연결'); toggle.type = 'button'; toggle.onclick = () => { connections.open = true; connections.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; mode.append(toggle); }
            for (const gap of diagram.querySelectorAll<HTMLElement>('.lm-dependency-gap')) gap.style.height = window.innerWidth > 700 ? '48px' : '72px';
            drawDependencyArrows({ host: diagram, graph, flows, boxes });
            if (Number(graph.dataset['unrouted']) > 0) { connections.open = true; const summary = connections.querySelector('summary'); if (summary) summary.textContent = `전체 덩어리 연결 ${view.flows.length}개 · 밀집한 연결은 아래 목록에서 확인`; }
        }; requestAnimationFrame(redraw);
    };
    const observer = new ResizeObserver(() => redraw()); observer.observe(diagram); render();
    return () => observer.disconnect();
}
