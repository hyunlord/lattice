import type { Node, Edge } from '../core/model.js';
import { structuralFilePreviews } from './structural-file-previews.js';
import { structuralFrontier } from './structural-frontier.js';
import type { LoopStage, LoopFlow } from './loop-map-types.js';

const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const folder = (node: Node): string => parent(node.sources[0]?.path ?? node.name);
const within = (path: string, directory: string): boolean => directory === '.' || path === directory || path.startsWith(directory + '/');
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const auxiliaryDirectory = (path: string): string | undefined => {
    const parts = path.split('/');
    const index = parts.findIndex(part => part.replace(/([a-z0-9])([A-Z])/gu, '$1-$2').replace(/([A-Z])([A-Z][a-z])/gu, '$1-$2').toLowerCase().split(/[._-]+/u).some(token => /^(?:tests?|specs?|examples?|samples?|docs?|documentation|testdata|fixtures|vitepress|benchmarks?|bench)$/u.test(token)));
    return index < 0 ? undefined : parts.slice(0, index + 1).join('/');
};
export const productionSource = (path: string): boolean => auxiliaryDirectory(path) === undefined && !/(?:_test\.go|(?:^|[._-])(?:test|spec)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]+\.py|[^/]*Tests?\.(?:java|cs))$/u.test(path);
const descriptionKind = (node: Node): unknown => { const value = node.attributes['sourceDescription']; return value && typeof value === 'object' ? Reflect.get(value, 'kind') : undefined; };
const descriptionText = (node: Node): string => { const value = node.attributes['sourceDescription']; const text: unknown = value && typeof value === 'object' ? Reflect.get(value, 'text') : undefined; return typeof text === 'string' ? text : ''; };
export const structuralCategoryLabel = (node: Node): string => `${node.attributes['scope'] === 'repository' ? '저장소 ' : ''}${node.attributes['category'] === 'namespace' ? '네임스페이스' : '패키지'}`;
export const missingStructuralRole = '역할 설명 없음 — 요약 실행 필요';
const sentence = (value: string): string => value.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '';

function folderDocument(members: readonly Node[], documents: readonly Node[], path: string, primaryRoot?: string): Node | undefined {
    const intro = structuralSummary([], documents, '.');
    const direct = members.filter(node => folder(node) === path && productionSource(node.sources[0]?.path ?? node.name));
    const module = direct.filter(node => {
        if (descriptionKind(node) !== 'module-doc' || !descriptionText(node) || sentence(descriptionText(node)) === intro) return false;
        const file = (node.sources[0]?.path ?? node.name).split('/').at(-1) ?? '';
        const dedicated = /^(?:package-info\.java|__init__\.py|doc\.go|(?:lib|mod)\.rs)$/u.test(file);
        const packageComment = file.endsWith('.go') && /^Package\s+\w+\s/u.test(descriptionText(node));
        const entry = /^index\.[cm]?[jt]sx?$/u.test(file) && path !== primaryRoot;
        return dedicated || packageComment || entry;
    }).sort((a, b) => a.name.localeCompare(b.name))[0];
    if (module) return module;
    if (path === '.' || path === primaryRoot) return undefined;
    return documents.find(node => node.kind === 'document' && parent(node.sources[0]?.path ?? '') === path && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(node.sources[0]?.path ?? '') && descriptionKind(node) === 'readme' && descriptionText(node) && sentence(descriptionText(node)) !== intro);
}

export function structuralSummary(members: readonly Node[], documents: readonly Node[], path: string): string {
    if (path === '.' && !members.length) {
        const intro = [/^readme(?:\.[^/]*)?$/iu, /^\.github\/readme(?:\.[^/]*)?$/iu].map(pattern => documents.find(node => node.kind === 'document' && pattern.test(node.sources[0]?.path ?? '') && descriptionKind(node) === 'readme' && sentence(descriptionText(node)))).find(node => node !== undefined);
        return intro ? sentence(descriptionText(intro)) : '';
    }
    const doc = folderDocument(members, documents, path);
    return doc ? sentence(descriptionText(doc)) : missingStructuralRole;
}

