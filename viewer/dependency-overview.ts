import type { LoopStage, LoopUI } from './loop-map-types.js';
import { anchor, chip, element, interpretation, svg } from './loop-map-shared.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';
import { dependencyFlowDescription, dependencyCoverage, dependencyCardRole, featuredDependencyRoles, internalDependencyFacts, dependencyOverviewLevels, dependencyView, displayedDependencyFlows, dependencyHeadingParts, dependencyTitleSegments, packageDependencyLimit, packageDependencyView, chooseMobileDependencyLayout, compactDependencyLabels, mobileDependencyStageIds } from './dependency-layout.js';
import { drawDependencyArrows } from './dependency-arrows.js';
import { drawPackageDependencyArrows } from './dependency-package-arrows.js';

function pathText<K extends keyof HTMLElementTagNameMap>(tag: K, value: string, className = ''): HTMLElementTagNameMap[K] {
    const result = element(tag, '', `${className} lm-path-text`);
    value.split('/').forEach((part, index) => { if (index) result.append(document.createTextNode('/'), element('wbr')); result.append(element('span', part)); }); return result;
}
function pathTitle(value: string): HTMLElement { return pathText('h3', value, 'lm-path-title'); }
function appendPathParts(host: HTMLElement, paths: readonly string[], _context?: readonly string[]): void {
    paths.forEach((path, index) => { if (index) host.append(document.createTextNode(' · '), element('wbr')); const factored = { prefix: '', name: path }; const member = element('span', '', 'lm-heading-member'); if (factored.prefix) member.append(pathText('span', factored.prefix, 'lm-stage-category')); const name = element('span', '', 'lm-title-name'); for (const [partIndex, part] of dependencyTitleSegments(factored.name).entries()) { if (partIndex) name.append(element('wbr')); name.append(element('span', part, `lm-title-segment${factored.name.includes('/') || !/[-\s]/u.test(part) ? ' lm-title-atom' : ''}`)); } member.append(name); host.append(member); });
}

function summaryFacts(stage: LoopStage): readonly { readonly label: string; readonly text: string; }[] { return stage.summaryDetails?.length ? stage.summaryDetails : stage.summaryDetail ? [stage.summaryDetail] : []; }

export function dependencyPanelSummary(stage: LoopStage): string { const facts = summaryFacts(stage); return facts.length ? facts.map(fact => `${fact.label} — ${fact.text}`).join('\n') : stage.summary; }

