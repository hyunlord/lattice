import { logicCalls, logicEntrypoints, logicFlow, type LogicGraph, type LogicCallOptions, type LogicFlowOptions, type LogicPageOptions } from './logic-model.js';
import { element } from './explore-controls.js';

type Awaitable<T> = T | Promise<T>;
export type LogicProvider = {
    readonly entrypoints: (options: LogicPageOptions) => Awaitable<ReturnType<typeof logicEntrypoints>>;
    readonly calls: (options: LogicCallOptions) => Awaitable<ReturnType<typeof logicCalls>>;
    readonly flow: (options: LogicFlowOptions) => Awaitable<ReturnType<typeof logicFlow>>;
    readonly name: (id: string) => string;
};
export type LogicContext = { readonly nodeHref: (id: string) => string; readonly flowHref: (id: string, depth: number) => string; };
export function graphLogicProvider(graph: LogicGraph): LogicProvider {
    const byId = new Map(graph.nodes.map(node => [node.id, node.name]));
    return { entrypoints: options => logicEntrypoints(graph, options), calls: options => logicCalls(graph, options), flow: options => logicFlow(graph, options), name: id => byId.get(id) ?? id };
}
const sourceText = (source: { readonly path: string; readonly line: number; }): string => `${source.path}:${source.line}`;
function link(text: string, href: string): HTMLAnchorElement { const anchor = element('a', text); anchor.href = href; return anchor; }
function failure(host: HTMLElement, error: unknown, retry: () => void): void {
    host.replaceChildren(element('p', error instanceof Error ? error.message : '로직 정보를 불러오지 못했습니다.'));
    const button = element('button', '다시 시도'); button.type = 'button'; button.onclick = retry; host.append(button);
}

export function renderLogicEntrypoints(host: HTMLElement, provider: LogicProvider, context: LogicContext): void {
    const title = element('h2', '실행 진입점과 공개 API'); const result = element('div');
    host.append(title, element('p', '소스에서 확인한 시작 함수와 공개 API입니다. 실행 기록은 아닙니다.', 'muted'), result);
    let offset = 0;
    const render = async (): Promise<void> => {
        result.replaceChildren(element('p', '진입점을 불러오는 중…')); result.setAttribute('aria-busy', 'true');
        try {
            const page = await provider.entrypoints({ offset, limit: 20 });
            const list = element('ul', '', 'logic-entry-list');
            for (const item of page.items) {
                const row = element('li'); row.append(link(item.node.name, context.flowHref(item.node.id, 3)));
                const packages = item.packageIds.map(provider.name); if (packages.length) row.append(element('p', packages.join(' / '), 'muted'));
                for (const entry of item.entrypoints) row.append(element('span', `${({ executable: '실행 진입점', 'module-execution': '모듈 실행', 'public-api': '공개 API', 'route-handler': '요청 처리', 'framework-callback': '프레임워크 콜백' }[entry.category] ?? '기타 진입점')} · ${sourceText(entry.source)}`, 'logic-source'));
                list.append(row);
            }
            result.replaceChildren(element('p', `${page.total}개 진입점`), page.items.length ? list : element('p', '확정할 수 있는 진입점이 없습니다. 지원 언어와 분석 한계는 근거 보기에서 확인하세요.'));
            if (page.offset > 0 || page.nextOffset !== null) {
                const nav = element('nav'); nav.setAttribute('aria-label', '진입점 페이지');
                for (const [label, next] of [['이전', Math.max(0, offset - 20)], ['다음', page.nextOffset]] as const) {
                    const button = element('button', label); button.type = 'button'; button.disabled = next === null || next === offset; button.onclick = () => { if (next !== null) { offset = next; void render(); } }; nav.append(button);
                }
                result.append(nav);
            }
        } catch (error) { failure(result, error, () => { void render(); }); }
        finally { result.removeAttribute('aria-busy'); }
    };
    void render();
}