const commonDirectory = (paths: readonly string[]): string => {
    const first = paths[0]; if (!first || first === '.') return '.';
    const parts = first.split('/');
    while (parts.length && !paths.every(path => path === parts.join('/') || path.startsWith(parts.join('/') + '/'))) parts.pop();
    return parts.join('/') || '.';
};

function sourceRoot(nodes: readonly Node[]): string {
    const production = nodes.filter(node => productionSource(node.sources[0]?.path ?? node.name));
    const paths = (production.length ? production : nodes).map(folder);
    const common = commonDirectory(paths);
    const candidates = new Map<string, number>();
    for (const path of paths) {
        const parts = path.split('/');
        const index = parts.findIndex(part => /^(?:src|source|sources)$/iu.test(part));
        if (index < 0) continue;
        let root = parts.slice(0, index + 1).join('/');
        if (parts[index + 1] === 'main' && /^(?:java|kotlin|scala)$/u.test(parts[index + 2] ?? '')) root = parts.slice(0, index + 3).join('/');
        candidates.set(root, (candidates.get(root) ?? 0) + 1);
    }
    const selected = [...candidates].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    let root = selected && selected[1] >= paths.length * 0.6 ? commonDirectory(paths.filter(path => within(path, selected[0]))) : common;
    while (!paths.includes(root)) {
        const beneath = paths.filter(path => within(path, root));
        const children = new Map<string, number>();
        for (const path of beneath) {
            const prefix = root === '.' ? '' : root + '/';
            const child = prefix + path.slice(prefix.length).split('/')[0];
            children.set(child, (children.get(child) ?? 0) + 1);
        }
        const dominant = [...children].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        if (!dominant || dominant[0] === root || dominant[1] < paths.length * 0.8) break;
        root = dominant[0];
    }
    return root;
}

const relativeTitle = (path: string, root: string): string => path === root ? '루트' : root === '.' ? path : path.startsWith(root + '/') ? path.slice(root.length + 1) : `저장소: ${path}`;

function verifiedCycles(nodes: readonly Node[], edges: readonly Edge[]): string[][] {
    const files = nodes.filter(n => n.kind === 'module' || n.kind === 'file');
    const forward = new Map<string, string[]>(files.map(n => [n.id, []])), reverse = new Map<string, string[]>(files.map(n => [n.id, []]));
    for (const edge of edges) if (edge.kind === 'imports' && edge.attributes?.['importScope'] !== 'project' && forward.has(edge.source) && forward.has(edge.target)) {
        forward.get(edge.source)?.push(edge.target); reverse.get(edge.target)?.push(edge.source);
    }
    const visited = new Set<string>(), order: string[] = [];
    for (const id of forward.keys()) {
        const pending = [{ id, finish: false }];
        while (pending.length) {
            const next = pending.pop(); if (!next) break;
            if (next.finish) { order.push(next.id); continue; }
            if (visited.has(next.id)) continue;
            visited.add(next.id); pending.push({ id: next.id, finish: true });
            for (const target of forward.get(next.id) ?? []) if (!visited.has(target)) pending.push({ id: target, finish: false });
        }
    }
    const byId = new Map(files.map(n => [n.id, n])), groups: string[][] = []; visited.clear();
    for (const id of order.reverse()) {
        if (visited.has(id)) continue;
        const pending = [id], component: string[] = [];
        while (pending.length) {
            const next = pending.pop(); if (!next || visited.has(next)) continue;
            visited.add(next); component.push(next);
            for (const target of reverse.get(next) ?? []) if (!visited.has(target)) pending.push(target);
        }
        if (component.length > 1 || forward.get(id)?.includes(id)) groups.push([...new Set(component.flatMap(key => { const n = byId.get(key); return n ? [`folder:${folder(n)}`] : []; }))].sort());
    }
    return groups.sort((a, b) => a.join('\0').localeCompare(b.join('\0')));
}