export function renderDependencyOverview(host: HTMLElement, ui: LoopUI): () => void {
    const model = ui.model; const byId = new Map(model.stages.map(stage => [stage.id, stage]));
    const hint = element('p', '설명 붙이기: Claude Code·Codex에서 lattice 스킬 실행', 'lm-summary-hint');
    const nav = element('nav', '', 'lm-dependency-nav'); nav.setAttribute('aria-label', '덩어리 탐색');
    const mode = element('div', '', 'lm-dependency-mode');
    const diagram = element('div', '', 'lm-dependency-map'); const graph = svg('svg'); graph.classList.add('lm-arrows'); graph.setAttribute('aria-hidden', 'true');
    const connections = element('details', '', 'lm-dependency-connections');
    const analysis = element('section', '', 'lm-analysis-evidence'); analysis.hidden = true; const coverageEvidence = element('p'); host.append(analysis);
    const overview = element('div', '', 'lm-dependency-overview'); const roles = element('aside', '', 'lm-dependency-roles'); const roleHint = element('p', '역할 목록 · 아래로 스크롤', 'lm-role-scroll-hint'); roleHint.hidden = true; roles.setAttribute('aria-label', '덩어리 역할과 설명 근거'); const roleDetails = element('details', '', 'lm-all-role-details'); roleDetails.append(element('summary', '전체 역할 설명'), roles); overview.append(diagram, roles);
    const panel = element('section', '', 'lm-panel'); panel.setAttribute('aria-live', 'polite'); host.append(nav, mode, overview, connections, hint, panel);
    const roots = model.rootStageIds ?? model.stages.filter(stage => !stage.parentId).map(stage => stage.id);
    const packageOverview = packageDependencyView(model);
    const pageSize = packageOverview ? Math.max(12, Math.min(24, roots.length)) : 9;
    const route = readLoopRoute(); const routed = route.stage; let selected = routed;
    let parentId = routed && !roots.includes(routed) ? byId.get(routed)?.parentId : route.parent && byId.has(route.parent) ? route.parent : undefined;
    let page = Math.floor(Math.max(0, (parentId ? byId.get(parentId)?.childIds : roots)?.indexOf(selected ?? '') ?? 0) / pageSize);
    if (!routed) page = Math.min(route.page ?? 0, Math.max(0, Math.ceil((parentId ? byId.get(parentId)?.childIds?.length ?? 0 : roots.length) / pageSize) - 1));
    const saveRoute = (): void => writeLoopRoute({ view: 'loop', stage: selected ?? '', parent: parentId ?? '', page });
    const expandedGroups = new Set<string>(); let autoOpenedConnections = false;
    connections.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('summary')) autoOpenedConnections = false; });
    let redraw = (): void => { };
    let expandedMap = false; let disposed = false;
    const renderPanel = (stage: LoopStage): void => {
        panel.hidden = false; selected = stage.id; for (const role of roles.querySelectorAll<HTMLElement>('[data-role-stage]')) role.setAttribute('aria-current', String(role.dataset['roleStage'] === selected)); for (const button of diagram.querySelectorAll<HTMLButtonElement>('button[data-stage], .lm-folder-select')) button.setAttribute('aria-pressed', String((button.dataset['stage'] ?? button.closest<HTMLElement>('[data-stage]')?.dataset['stage']) === selected));
        panel.replaceChildren(); const header = element('div', '', 'lm-panel-head'); header.append(pathText('h2', stage.title), element('p', dependencyPanelSummary(stage), 'lm-muted lm-panel-summary')); panel.append(header); header.append(element('p', `${(stage.nodeCount ?? stage.nodeIds.length)}개 ${stage.unit}`, 'lm-muted'));
        if (stage.scopePaths?.length) { const scope = element('details', '', 'lm-group'); scope.append(element('summary', `포함한 폴더 ${stage.scopePaths.length}개`)); const paths = element('ul'); for (const path of stage.scopePaths) paths.append(pathText('li', path)); scope.append(paths); panel.append(scope); }
        if (stage.childIds?.length) { const expand = element('button', `하위 덩어리 ${stage.childIds.length}개 펼치기`, 'lm-dependency-expand'); expand.type = 'button'; expand.onclick = () => { parentId = stage.id; page = 0; selected = stage.childIds?.[0]; render(); saveRoute(); }; panel.append(expand); }
        const columns = element('div', '', 'lm-cols'); const content = element('div');
        for (const group of stage.groups) {
            const block = element('details', '', 'lm-group'); block.open = false; block.append(element('summary', `${group.title} ${group.items.length}`));
            const items = element('div', '', 'lm-chips'), more = element('button', '100개 더 보기'); more.type = 'button'; let offset = 0;
            const append = (): void => { for (const item of group.items.slice(offset, offset + 100)) { const button = chip(item.id, ui); if (button) items.append(button); } offset += 100; more.hidden = offset >= group.items.length; };
            more.onclick = append; block.addEventListener('toggle', () => { if (block.open && offset === 0) append(); });
            block.append(items, more); content.append(block);
        }
        const dependencies = element('div');
        for (const [title, values] of [['가져다 쓰는 덩어리', stage.outgoing], ['이 덩어리를 쓰는 곳', stage.incoming]] as const) {
            const block = element('div', '', 'lm-group'); block.append(element('h4', title)); const list = element('ul', '', 'lm-influence'); for (const value of values) {
                const item = element('li'); const target = model.stages.find(other => other.title === value.name);
                if (target) { const link = pathText('button', value.name, 'lm-dependency-link'); link.type = 'button'; link.onclick = () => { selected = target.id; parentId = roots.includes(target.id) ? undefined : target.parentId; const siblings = parentId ? byId.get(parentId)?.childIds ?? [] : roots; page = Math.floor(Math.max(0, siblings.indexOf(target.id)) / pageSize); render(); saveRoute(); }; item.append(link); } else item.append(pathText('b', value.name));
                item.append(element('p', value.description)); list.append(item);
            } block.append(values.length ? list : element('p', '없음', 'lm-muted')); dependencies.append(block);
        }
        columns.append(content, dependencies); panel.append(columns); const note = interpretation(stage.interpretation); if (note) panel.append(note);
        redraw();
        if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-interpretation'); evidence.append(element('summary', '설명 근거')); for (const source of stage.summaryEvidence) evidence.append(element('p', `${source.path}${source.line ? `:${source.line}` : ''}`)); panel.append(evidence); }
    };
    const render = (): void => {
        redraw = () => { }; analysis.replaceChildren(element('h3', '연결 분석 근거'), coverageEvidence); nav.replaceChildren(); diagram.replaceChildren(graph); const ids = parentId ? byId.get(parentId)?.childIds ?? [] : roots; const visibleIds = ids.slice(page * pageSize, page * pageSize + pageSize); const view = dependencyView(model, visibleIds);
        if (parentId) { const parent = byId.get(parentId); const back = pathText('button', `← ${parent?.parentId ? byId.get(parent.parentId)?.title ?? '상위' : '전체 구조'}`); back.type = 'button'; back.onclick = () => { selected = parentId; parentId = parent?.parentId; page = 0; render(); saveRoute(); }; nav.append(back, pathText('span', parent?.title ?? '')); }
        nav.hidden = !parentId && ids.length <= pageSize;
        if (ids.length > pageSize) nav.append(element('span', `덩어리 ${ids.length}개 중 ${page * pageSize + 1}–${Math.min(ids.length, (page + 1) * pageSize)}개 표시`));
        if (ids.length > pageSize) for (const [text, delta] of [['이전', -1], ['다음', 1]] as const) { const button = element('button', delta > 0 && (page + 1) * pageSize < ids.length ? `다음 ${Math.min(pageSize, ids.length - (page + 1) * pageSize)}개` : text); button.type = 'button'; button.disabled = page + delta < 0 || (page + delta) * pageSize >= ids.length; button.onclick = () => { page += delta; selected = undefined; render(); saveRoute(); }; nav.append(button); }
        const flat = view.stages.length === 1 && Boolean(view.stages[0]?.filePreviews?.length);
        connections.replaceChildren(element('summary', flat ? '파일 미리보기 근거' : `전체 덩어리 연결 ${view.flows.length}개`));
        if (flat) connections.append(element('p', '파일 미리보기는 명시된 진입점, 파일 안의 공개 이름 출현 수, 파일명 순으로 고릅니다. 파일 간 의존 유무를 판정하는 표시는 아닙니다.'));
        const connectionList = element('ul', '', 'lm-influence'); for (const flow of view.flows) { const item = element('li'); item.append(pathText('span', byId.get(flow.source)?.title ?? flow.source), document.createTextNode(' → '), pathText('span', byId.get(flow.target)?.title ?? flow.target), document.createTextNode(` — ${dependencyFlowDescription(flow)}`)); connectionList.append(item); } connections.append(connectionList);

        const levels = dependencyOverviewLevels(view);
        const mobileIds = mobileDependencyStageIds(view, displayedDependencyFlows(view, selected, false));
        const boxes = new Map<string, HTMLElement>();
        const probe = pathTitle(''); probe.classList.add('lm-member-title'); const probeBox = element('div', '', 'lm-station'); probeBox.append(probe); diagram.append(probeBox); const titleFont = getComputedStyle(probe).font; probeBox.remove(); const measure = document.createElement('canvas').getContext('2d'); if (measure) measure.font = titleFont; const dependencyProbe = element('p', '', 'lm-card-dependencies'); diagram.append(dependencyProbe); const dependencyFont = getComputedStyle(dependencyProbe).font; dependencyProbe.remove(); const dependencyMeasure = document.createElement('canvas').getContext('2d'); if (dependencyMeasure) dependencyMeasure.font = dependencyFont;
        roles.replaceChildren(roleHint);
        const entryIds = view.stages.filter(stage => model.structuralEntryStageIds?.some(id => { let current: string | undefined = id; while (current) { if (current === stage.id) return true; current = byId.get(current)?.parentId; } return false; })).map(stage => stage.id);
        const curated = view.stages.some(stage => stage.interpretation && !stage.interpretation.stale); const flatFileNotes = view.stages.some(stage => stage.filePreviews?.some(file => file.interpretation && !file.interpretation.stale)); const inlineRoles = (packageOverview && !flat) || (curated && view.stages.length > 1) || flatFileNotes; const missingRoles = view.stages.every(stage => !dependencyCardRole(stage).label); const unifiedRows = levels.some(group => group.stages.length > 1); overview.classList.toggle('lm-wide-structure', missingRoles || unifiedRows); overview.classList.toggle('lm-flat-files', flat); overview.classList.toggle('lm-package-overview', packageOverview && !flat); overview.classList.toggle('lm-inline-roles', inlineRoles); if (inlineRoles || missingRoles || unifiedRows) { roleDetails.append(roles); overview.append(roleDetails); } else { overview.append(roles); roleDetails.remove(); }
        const featured = curated ? featuredDependencyRoles(view, entryIds) : view.stages;
        const featuredIds = new Set(featured.map(stage => stage.id));
        const remaining = view.stages.filter(stage => !featuredIds.has(stage.id));
        const moreRoles = element('details', '', 'lm-more-roles'); moreRoles.append(element('summary', `나머지 ${remaining.length}개 역할`));
        roles.classList.toggle('lm-featured-roles', curated);

        for (const stage of [...featured, ...remaining]) { const role = element('section', '', 'lm-dependency-role'); role.dataset['roleStage'] = stage.id; role.classList.toggle('lm-featured-role', curated && featuredIds.has(stage.id)); const choose = element('button'); appendPathParts(choose, dependencyHeadingParts(stage, view.stages)); choose.type = 'button'; choose.title = `${stage.title} — 전체 설명 보기`; choose.onclick = () => { selected = stage.id; render(); saveRoute(); }; const heading = element('div', '', 'lm-role-heading'); heading.append(choose); role.append(heading); const facts = summaryFacts(stage); if (facts.length) for (const fact of facts) role.append(element('span', fact.label, 'lm-role-source'), element('p', fact.text, 'lm-role-description')); else role.append(element('p', stage.summary || '설명 근거가 아직 없습니다.', 'lm-role-description')); if (stage.summaryEvidence?.length) { const evidence = element('details', '', 'lm-role-evidence'); evidence.append(element('summary', '근거')); for (const source of stage.summaryEvidence) evidence.append(pathText('span', `${source.path}${source.line ? `:${source.line}` : ''}`)); heading.append(evidence); } const ai = interpretation(stage.interpretation); if (ai) { ai.classList.add('lm-role-ai'); role.append(ai); } (featuredIds.has(stage.id) ? roles : moreRoles).append(role); }
        if (remaining.length) roles.append(moreRoles);
        for (const level of [...new Set(levels.map(group => group.level))].sort((a, b) => a - b)) {
            const row = element('div', '', 'lm-dependency-level'); row.dataset['level'] = String(level); const groups = levels.filter(group => group.level === level); row.classList.toggle('lm-secondary-packages', groups.every(group => group.stages.every(stage => !mobileIds.has(stage.id))));
            for (const group of groups) {
                const region = element('div', '', `lm-dependency-group${group.cyclic ? ' lm-dependency-cycle' : group.foldedCycle ? ' lm-dependency-aggregate' : ''}`); if (inlineRoles) { region.style.setProperty('--lm-member-basis', group.stages.length > 3 ? '200px' : '150px'); region.style.flexGrow = String(group.stages.length); region.style.minWidth = group.stages.length > 1 ? `${(group.stages.length > 3 ? 3 : 2) * 150 + 40}px` : '150px'; } if (group.cyclic || group.foldedCycle) region.append(element('div', '상호 참조 · 이 카드 → 사용하는 폴더 (파일 수)', 'lm-cycle-caption'));
                const grouped = group.stages.length > 1; if (grouped) region.classList.add('lm-unified-group');
                const internal = internalDependencyFacts(view, group.stages.map(stage => stage.id));
                const groupIds = group.stages.map(stage => stage.id).sort(); region.classList.toggle('lm-secondary-packages', groupIds.every(id => !mobileIds.has(id)));
                const groupNote = model.structuralDependencyGroups?.find(item => item.stageIds.length === groupIds.length && [...item.stageIds].sort().every((id, index) => id === groupIds[index]))?.interpretation;
                if (groupNote) {
                    const summary = element('div', '', 'lm-dependency-group-summary');
                    summary.append(element('p', groupNote.summary));
                    const evidence = interpretation(groupNote);
                    if (evidence) { evidence.className = 'lm-group-evidence'; const label = evidence.querySelector('summary'); if (label) label.textContent = `AI 요약 근거${groupNote.stale ? ' · 원본 변경됨' : ''}`; evidence.querySelector('p')?.remove(); (region.querySelector('.lm-cycle-caption') ?? summary).append(evidence); }
                    region.append(summary);
                }
                let memberHost: HTMLElement = region;
                if (grouped) {
                    const groupKey = JSON.stringify(groupIds);
                    region.prepend(element('h3', `연결 묶음 · 덩어리 ${group.stages.length}개`, 'lm-unified-title'));
                    const caption = region.querySelector('.lm-cycle-caption');
                    if (caption?.firstChild) caption.firstChild.textContent = '서로 연결된 폴더';
                    analysis.append(element('p', `${group.stages.map(stage => stage.title).join(' · ')}: ${group.cyclic ? '정적 참조 순환' : '폴더 집계 연결'} · 내부 위아래 순서 없음`));
                    memberHost = element('div', '', 'lm-member-rows'); region.append(memberHost);
                    const details = element('details', '', 'lm-member-details'); details.open = expandedGroups.has(groupKey) || group.stages.some(stage => stage.id === selected);
                    details.append(element('summary', '폴더별 전체 설명과 근거'));
                    for (const stage of group.stages) { const full = element('section', '', 'lm-member-full'); full.append(pathText('h4', stage.title)); const note = interpretation(stage.interpretation); if (note) { note.setAttribute('open', ''); full.append(note); } else full.append(element('p', dependencyCardRole(stage).label ? stage.summary : '역할 설명 없음 — 요약 실행 필요')); for (const source of stage.summaryEvidence ?? []) full.append(pathText('p', `${source.path}${source.line ? `:${source.line}` : ''}`)); details.append(full); }
                    region.append(details);
                    details.addEventListener('toggle', () => { if (details.open) expandedGroups.add(groupKey); else expandedGroups.delete(groupKey); redraw(); });
                }
                for (const stage of group.stages) {
                    const showFiles = flat && Boolean(stage.filePreviews?.length);
                    const box = showFiles ? element('article', '', 'lm-station lm-folder-files') : element('button', '', 'lm-station'); if (box instanceof HTMLButtonElement) box.type = 'button'; box.dataset['stage'] = stage.id; if (box instanceof HTMLButtonElement) box.setAttribute('aria-pressed', String(stage.id === selected));
                    box.dataset['entry'] = String(model.structuralEntryStageIds?.some(id => { let current: string | undefined = id; while (current) { if (current === stage.id) return true; current = byId.get(current)?.parentId; } return false; }) ?? false);
                    const parts = dependencyHeadingParts(stage, view.stages); const fullName = parts[0] ?? stage.title; const outgoing = internal.filter(flow => flow.source === stage.id); const targetWidths = outgoing.flatMap(flow => ((byId.get(flow.target)?.title ?? flow.target).match(/[^/]+\/?/g) ?? []).map(part => dependencyMeasure?.measureText(part).width ?? part.length * 8));
                    const minimum = `min(100%, calc(${Math.ceil(Math.max(...targetWidths, ...(fullName.match(/[^/]+\/?/g) ?? [fullName]).map(part => measure?.measureText(part).width ?? part.length * 10))) + 26}px))`; if (!grouped) box.style.minWidth = packageOverview && !flat ? 'min(100%, 220px)' : minimum; if (!group.cyclic && !group.foldedCycle) region.style.minWidth = packageOverview && !flat ? 'min(100%, 220px)' : minimum;
                    const counts = `${(stage.nodeCount ?? stage.nodeIds.length)}개 파일${stage.folderCount ? ` · 하위 폴더 ${stage.folderCount}개` : ''}`; box.title = `${stage.title} — ${counts}`; box.setAttribute('aria-label', box.title);
                    const metadata = element('span', counts, 'lm-station-meta');
                    const heading = element('h3', '', 'lm-path-title lm-member-title'); appendPathParts(heading, parts); box.append(heading, metadata); if ((inlineRoles || grouped) && !showFiles) { const role = dependencyCardRole(stage); const summary = element('p', role.text, 'lm-inline-role'); summary.title = stage.summary; if (role.label) metadata.append(document.createTextNode(' · '), element('span', role.label, 'lm-inline-ai-label')); box.append(summary); }
                    if (grouped && !inlineRoles) { metadata.textContent = ` · ${(stage.nodeCount ?? stage.nodeIds.length)}개 파일`; heading.append(metadata); }
                    const selectFolder = (): void => { selected = stage.id; render(); saveRoute(); };
                    if (showFiles && stage.filePreviews) {
                        const select = element('button', '', 'lm-folder-select'); select.type = 'button'; select.setAttribute('aria-pressed', String(stage.id === selected)); select.append(heading, metadata); select.onclick = selectFolder; box.append(select); if (flatFileNotes) { const role = dependencyCardRole(stage); if (role.label) metadata.append(document.createTextNode(' · '), element('span', role.label, 'lm-inline-ai-label')); box.append(element('p', role.text, 'lm-inline-role')); }
                        const files = element('ul', '', 'lm-file-previews');
                        for (const file of stage.filePreviews) {
                            const item = element('li'); const open = element('button', file.name, 'lm-file-open'); open.type = 'button'; open.title = file.name; open.dataset['node'] = file.id; open.onclick = () => ui.openFocus(file.id); item.append(open, element('p', file.summary, 'lm-file-role'));
                            if (file.definition && !(file.summary.includes(file.definition.name) && file.summary.includes(file.definition.summary)) && (!file.interpretation || file.interpretation.stale)) item.append(element('p', `정의: ${file.definition.name} — ${file.definition.summary}`, 'lm-file-definition'));
                            if (file.references?.length) {
                                const references = element('details', '', 'lm-file-references'); references.append(element('summary', `참조하는 파일 ${file.references.length}개`, 'lm-role-source'));
                                const referenceEvidence = element('details', '', 'lm-file-evidence'); referenceEvidence.append(element('summary', '타입 참조 근거'));
                                for (const reference of file.references) {
                                    const row = element('p', '', 'lm-file-reference'); row.dataset['target'] = reference.targetId; const target = element('button', reference.targetName, 'lm-file-reference-target'); target.type = 'button'; target.onclick = () => ui.openFocus(reference.targetId); row.append(target, document.createTextNode(` (${reference.names.join(' · ')})`)); references.append(row);
                                    for (const source of reference.evidence) { const label = `${source.role === 'use' ? '사용' : '정의'} ${source.name}: ${source.path}:${source.line}`; referenceEvidence.append(source.url ? anchor(label, source.url) : pathText('span', label)); }
                                }
                                references.append(referenceEvidence); item.append(references);
                            }
                            const evidence = element('details', '', 'lm-file-evidence'); evidence.append(element('summary', '근거'));
                            for (const source of file.summaryEvidence) evidence.append(pathText('span', `${source.path}:${source.line}`));
                            if (file.definition) { evidence.append(element('p', `정의: ${file.definition.name} — ${file.definition.summary}`)); const path = stage.directoryPath && stage.directoryPath !== '.' ? `${stage.directoryPath}/${file.name}` : file.name; evidence.append(pathText('span', `${path}:${file.definition.line}`)); }
                            if (evidence.childElementCount > 1) item.append(evidence); const note = interpretation(file.interpretation); if (note) { note.classList.add('lm-file-ai'); item.append(note); } files.append(item);
                        }
                        const allFiles = element('button', `파일 ${(stage.nodeCount ?? stage.nodeIds.length)}개 모두 보기`, 'lm-file-all'); allFiles.type = 'button'; allFiles.onclick = () => { selectFolder(); for (const group of panel.querySelectorAll<HTMLDetailsElement>('details.lm-group')) group.open = true; panel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; box.append(files, allFiles);
                    } else box.onclick = selectFolder;
                    if (outgoing.length) {
                        const dependencies = element('p', '→ ', 'lm-card-dependencies');
                        outgoing.forEach((flow, index) => { if (index) dependencies.append(document.createTextNode(' · ')); const target = pathText('span', byId.get(flow.target)?.title ?? flow.target, 'lm-card-dependency'); target.dataset['target'] = flow.target; target.dataset['count'] = String(flow.count ?? 0); const projectCount = flow.projectCount ?? new Set(flow.projectSourceFiles ?? []).size; target.append(document.createTextNode(' '), element('span', `(${(flow.count ?? 0) - projectCount}개 파일${projectCount ? ` + 공통 ${projectCount}` : ''})`, 'lm-relation-count')); target.title = dependencyFlowDescription(flow); dependencies.append(target); });
                        box.append(dependencies);
                    }
                    if (!flat && !stage.incoming.length && !stage.outgoing.length) analysis.append(element('p', `${stage.title}: 표시 범위의 명시 import 연결 없음`));
                    memberHost.append(box); boxes.set(stage.id, box);
                } if (group.stages.length > 1) { region.dataset['regionIds'] = JSON.stringify(group.stages.map(stage => stage.id)); if (!packageOverview) for (const stage of group.stages) boxes.set(stage.id, region); } row.append(region);
            }
            diagram.append(row);
            const outgoing = view.flows.filter(flow => groups.some(group => group.stages.some(stage => stage.id === flow.source))).length;
            const gap = element('div', '', 'lm-dependency-gap'); gap.dataset['flows'] = String(outgoing); gap.classList.toggle('lm-secondary-packages', row.classList.contains('lm-secondary-packages')); diagram.append(gap);
        }
        const initial = view.stages.find(stage => stage.id === selected); panel.hidden = !initial; panel.replaceChildren(); if (initial) renderPanel(initial);
        let packageGap = window.innerWidth > 700 ? 48 : 32;
        let previousGeometry = '';
        let headingsCompacted = false;
        const originalHeadings = new Map([...boxes].map(([id, box]) => [id, [...(box.querySelector('.lm-member-title')?.childNodes ?? [])].map(node => node.cloneNode(true))]));
        redraw = () => {
            if (disposed) return;
            const flows = displayedDependencyFlows(view, selected, false);
            const compact = packageOverview && !flat && window.innerWidth <= 700 && !expandedMap;
            overview.classList.toggle('lm-compact-packages', compact);
            if (!compact) for (const item of diagram.querySelectorAll<HTMLElement>('[style]')) if (item.style.gridColumn === '1 / -1') item.style.gridColumn = '';
            const shortNames = compactDependencyLabels(view.stages);
            const prefixes = [...new Set([...shortNames.values()].map(label => label.prefix).filter(Boolean))];
            const prefixLegend = diagram.querySelector('.lm-compact-prefixes') ?? element('p', '', 'lm-compact-prefixes'); prefixLegend.replaceChildren();
            if (compact && prefixes.length) { prefixes.forEach((prefix, index) => { if (index) prefixLegend.append(document.createTextNode(' · ')); prefixLegend.append(document.createTextNode(`[${index + 1}] ${prefix}`)); }); diagram.prepend(prefixLegend); } else prefixLegend.remove();
            if (compact !== headingsCompacted) {
                for (const stage of view.stages) {
                    const heading = boxes.get(stage.id)?.querySelector<HTMLElement>('.lm-member-title'); if (!heading) continue; heading.replaceChildren();
                    if (compact) { const label = shortNames.get(stage.id); if (label?.prefix) heading.append(element('small', `[${prefixes.indexOf(label.prefix) + 1}]`, 'lm-name-prefix')); heading.append(pathText('span', label?.name ?? stage.title)); }
                    else heading.append(...(originalHeadings.get(stage.id) ?? []).map(node => node.cloneNode(true)));
                }
                headingsCompacted = compact;
            }
            if (!compact) delete graph.dataset['viewportFit'];
            const activeBoxes = compact ? new Map([...boxes].filter(([id]) => mobileIds.has(id))) : boxes;
            const geometry = (): string => `${compact}:${selected ?? ''}:${diagram.clientWidth}:${diagram.clientHeight}:${window.innerHeight}:${diagram.getBoundingClientRect().top + window.scrollY}:${flows.map(flow => `${flow.source}:${flow.target}:${flow.count}`).join('|')}`;
            if (compact && geometry() === previousGeometry) return;
            const sidebarRoles = roles.parentElement === overview; roles.style.maxHeight = sidebarRoles && window.innerWidth > 900 ? `${Math.max(200, window.innerHeight - roles.getBoundingClientRect().top - 12)}px` : ''; roleHint.hidden = !sidebarRoles || window.innerWidth <= 900 || roles.scrollHeight <= roles.clientHeight + 1;
            mode.hidden = false;
            const flatStage = flat ? view.stages[0] : undefined;
            const spaceRoutes = (): void => { for (const gap of diagram.querySelectorAll<HTMLElement>('.lm-dependency-gap')) gap.style.height = packageOverview ? `${packageGap}px` : window.innerWidth > 700 ? '48px' : '72px'; };
            spaceRoutes();
            let shown: ReturnType<typeof displayedDependencyFlows> = compact ? [] : packageOverview ? drawPackageDependencyArrows({ host: diagram, graph, flows, boxes: activeBoxes, names: new Map(view.stages.map(stage => [stage.id, stage.title])) }) : drawDependencyArrows({ host: diagram, graph, flows, boxes, view });
            if (compact) {
                const availableHeight = window.innerHeight - (diagram.getBoundingClientRect().top + window.scrollY);
                type Trial = { readonly columns: number; readonly gap: number; readonly memberGap: number; readonly height: number; readonly routed: number; readonly required: number; readonly contained: boolean; readonly wide: readonly HTMLElement[]; readonly drawing: readonly Node[]; readonly pairs: string; readonly shown: ReturnType<typeof displayedDependencyFlows>; };
                let chosen: Trial | undefined;
                for (const candidate of [{ columns: 3, gap: 24, memberGap: 48 }, { columns: 2, gap: 24, memberGap: 80 }, { columns: 2, gap: 32, memberGap: 80 }, { columns: 2, gap: 48, memberGap: 80 }, { columns: 2, gap: 56, memberGap: 80 }, { columns: 1, gap: 24, memberGap: 48 }]) {
                    diagram.style.setProperty('--lm-compact-columns', String(candidate.columns));
                    diagram.style.setProperty('--lm-compact-gap', `${candidate.gap}px`); diagram.style.setProperty('--lm-compact-member-gap', `${candidate.memberGap}px`);
                    for (const row of diagram.querySelectorAll<HTMLElement>('.lm-dependency-level')) { const members = [...row.children].filter(child => !child.classList.contains('lm-secondary-packages')); row.classList.toggle('lm-single-package', members.length === 1); }
                    for (const box of activeBoxes.values()) { const title = box.querySelector<HTMLElement>('.lm-member-title'); if (!title || !measure) continue; measure.font = getComputedStyle(title).font; const nameWidth = Math.max(...(title.querySelector('.lm-path-text')?.textContent ?? title.textContent ?? '').split('/').map(part => measure.measureText(part).width)) + 10; const region = box.parentElement?.classList.contains('lm-member-rows') ? box : box.parentElement; if (region) { region.style.gridColumn = ''; const normalWidth = region.getBoundingClientRect().width; if (nameWidth > normalWidth) region.style.gridColumn = '1 / -1'; } }
                    packageGap = candidate.gap; spaceRoutes();
                    const origin = diagram.getBoundingClientRect();
                    const readable = [...activeBoxes.values()].every(box => { const title = box.querySelector<HTMLElement>('.lm-member-title'); return !title || title.scrollWidth <= title.clientWidth + 1 && title.scrollHeight <= title.clientHeight + 1; });
                    if (!readable && chosen) continue;
                    const routed = drawPackageDependencyArrows({ compact: true, host: diagram, graph, flows, boxes: activeBoxes, names: new Map(view.stages.map(stage => [stage.id, stage.title])) });
                    const rectangles = [...activeBoxes.values()].map(box => box.getBoundingClientRect());
                    for (const item of graph.querySelectorAll<SVGGraphicsElement>('.lm-dependency-flow, .lm-dependency-label')) {
                        const rect = item.getBoundingClientRect(); const padding = item.classList.contains('lm-dependency-flow') ? Number(item.getAttribute('stroke-width') ?? 1) / 2 : 4;
                        rectangles.push(new DOMRect(rect.x - padding, rect.y - padding, rect.width + 2 * padding, rect.height + 2 * padding));
                        if (item instanceof SVGPathElement && item.hasAttribute('marker-end')) {
                            const length = item.getTotalLength(), tip = item.getPointAtLength(length), prior = item.getPointAtLength(Math.max(0, length - 1)); const scale = Number(item.getAttribute('stroke-width') ?? 1), matrix = item.getScreenCTM();
                            const distance = Math.hypot(tip.x - prior.x, tip.y - prior.y);
                            if (matrix && distance > 0) {
                                const dx = (tip.x - prior.x) / distance, dy = (tip.y - prior.y) / distance;
                                const vertices = [[-4.5, -2.5], [.5, 0], [-4.5, 2.5]].map(([x = 0, y = 0]) => new DOMPoint(tip.x + (x * dx - y * dy) * scale, tip.y + (x * dy + y * dx) * scale).matrixTransform(matrix));
                                const left = Math.min(...vertices.map(point => point.x)), top = Math.min(...vertices.map(point => point.y)); rectangles.push(new DOMRect(left, top, Math.max(...vertices.map(point => point.x)) - left, Math.max(...vertices.map(point => point.y)) - top));
                            }
                        }
                    }
                    const trial: Trial = { ...candidate, height: Math.max(0, ...rectangles.map(rect => rect.bottom - origin.top)), routed: routed.length, required: flows.length, contained: readable && rectangles.every(rect => rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0), wide: [...diagram.querySelectorAll<HTMLElement>('[style]')].filter(item => item.style.gridColumn === '1 / -1'), drawing: [...graph.childNodes].map(node => node.cloneNode(true)), pairs: graph.dataset['unroutedPairs'] ?? '[]', shown: routed };
                    chosen = chooseMobileDependencyLayout(chosen ? [chosen, trial] : [trial], availableHeight);
                    if (trial.contained && trial.routed === trial.required && trial.height <= availableHeight) break;
                }
                if (chosen) {
                    diagram.style.setProperty('--lm-compact-columns', String(chosen.columns)); diagram.style.setProperty('--lm-compact-gap', `${chosen.gap}px`); diagram.style.setProperty('--lm-compact-member-gap', `${chosen.memberGap}px`);
                    for (const item of diagram.querySelectorAll<HTMLElement>('[style]')) if (item.style.gridColumn === '1 / -1') item.style.gridColumn = ''; for (const item of chosen.wide) item.style.gridColumn = '1 / -1';
                    packageGap = chosen.gap; spaceRoutes();
                    const bounds = diagram.getBoundingClientRect(); graph.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`); graph.setAttribute('width', String(bounds.width)); graph.setAttribute('height', String(bounds.height)); graph.replaceChildren(...chosen.drawing);
                    shown = chosen.shown; graph.dataset['unrouted'] = String(flows.length - shown.length); graph.dataset['unroutedPairs'] = chosen.pairs;
                    graph.dataset['viewportFit'] = String(chosen.contained && chosen.height <= availableHeight && shown.length === flows.length);
                }
            }
            if (packageOverview && !compact) for (const gap of [72, 96, 128]) {
                if (shown.length === flows.length) break;
                if (gap <= packageGap) continue;
                packageGap = gap; spaceRoutes();
                shown = drawPackageDependencyArrows({ host: diagram, graph, flows, boxes: activeBoxes, names: new Map(view.stages.map(stage => [stage.id, stage.title])) });
            }
            if (!packageOverview) for (let count = flows.length - 1; count >= 0 && (Number(graph.dataset['unrouted']) > 0 || Number(graph.dataset['unplacedLabels']) > 0); count--) shown = drawDependencyArrows({ host: diagram, graph, flows: flows.slice(0, count), boxes, view });
            const coverage = dependencyCoverage(view, shown);
            const measuredTop = diagram.getBoundingClientRect().top; mode.replaceChildren();
            const status = element('span', flatStage ? `한 폴더의 파일 구성 · 파일 ${(flatStage.nodeCount ?? flatStage.nodeIds.length)}개 중 ${flatStage.filePreviews?.length ?? 0}개 미리보기` : packageOverview ? `의존 방향 ${shown.length}/${displayedDependencyFlows(view, selected, true).length}개 · 파일 수 순${flows.some(flow => (flow.projectCount ?? flow.projectSourceFiles?.length ?? 0) > 0) ? ' · 파일+선언' : ''}${shown.length < flows.length ? ` · 경로 미표시 ${flows.length - shown.length}개` : ''}` : (selected ? '선택한 폴더' : '')); mode.append(status);
            if (packageOverview && !flat && window.innerWidth <= 700) { const expand = element('button', expandedMap ? '지도 접기' : `전체 ${view.stages.length}개 펼치기`); expand.type = 'button'; expand.setAttribute('aria-expanded', String(expandedMap)); expand.onclick = () => { expandedMap = !expandedMap; render(); }; mode.append(expand); }
            coverageEvidence.textContent = `외부 화살표 ${coverage.externalArrows}개 · 묶음 내부 ${coverage.internalDirections}방향 · 생략한 외부 화살표 ${coverage.hiddenExternalArrows}개`;
            if (packageOverview) coverageEvidence.textContent = `표시한 의존 방향 ${shown.length}개 · 전체 ${view.flows.length}개 · 나머지 ${view.flows.length - shown.length}개는 전체 연결에서 확인`;
            if (selected) { const reset = element('button', '전체 구조'); reset.type = 'button'; reset.onclick = () => { selected = undefined; render(); saveRoute(); }; mode.append(reset); }
            if (view.flows.length > (packageOverview ? packageDependencyLimit : 5)) { const toggle = element('button', packageOverview ? `나머지 ${Math.max(0, view.flows.length - shown.length)}개 연결` : '전체 연결'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(connections.open)); toggle.onclick = () => { autoOpenedConnections = false; connections.open = !connections.open; toggle.setAttribute('aria-expanded', String(connections.open)); if (connections.open) connections.scrollIntoView({ block: 'start', behavior: 'smooth' }); }; mode.append(toggle); }
            if (Number(graph.dataset['unrouted']) > 0 || Number(graph.dataset['unplacedLabels']) > 0) { if (!connections.open) autoOpenedConnections = true; connections.open = true; const summary = connections.querySelector('summary'); if (summary) summary.textContent = `전체 덩어리 연결 ${view.flows.length}개 · 밀집한 연결은 아래 목록에서 확인`; } else if (autoOpenedConnections) { connections.open = false; autoOpenedConnections = false; const summary = connections.querySelector('summary'); if (summary) summary.textContent = `전체 덩어리 연결 ${view.flows.length}개`; }
            if (Math.abs(diagram.getBoundingClientRect().top - measuredTop) > 1) requestAnimationFrame(redraw); else previousGeometry = geometry();
        }; requestAnimationFrame(redraw);
    };
    const resize = (): void => redraw(); const observer = new ResizeObserver(resize); observer.observe(diagram); window.addEventListener('resize', resize); render();
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); };
}
