import type { LoopStage, LoopUI } from './loop-map-types.js';
import { chip, element, interpretation, svg } from './loop-map-shared.js';
import { readLoopRoute, writeLoopRoute } from './loop-map-route.js';

export function renderLoopOverview(host: HTMLElement, ui: LoopUI): () => void {
    const model = ui.model; if (model.lead) host.append(element('p', model.lead, 'lm-lead'));
    const ring = element('div', '', `lm-ring${model.stages.length === 6 ? ' lm-ring-six' : ''}`); const arrows = svg('svg'); arrows.classList.add('lm-arrows'); arrows.setAttribute('aria-hidden', 'true'); ring.append(arrows);
    const buttons = new Map<string, HTMLButtonElement>(); const positions = [[2, 1], [3, 1], [4, 2], [3, 3], [2, 3], [1, 2]] as const;
    for (const [index, stage] of model.stages.entries()) {
        const button = element('button', '', 'lm-station'); button.type = 'button'; button.dataset['stage'] = stage.id; button.setAttribute('aria-pressed', 'false');
        if (model.stages.length === 6) { button.style.setProperty('--station-column', String(positions[index]?.[0] ?? 1)); button.style.setProperty('--station-row', String(positions[index]?.[1] ?? 1)); }
        const members = stage.nodeIds.flatMap(id => { const node = ui.byId.get(id); return node ? [node] : []; }); const present = members.filter(node => node.status === 'present').length; const known = members.some(node => node.status !== 'unknown');
        const meta = element('span', '', 'lm-station-meta'); meta.append(element('span', `${stage.unit} ${members.length}`, 'lm-mono'));
        if (known) { const bar = element('span', '', 'lm-bar'); bar.title = model.statusLabels.present; const fill = element('i'); fill.style.width = `${present / Math.max(1, members.length) * 100}%`; bar.append(fill); const count = element('span', `● ${present}`, 'lm-mono lm-live-count'); count.title = model.statusLabels.present; count.setAttribute('aria-label', `${model.statusLabels.present} ${present}`); meta.append(bar, count); } else meta.append(element('span', model.statusLabels.unknown, 'lm-muted'));
        button.append(element('span', String(index + 1).padStart(2, '0'), 'lm-number'), element('h3', stage.title), element('span', stage.summary, 'lm-station-line'), meta); ring.append(button); buttons.set(stage.id, button);
    }
    if (model.center) { const center = element('div', '', 'lm-center'); center.append(element('h3', model.center.title), element('p', model.center.description)); ring.append(center); }
    host.append(ring); const panel = element('section', '', 'lm-panel'); panel.setAttribute('aria-live', 'polite'); host.append(panel);
    const renderStage = (stage: LoopStage): void => {
        for (const [id, button] of buttons) button.setAttribute('aria-pressed', String(id === stage.id)); panel.replaceChildren(); const header = element('div', '', 'lm-panel-head'); header.append(element('span', `${String(model.stages.indexOf(stage) + 1).padStart(2, '0')} / ${String(model.stages.length).padStart(2, '0')}`, 'lm-number'), element('h2', stage.title), element('span', stage.summary, 'lm-muted')); panel.append(header);
        const columns = element('div', '', 'lm-cols'); const content = element('div');
        for (const group of stage.groups) {
            const block = element('div', '', 'lm-group'); block.append(element('h4', group.title)); const items = element('div', '', group.items.some(item => item.note) ? 'lm-rows' : 'lm-chips');
            for (const item of group.items) { const button = chip(item.id, ui); if (!button) continue; if (item.note) { const row = element('div', '', 'lm-row'); row.append(button, element('p', item.note)); items.append(row); } else items.append(button); } block.append(items); content.append(block);
        }
        const influence = element('div'); for (const [title, values] of [['이 단계가 영향을 주는 곳', stage.outgoing], ['이 단계가 영향을 받는 곳', stage.incoming]] as const) { const block = element('div', '', 'lm-group'); block.append(element('h4', title)); const list = element('ul', '', 'lm-influence'); for (const value of values) { const row = element('li'); row.append(element('b', value.name), element('p', value.description)); list.append(row); } block.append(values.length ? list : element('p', '없음', 'lm-muted')); influence.append(block); }
        columns.append(content, influence); panel.append(columns); const note = interpretation(stage.interpretation); if (note) panel.append(note);
    };
    for (const stage of model.stages) { const button = buttons.get(stage.id); if (button) button.onclick = () => { renderStage(stage); writeLoopRoute({ view: 'loop', stage: stage.id }); }; }
    const selected = readLoopRoute().stage ?? model.defaultStage; const initial = model.stages.find(stage => stage.id === selected) ?? model.stages[0]; if (initial) renderStage(initial);
    for (const strip of model.strips ?? []) {
        const section = element('section', '', 'lm-strip'); section.append(element('h2', strip.title), element('p', strip.description)); const groups = element('div', '', 'lm-after');
        for (const [index, group] of strip.groups.entries()) { if (index) groups.append(element('span', '→', 'lm-after-arrow')); const box = element('div', '', 'lm-after-box'); box.append(element('h3', group.title)); const chips = element('div', '', 'lm-chips'); for (const id of group.nodeIds) { const button = chip(id, ui); if (button) chips.append(button); } box.append(chips); groups.append(box); } section.append(groups); host.append(section);
    }
    if (model.places) {
        const section = element('section', '', 'lm-strip'); section.append(element('h2', model.places.title), element('p', model.places.description)); const places = element('div', '', 'lm-places');
        for (const [index, id] of model.places.nodeIds.entries()) { const node = ui.byId.get(id); if (!node) continue; const button = element('button', '', 'lm-place'); button.type = 'button'; button.append(element('span', `${String(node.ordinal ?? index + 1).padStart(2, '0')}${node.status === 'present' ? ` · ${model.statusLabels.present}` : ''}`, 'lm-number'), element('b', node.name), element('span', node.summary, 'lm-place-summary')); if (node.catalogSummary) button.append(element('span', node.catalogSummary, 'lm-place-note')); button.onclick = () => ui.openFocus(id); places.append(button); } section.append(places); host.append(section);
    }
    const markerId = `loop-flow-${crypto.randomUUID()}`;
    const redraw = (): void => {
        const bounds = ring.getBoundingClientRect(); if (!bounds.width) return; arrows.replaceChildren(); arrows.setAttribute('width', String(bounds.width)); arrows.setAttribute('height', String(bounds.height)); arrows.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
        const defs = svg('defs'); for (const tone of ['normal', 'warning']) { const marker = svg('marker'); marker.id = `${markerId}-${tone}`; for (const [key, value] of Object.entries({ viewBox: '0 0 10 10', refX: '8.5', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' })) marker.setAttribute(key, value); const path = svg('path'); path.setAttribute('d', 'M0 0L10 5L0 10Z'); path.classList.add(tone === 'warning' ? 'lm-arrow-warning' : 'lm-arrow-normal'); marker.append(path); defs.append(marker); } arrows.append(defs);
        const mobile = matchMedia('(max-width: 859px)').matches;
        for (const flow of model.flows) {
            const source = buttons.get(flow.source); const target = buttons.get(flow.target); if (!source || !target) continue; const a = source.getBoundingClientRect(); const b = target.getBoundingClientRect(); const ax = a.left - bounds.left + a.width / 2; const ay = a.top - bounds.top + a.height / 2; const bx = b.left - bounds.left + b.width / 2; const by = b.top - bounds.top + b.height / 2;
            const path = svg('path'); path.classList.add(flow.tone === 'warning' ? 'lm-threat' : 'lm-flow'); path.setAttribute('marker-end', `url(#${markerId}-${flow.tone ?? 'normal'})`); const text = svg('text'); text.textContent = flow.label; text.classList.add('lm-flow-label'); if (flow.tone === 'warning') text.classList.add('lm-threat-label'); text.setAttribute('text-anchor', 'middle'); text.setAttribute('dominant-baseline', 'middle');
            if (mobile && (by <= ay || flow.auxiliary)) { const x = bounds.width - (flow.auxiliary ? 4 : 18); path.setAttribute('d', `M${a.right - bounds.left + 2} ${ay}H${x}V${by}H${b.right - bounds.left + 7}`); text.setAttribute('x', String(x + 4)); text.setAttribute('y', String((ay + by) / 2)); text.setAttribute('transform', `rotate(-90 ${x + 4} ${(ay + by) / 2})`); }
            else if (mobile) { path.setAttribute('d', `M${ax} ${a.bottom - bounds.top + 4}V${b.top - bounds.top - 7}`); text.setAttribute('x', String(ax + 10)); text.setAttribute('y', String((a.bottom + b.top) / 2 - bounds.top)); text.setAttribute('text-anchor', 'start'); }
            else if (flow.auxiliary) { const downward = by > ay; const x1 = a.left - bounds.left + a.width * .86, y1 = (downward ? a.bottom : a.top) - bounds.top + (downward ? 6 : -6), x2 = b.left - bounds.left + b.width * .86, y2 = (downward ? b.top : b.bottom) - bounds.top + (downward ? -9 : 9); const bend = downward ? 60 : -60; path.setAttribute('d', `M${x1} ${y1}C${x1 + 34} ${y1 + bend} ${x2 + 34} ${y2 - bend} ${x2} ${y2}`); text.setAttribute('x', String(x2 - 8)); text.setAttribute('y', String(y2 + (downward ? -16 : 16))); text.setAttribute('text-anchor', 'end'); }
            else { const dx = bx - ax, dy = by - ay; const sa = Math.min(dx ? a.width / 2 / Math.abs(dx) : Infinity, dy ? a.height / 2 / Math.abs(dy) : Infinity); const sb = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity); const length = Math.hypot(dx, dy) || 1; const x1 = ax + dx * sa + dx / length * 5, y1 = ay + dy * sa + dy / length * 5, x2 = bx - dx * sb - dx / length * 9, y2 = by - dy * sb - dy / length * 9; const mx = (x1 + x2) / 2, my = (y1 + y2) / 2; const nx = mx - bounds.width / 2, ny = my - bounds.height / 2; const normal = Math.hypot(nx, ny) || 1; const bend = flow.auxiliary ? 60 : 24; const cx = mx + nx / normal * bend, cy = my + ny / normal * bend; path.setAttribute('d', `M${x1} ${y1}Q${cx} ${cy} ${x2} ${y2}`); text.setAttribute('x', String((x1 + 2 * cx + x2) / 4 + nx / normal * 13)); text.setAttribute('y', String((y1 + 2 * cy + y2) / 4 + ny / normal * 13)); }
            const title = svg('title'); title.textContent = `${source.querySelector('h3')?.textContent ?? ''} → ${target.querySelector('h3')?.textContent ?? ''}: ${flow.label}`; path.append(title); arrows.append(path, text);
        }
    };
    const observer = new ResizeObserver(redraw); observer.observe(ring); const frame = requestAnimationFrame(redraw); return () => { observer.disconnect(); cancelAnimationFrame(frame); };
}