export function buildStructuralMap(nodes: readonly Node[], edges: readonly Edge[]) {
    const modules = nodes.filter(node => node.kind === 'module');
    const sourceNodes = modules.length ? modules : nodes.filter(node => node.kind === 'file');
    const byId = new Map(nodes.map(node => [node.id, node]));
    const paths = new Map(sourceNodes.map(node => [node.id, folder(node)]));
    const packages = new Map<string, string>();
    for (const node of nodes.filter(node => node.kind === 'package')) {
        const directories = strings(node.attributes['directories']);
        const memberPaths = strings(node.attributes['memberIds']).flatMap(id => paths.get(id) ?? []);
        const destination = commonDirectory(memberPaths.length ? memberPaths : directories.length ? directories : [folder(node)]);
        packages.set(node.id, destination);
    }
    const directories = new Set([...paths.values(), ...packages.values(), '.']);
    for (const path of [...directories]) { let p = path; while (p !== '.') { p = parent(p); directories.add(p); } }
    const source = sourceRoot(sourceNodes);
    const grouped = new Map<string, { source: string; target: string; files: Set<string>; projectFiles: Set<string>; }>();
    for (const edge of edges) {
        if (edge.kind !== 'imports') continue;
        const from = paths.get(edge.source), file = byId.get(edge.source)?.sources[0]?.path;
        const to = paths.get(edge.target) ?? packages.get(edge.target);
        if (!from || !to || !file) continue;
        const packageTarget = packages.has(edge.target) && !sourceNodes.some(node => paths.get(node.id) === to) && [...directories].some(path => parent(path) === to && path !== to);
        const target = `${packageTarget ? 'directory' : 'folder'}:${to}`, origin = `folder:${from}`;
        if (origin === target) continue;
        const key = JSON.stringify([origin, target]);
        const value = grouped.get(key) ?? { source: origin, target, files: new Set<string>(), projectFiles: new Set<string>() };
        value.files.add(file); if (edge.attributes?.['importScope'] === 'project') value.projectFiles.add(file); grouped.set(key, value);
    }
    const flows: LoopFlow[] = [...grouped.values()].map(value => ({ source: value.source, target: value.target, count: value.files.size, sourceFiles: [...value.files].sort(), ...(value.projectFiles.size ? { projectSourceFiles: [...value.projectFiles].sort() } : {}), label: [value.files.size > value.projectFiles.size ? `${value.files.size - value.projectFiles.size}개 파일 사용` : '', value.projectFiles.size ? `프로젝트 선언 ${value.projectFiles.size}개` : ''].filter(Boolean).join(' · ') }));
    const stages: LoopStage[] = [...directories].sort().map(path => {
        const members = sourceNodes.filter(node => paths.get(node.id) === path), doc = folderDocument(members, nodes, path, source);
        const text = doc ? sentence(descriptionText(doc)) : missingStructuralRole;
        const value = doc?.attributes['sourceDescription'];
        const line: unknown = value && typeof value === 'object' ? Reflect.get(value, 'line') : undefined;
        return { id: `folder:${path}`, directoryPath: path, title: relativeTitle(path, source), summary: text, summaryEvidence: doc?.sources[0] ? [{ path: doc.sources[0].path, line: typeof line === 'number' ? line : doc.sources[0].line }] : [], unit: '파일', nodeIds: members.map(node => node.id), groups: [{ title: '파일', items: members.map(node => ({ id: node.id })) }], incoming: [], outgoing: [] };
    });
    const frontier = structuralFrontier(stages, flows, productionSource);
    const entryPaths = new Set(sourceNodes.filter(node => {
        const entries = node.attributes['entryPoints'];
        return productionSource(node.sources[0]?.path ?? node.name) && (Array.isArray(entries) && entries.length > 0 || folder(node) === source && /(?:^|\/)(?:index\.[cm]?[jt]sx?|__init__\.py|lib\.rs|mod\.rs|main\.[^.]+|package-info\.java)$/u.test(node.sources[0]?.path ?? node.name));
    }).map(folder));
    if (!entryPaths.size && sourceNodes.some(node => folder(node) === source)) entryPaths.add(source);
    const entries = [...entryPaths].sort().map(path => `folder:${path}`);
    const previewStages = frontier.rootStageIds.length <= 2 ? frontier.stages.map(stage => stage.nodeIds.length ? { ...stage, filePreviews: structuralFilePreviews(sourceNodes.filter(node => stage.nodeIds.includes(node.id)), edges) } : stage) : frontier.stages;
    return { ...frontier, stages: previewStages, flows, structuralSourceRoot: source, structuralEntryStageIds: entries, verifiedCycleStageGroups: verifiedCycles(nodes, edges) };
}


