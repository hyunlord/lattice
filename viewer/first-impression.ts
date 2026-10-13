import type { FirstImpression, FirstImpressionComponent } from '../dist/query/first-impression-types.js';
import type { Source } from '../dist/core/model.js';
import type { Overview } from './overview-data.js';
import { membershipDisclosure } from './first-impression-members.js';
import { element as el, anchor } from './explore-controls.js';
export type FirstImpressionContext = { readonly overview: Overview; readonly sources: (items: readonly Source[]) => HTMLElement; readonly params: URLSearchParams; };
export function renderFirstImpression(host: HTMLElement, model: FirstImpression, context: FirstImpressionContext): void {
    const english = context.params.get('lang') === 'en';
    document.documentElement?.setAttribute('lang', english ? 'en' : 'ko');
    const t = (ko: string, en: string) => english ? en : ko;
    const href = (path: string, values: Record<string, string> = {}) => '#' + path + '?' + new URLSearchParams({ ...(english ? { lang: 'en' } : {}), ...values });
    const evidence = (items: readonly Source[]) => { const box = el('details', '', 'fi-evidence'); box.append(el('summary', t('근거', 'Evidence')), context.sources(items)); return box; };
    const section = (title: string, className: string) => { const box = el('section', '', className); box.append(el('h2', title)); return box; };
    const root = el('div', '', 'first-impression');
    const entryName = (entry: FirstImpression['entrypoints'][number]) => model.entrypoints.filter(other => other.name === entry.name).length > 1 ? `${entry.name} · ${entry.source.path.split('/').at(-1)}` : entry.name;
    const counts = (edge: FirstImpression['dependencies'][number]) => [edge.importingFileCount ? t(`${edge.importingFileCount}개 파일`, `${edge.importingFileCount} files`) : '', edge.declarationCount ? t(`${edge.declarationCount}개 선언`, `${edge.declarationCount} declarations`) : ''].filter(Boolean).join(' · ');
    const head = el('header', '', 'fi-head');
    head.append(el('p', t('저장소 한눈에', 'Repository at a glance'), 'fi-eyebrow'), el('h1', context.overview.repository.name), el('p', model.purpose.basis === 'inventory' ? t(`${model.fileCount}개 소스 파일로 구성된 저장소`, `Repository containing ${model.fileCount} source files`) : model.purpose.text, 'fi-purpose'));
    const tools = el('div', '', 'fi-tools');
    tools.append(anchor(t('전체 구조 지도', 'Detailed structure'), href('/home', { view: 'map' })), anchor(t('시작점과 호출 탐색', 'Explore starts & calls'), href('/logic')), anchor(english ? '한국어' : 'English', '#/home' + (english ? '' : '?lang=en')));
    const quickStarts = el('p', '', 'fi-quick-starts');
    const executable = model.entrypoints.filter(entry => entry.category === 'executable');
    const featuredStarts = executable.length ? executable : model.entrypoints;
    if (model.entrypoints.length) { quickStarts.append(el('span', t('시작: ', 'Start: '))); for (const entry of featuredStarts.slice(0, 3)) quickStarts.append(anchor(entryName(entry), href('/function/' + encodeURIComponent(entry.id)))); }
    const quickFlow = el('p', '', 'fi-quick-flow');
    const flow = model.flows[0], edge = flow?.edges[0];
    if (flow && edge) { const names = new Map(flow.nodes.map(node => [node.id, node.name])); quickFlow.append(el('span', t('정적 호출: ', 'Static call: ')), anchor(`${names.get(edge.source) ?? edge.source} → ${names.get(edge.target) ?? edge.target}`, href('/flow/' + encodeURIComponent(flow.rootId)))); }
    head.append(quickStarts, quickFlow, tools); root.append(head);
    const stack = el('div', '', 'fi-stack'); stack.setAttribute('aria-label', t('기술 구성', 'Technology stack'));
    for (const fact of [...new Map(model.stack.map(fact => [fact.name, fact])).values()]) { const item = el('details', '', 'fi-stack-fact'); item.append(el('summary', fact.name), context.sources(fact.sources)); stack.append(item); }
    if (model.stack.length) root.append(stack);
    const layout = el('div', '', 'fi-layout');
    const parts = section(t('구성과 연결', 'Components & connections'), 'fi-parts');
    parts.append(el('p', t(`${model.fileCount}개 제품 파일 · 주요 구성 ${model.components.length}개`, `${model.fileCount} product files · ${model.components.length} featured components`), 'muted'));
    const cards = el('div', '', 'fi-components');
    const card = (component: FirstImpressionComponent, index: number) => {
        const box = el('details', '', 'fi-component'); box.id = 'part-' + index;
        const title = el('h3'); title.append(el('span', String(index + 1).padStart(2, '0'), 'fi-number'), el('span', component.title));
        const summary = el('summary', '', 'fi-component-summary'); summary.append(title);
        const description = component.basis === 'inventory' ? t(`${component.fileCount}개 파일: `, `${component.fileCount} files: `) + component.memberPreview.map(member => member.path).join(' · ') : (component.basis === 'source-description' ? '' : t('포함: ', 'Contains: ')) + component.description;
        summary.append(el('p', description, 'fi-component-preview')); box.append(summary, el('p', description), el('p', t(`${component.fileCount}개 파일`, `${component.fileCount} files`), 'fi-count'));
        for (const claim of component.claims ?? []) {
            const sentence = el('p', '', 'fi-ai-claim'); sentence.append(el('strong', 'AI · '), el('span', claim.text)); box.append(sentence);
            const repo = context.overview.repository;
            const citations = claim.citations.map(citation => ({ path: citation.path, line: citation.startLine, endLine: citation.endLine, pointer: '', contentHash: citation.contentHash, ...(repo.remoteUrl && repo.commit ? { url: repo.remoteUrl.replace(/\.git$/u, '') + '/blob/' + encodeURIComponent(repo.commit) + '/' + citation.path.split('/').map(encodeURIComponent).join('/') + '#L' + citation.startLine + '-L' + citation.endLine } : {}) }));
            box.append(evidence(citations));
        }
        const details = el('div', '', 'fi-evidence'); details.append(el('h4', t('파일과 근거', 'Files & evidence')));
        details.append(el('p', component.basis === 'public-names' ? t('대표 공개 이름에서 확인한 내용', 'Contents identified by representative public names') : component.basis === 'inventory' ? t('파일 목록에 근거한 구성', 'Source-file inventory') : t('소스 문서에 근거한 설명', 'Source documentation')));
        for (const member of component.memberPreview) details.append(anchor(member.path, href('/node/' + encodeURIComponent(member.id))));
        details.append(context.sources(component.sources), membershipDisclosure(component, model.graphHash, english));
        box.append(details); return box;
    };
    model.components.forEach((component, index) => cards.append(card(component, index)));
    const strongest = [...model.dependencies].sort((a, b) => b.importingFileCount + b.declarationCount - a.importingFileCount - a.declarationCount);
    const numbers = new Map(model.components.map((component, index) => [component.id, String(index + 1).padStart(2, '0')]));
    const preview = el('div', '', 'fi-dependency-preview');
    for (const edge of strongest.slice(0, 3)) { const item = el('p'); item.append(el('strong', `${numbers.get(edge.source)} → ${numbers.get(edge.target)}`), el('span', ' · ' + counts(edge))); preview.append(item); }
    if (strongest.length) { preview.prepend(el('h3', t('주요 의존 방향 · 구성 번호 참조', 'Strongest dependencies · numbered components'))); preview.classList.add('fi-preview'); }
    parts.append(cards, preview);
    if (model.remainder) parts.append(anchor(t(`나머지 ${model.remainder.componentCount}개 구성 · ${model.remainder.fileCount}개 파일 보기`, `Explore ${model.remainder.componentCount} more components · ${model.remainder.fileCount} files`), href('/home', { view: 'map' })));
    const names = new Map(model.components.map((component, index) => [component.id, `${String(index + 1).padStart(2, '0')} ${component.title}`]));
    const connections = el('div', '', 'fi-connections');
    connections.append(el('h3', t('주요 의존 방향', 'Strongest dependency directions')));
    for (const edge of strongest.slice(0, 8)) {
        const row = el('div', '', 'fi-connection');
        row.append(el('span', `${names.get(edge.source) ?? edge.source} → ${names.get(edge.target) ?? edge.target}`), el('strong', counts(edge)), evidence(edge.sources)); connections.append(row);
    }
    if (!model.dependencies.length) connections.append(el('p', t('이 구성들 사이에서 확인된 의존 연결이 없습니다.', 'No source-proven dependency connections between these components.'), 'muted'));
    parts.append(connections); layout.append(parts);
    const reading = el('div', '', 'fi-reading');
    const starts = section(t('어디서 시작하나요?', 'Where does it start?'), 'fi-starts');
    for (const entry of model.entrypoints.slice(0, 5)) { const row = el('div', '', 'fi-entry'); row.append(el('span', entry.category === 'executable' ? t('실행 시작', 'Executable start') : t('공개 API', 'Public API'), 'fi-label'), anchor(entryName(entry), href('/function/' + encodeURIComponent(entry.id))), evidence([entry.source])); starts.append(row); }
    if (!model.entrypoints.length) starts.append(el('p', t('정적 분석으로 확인된 시작점이 없습니다. 파일 지도에서 탐색할 수 있습니다.', 'No statically identified starts. Explore the file map for source locations.')));
    reading.append(starts);
    const flows = section(t('대표 호출 흐름', 'Representative call flows'), 'fi-flows');
    flows.append(el('p', t('소스에서 확인된 호출 연결이며 실행 순서를 뜻하지 않습니다.', 'Source-proven call connections, not a runtime execution sequence.'), 'muted'));
    for (const flow of model.flows) {
        const chain = el('ul', '', 'fi-flow');
        const nodes = new Map(flow.nodes.map(node => [node.id, node]));
        for (const edge of flow.edges.slice(0, 3)) { const item = el('li'); item.append(anchor(nodes.get(edge.source)?.name ?? edge.source, href('/function/' + encodeURIComponent(edge.source))), el('span', ' → '), anchor(nodes.get(edge.target)?.name ?? edge.target, href('/function/' + encodeURIComponent(edge.target)))); chain.append(item); }
        flows.append(chain, anchor(t('호출 근거 따라가기', 'Follow call evidence'), href('/flow/' + encodeURIComponent(flow.rootId))));
    }
    if (!model.flows.length) flows.append(el('p', t('연결된 정적 호출 흐름을 확인하지 못했습니다.', 'No connected static call flow was identified.')));
    reading.append(flows); layout.append(reading); root.append(layout);
    const provenance = el('details', '', 'fi-provenance'); provenance.append(el('summary', t('분석 근거와 범위', 'Evidence & analysis scope')), evidence(model.purpose.sources));
    provenance.append(el('p', t(`보조 파일 ${model.auxiliaryFileCount}개는 제품 구성에서 분리했습니다.`, `${model.auxiliaryFileCount} auxiliary files are separate from product components.`)), el('p', `Snapshot ${model.graphHash}`, 'mono'));
    if (model.unprojectedDependencyCount) provenance.append(el('p', t(`${model.unprojectedDependencyCount}개 패키지 의존은 여러 구성에 걸쳐 있어 임의로 연결하지 않았습니다.`, `${model.unprojectedDependencyCount} package dependencies span multiple components and are not assigned to an arbitrary component.`)));
    for (const limitation of context.overview.limitations) provenance.append(el('p', `${limitation.language}: ${limitation.fileCount} · ` + t('파일 위치만 지원', 'file locations only')));
    const lenses = el('div', '', 'fi-tools'); for (const layer of context.overview.layers) lenses.append(anchor(layer.label, href('/home', { layer: layer.id, view: 'map' })));
    provenance.append(lenses); root.append(provenance); host.append(root);
}