export function renderFunctionLogic(host: HTMLElement, provider: LogicProvider, id: string, context: LogicContext): void {
    const section = element('section', '', 'logic-function'); host.append(section);
    let offset = 0;
    const render = async (): Promise<void> => {
        section.replaceChildren(element('p', '호출 관계를 불러오는 중…'));
        try {
            const result = await provider.calls({ id, limit: 20, offset });
            if (!result.found) { section.replaceChildren(); return; }
            const node = result.node?.node;
            section.replaceChildren(element('h2', node?.name ?? '함수 연결'), link('이 함수에서 흐름 따라가기', context.flowHref(id, 3)));
            if (node?.sources[0]) section.append(element('p', sourceText(node.sources[0]), 'logic-source'));
            if (typeof node?.attributes['description'] === 'string') section.append(element('p', node.attributes['description']));
            const columns = element('div', '', 'logic-call-columns');
            for (const [title, page, endpoint] of [['불리는 곳', result.incoming, 'source'], ['부르는 것', result.outgoing, 'target']] as const) {
                const column = element('section'); column.append(element('h3', `${title} ${page.total}개`)); const list = element('ul');
                for (const edge of page.items) {
                    const row = element('li'); row.append(link(provider.name(edge[endpoint]), context.nodeHref(edge[endpoint])));
                    if (edge.attributes?.['resolution'] === 'estimated') row.append(element('span', ' 추정'));
                    const source = edge.sources[0]; if (source) row.append(element('span', sourceText(source), 'logic-source'));
                    list.append(row);
                }
                column.append(page.total ? list : element('p', '확정된 호출 없음', 'muted')); columns.append(column);
            }
            section.append(columns);
            const hasNext = result.incoming.nextOffset !== null || result.outgoing.nextOffset !== null;
            if (offset || hasNext) {
                for (const [label, next, disabled] of [['이전', Math.max(0, offset - 20), offset === 0], ['다음', offset + 20, !hasNext]] as const) { const button = element('button', label); button.type = 'button'; button.disabled = disabled; button.onclick = () => { offset = next; void render(); }; section.append(button); }
            }
        } catch (error) { failure(section, error, () => { void render(); }); }
    };
    void render();
}

export function renderLogicFlow(host: HTMLElement, provider: LogicProvider, id: string, context: LogicContext, initialDepth = 3): void {
    const controls = element('div', '', 'logic-controls'); const label = element('label', '따라갈 깊이 '); const select = element('select');
    for (let value = 1; value <= 10; value++) { const option = element('option', `${value}단계`); option.value = String(value); option.selected = value === initialDepth; select.append(option); }
    label.append(select); controls.append(label); const result = element('div');
    host.append(element('h1', '로직 흐름'), element('p', '함수가 부르는 함수를 단계별로 보여 줍니다. 실제 실행 순서나 모든 가능한 실행 경로를 뜻하지 않습니다.', 'muted'), controls, result);
    let generation = 0;
    const render = async (): Promise<void> => {
        const current = ++generation; result.replaceChildren(element('p', '흐름을 불러오는 중…'));
        try {
            const flow = await provider.flow({ id, depth: Number(select.value), maxNodes: 60, maxEdges: 100 });
            if (current !== generation) return;
            result.replaceChildren();
            if (!flow.found) { result.append(element('p', '이 함수의 분석 정보가 없습니다.')); return; }
            const names = new Map(flow.nodes.map(item => [item.node.id, item.node.name]));
            const levels = element('div', '', 'logic-flow-levels');
            for (const depth of [...new Set(flow.nodes.map(item => item.depth))]) {
                const level = element('section', '', 'logic-flow-level'); level.append(element('h2', depth ? `${depth}단계` : '시작'));
                for (const item of flow.nodes.filter(node => node.depth === depth)) {
                    const card = element('article', '', 'logic-flow-node'); card.dataset['nodeId'] = item.node.id;
                    card.append(link(item.node.name, context.nodeHref(item.node.id)));
                    if (item.packageIds.length) card.append(element('p', item.packageIds.map(provider.name).join(' / '), 'muted'));
                    const source = item.node.sources[0]; if (source) card.append(element('span', sourceText(source), 'logic-source'));
                    const calls = flow.edges.filter(edge => edge.source === item.node.id); const list = element('ul');
                    for (const edge of calls) { const row = element('li'); row.append(document.createTextNode('→ '), link(names.get(edge.target) ?? provider.name(edge.target), context.flowHref(edge.target, Number(select.value)))); if (edge.attributes?.['resolution'] === 'estimated') row.append(document.createTextNode(' (추정)')); list.append(row); }
                    if (calls.length) card.append(list); level.append(card);
                }
                levels.append(level);
            }
            result.append(levels);
            if (flow.truncated) result.append(element('p', `표시 범위: 깊이 ${flow.depth}, 함수 최대 ${flow.maxNodes}개, 연결 최대 ${flow.maxEdges}개. 이어지는 함수를 눌러 계속 탐색할 수 있습니다.`, 'muted'));
            if (!flow.edges.length) result.append(element('p', '이 범위에서 확정된 호출 연결이 없습니다.'));
        } catch (error) { if (current === generation) failure(result, error, () => { void render(); }); }
    };
    select.onchange = () => { history.replaceState(null, '', context.flowHref(id, Number(select.value))); void render(); };
    void render();
}