export function buildStructuralOverview(nodes: readonly Node[], edges: readonly Edge[]) {
    const modules = nodes.filter(n => n.kind === 'module'), sources = modules.length ? modules : nodes.filter(n => n.kind === 'file');
    const productionCount = sources.filter(n => productionSource(n.sources[0]?.path ?? n.name)).length, auxiliaryCount = sources.length - productionCount;
    const all = buildStructuralMap(nodes, edges);
    const primaryRoot = all.structuralSourceRoot;
    const outsideCount = sources.filter(node => productionSource(node.sources[0]?.path ?? node.name) && !within(folder(node), primaryRoot)).length;
    const excludedDescription = [`소스 루트 밖 제품 파일 ${outsideCount}개`, `테스트·예제·문서·벤치마크 파일 ${auxiliaryCount}개`].join(' · ');
    if (!productionCount || (!auxiliaryCount && !outsideCount)) return { ...all, structuralScope: { default: productionCount ? 'production' as const : 'all' as const, productionCount, auxiliaryCount, allRootStageIds: all.rootStageIds, allDefaultStage: all.defaultStage, allSourceRoot: all.structuralSourceRoot, allEntryStageIds: all.structuralEntryStageIds, excludedDescription, outsideRootCount: outsideCount, selectedCount: productionCount - outsideCount } };
    const allowed = new Set(nodes.filter(n => n.kind !== 'package' && productionSource(n.sources[0]?.path ?? n.name) && (n.kind === 'document' || within(folder(n), primaryRoot))).map(n => n.id));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const scopedNodes = nodes.flatMap(n => {
        if (n.kind !== 'package') return allowed.has(n.id) ? [n] : [];
        const recorded = strings(n.attributes['memberIds']), memberIds = recorded.filter(id => allowed.has(id));
        if (!recorded.length) return productionSource(n.sources[0]?.path ?? n.name) ? [n] : [];
        if (!memberIds.length) return [];
        const directories = [...new Set(memberIds.flatMap(id => { const member = byId.get(id); return member ? [folder(member)] : []; }))];
        return [{ ...n, attributes: { ...n.attributes, memberIds, directories } }];
    });
    const ids = new Set(scopedNodes.map(n => n.id)), scopedEdges = edges.filter(e => ids.has(e.source) && ids.has(e.target));
    const primary = buildStructuralMap(scopedNodes, scopedEdges), prefix = (id: string) => `all:${id}`;
    return {
        ...primary,
        stages: [...primary.stages, ...all.stages.map(stage => ({ ...stage, id: prefix(stage.id), ...(stage.parentId ? { parentId: prefix(stage.parentId) } : {}), ...(stage.childIds ? { childIds: stage.childIds.map(prefix) } : {}) }))],
        flows: [...primary.flows, ...all.flows.map(flow => ({ ...flow, source: prefix(flow.source), target: prefix(flow.target) }))],
        verifiedCycleStageGroups: [...primary.verifiedCycleStageGroups, ...all.verifiedCycleStageGroups.map(group => group.map(prefix))],
        structuralScope: { default: 'production' as const, productionCount, auxiliaryCount, allRootStageIds: all.rootStageIds.map(prefix), allDefaultStage: prefix(all.defaultStage), allSourceRoot: all.structuralSourceRoot, allEntryStageIds: all.structuralEntryStageIds.map(prefix), excludedDescription, outsideRootCount: outsideCount, selectedCount: productionCount - outsideCount },
    };
}
