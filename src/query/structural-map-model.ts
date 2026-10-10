import type { Node, Edge } from '../core/model.js';
import { structuralFrontier } from './structural-frontier.js';
import type { LoopStage, LoopFlow } from './loop-map-types.js';

const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const folder = (node: Node): string => parent(node.sources[0]?.path ?? node.name);
const within = (path: string, directory: string): boolean => directory === '.' || path === directory || path.startsWith(directory + '/');
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const auxiliaryDirectory = (path: string): string | undefined => {
    const parts = path.split('/');
    const index = parts.findIndex(part => part.toLowerCase().split(/[._-]+/u).some(token => /^(?:tests?|specs?|examples?|samples?|docs?|documentation|testdata|fixtures|vitepress|benchmarks?|bench)$/u.test(token)));
    return index < 0 ? undefined : parts.slice(0, index + 1).join('/');
};
export const productionSource = (path: string): boolean => auxiliaryDirectory(path) === undefined && !/(?:_test\.go|(?:^|[._-])(?:test|spec)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]+\.py|[^/]*Tests?\.(?:java|cs))$/u.test(path);
const descriptionKind = (node: Node): unknown => { const value = node.attributes['sourceDescription']; return value && typeof value === 'object' ? Reflect.get(value, 'kind') : undefined; };
const descriptionText = (node: Node): string => { const value = node.attributes['sourceDescription']; const text: unknown = value && typeof value === 'object' ? Reflect.get(value, 'text') : undefined; return typeof text === 'string' ? text : ''; };
export const structuralCategoryLabel = (node: Node): string => `${node.attributes['scope'] === 'repository' ? '저장소 ' : ''}${node.attributes['category'] === 'namespace' ? '네임스페이스' : '패키지'}`;
const sentence = (value: string): string => value.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '';

const publicEntries = (node: Node) => {
    const definitions = node.attributes['definitions'], listed = node.attributes['publicNames'];
    const full = Array.isArray(definitions) ? definitions.filter(v => v && typeof v === 'object' && !Array.isArray(v) && v['public'] === true) : [];
    const names = new Set(full.flatMap(v => v && typeof v === 'object' && !Array.isArray(v) && typeof v['name'] === 'string' ? [v['name']] : []));
    const entries = [...full, ...(Array.isArray(listed) ? listed.filter(v => v && typeof v === 'object' && !Array.isArray(v) && !names.has(String(v['name']))) : [])];
    const unique = new Map<string, (typeof entries)[number]>();
    for (const entry of entries) if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry['name'] === 'string') {
        const prior = unique.get(entry['name']);
        if (!prior || typeof prior !== 'object' || Array.isArray(prior) || Number(entry['uses'] ?? 0) > Number(prior['uses'] ?? 0)) unique.set(entry['name'], entry);
    }
    return [...unique.values()];
};

export function structuralSummary(members: readonly Node[], documents: readonly Node[], path: string): string {
    const productionMembers = members.filter(n => productionSource(n.sources[0]?.path ?? n.name));
    if (productionMembers.length) members = productionMembers;
    const rootReadme = path === '.' ? [/^readme(?:\.[^/]*)?$/iu, /^\.github\/readme(?:\.[^/]*)?$/iu].map(pattern => documents.find(n => n.kind === 'document' && pattern.test(n.sources[0]?.path ?? '') && descriptionKind(n) === 'readme' && sentence(descriptionText(n)))).find(n => n !== undefined) : undefined;
    if (rootReadme) return sentence(descriptionText(rootReadme));
    const section = documents.filter(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && within(path, parent(n.sources[0]?.path ?? ''))).sort((a, b) => parent(b.sources[0]?.path ?? '').length - parent(a.sources[0]?.path ?? '').length).find(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && n.name.toLowerCase() === (path.split('/').at(-1) ?? '').toLowerCase() && descriptionKind(n) === 'readme' && descriptionText(n));
    const documented = members.filter(n => folder(n) === path).sort((a, b) => Number(/(?:__init__|doc|lib|mod|index)\./u.test(b.name)) - Number(/(?:__init__|doc|lib|mod|index)\./u.test(a.name)) || a.name.localeCompare(b.name)).find(n => {
        const value = n.attributes['sourceDescription'];
        return descriptionKind(n) === 'module-doc' && value && typeof value === 'object' && !Array.isArray(value) && typeof Reflect.get(value, 'text') === 'string';
    });
    const source = documented?.attributes['sourceDescription'];
    const description: unknown = source && typeof source === 'object' ? Reflect.get(source, 'text') : undefined;
    if (typeof description === 'string') return sentence(description);
    if (section) return sentence(descriptionText(section));
    const readme = documents.filter(n => /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && descriptionText(n) !== '');
    const relevant = readme.find(n => n.kind === 'document' && parent(n.sources[0]?.path ?? '') === path);
    if (relevant) return sentence(descriptionText(relevant));
    const names = new Map<string, number>();
    for (const node of members) {
        const values = publicEntries(node);
        if (!Array.isArray(values)) continue;
        for (const value of values) if (value && typeof value === 'object' && !Array.isArray(value) && typeof value['name'] === 'string') names.set(value['name'], (names.get(value['name']) ?? 0) + (typeof value['uses'] === 'number' ? value['uses'] : 0));
    }
    const top = [...names].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name);
    if (top.length) return `공개 이름: ${top.join(' · ')}`;
    for (const [field, label] of [['entryPoints', '실행 진입점'], ['verificationNames', '검증 항목']] as const) {
        const entries = members.flatMap(n => { const values = n.attributes[field]; return Array.isArray(values) ? values.flatMap(value => value && typeof value === 'object' && !Array.isArray(value) && typeof value['name'] === 'string' ? [value['name']] : []) : []; });
        const selected = [...new Set(entries)].sort().slice(0, 3);
        if (selected.length) return `${label}: ${selected.join(' · ')}`;
    }
    return '';
}

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
    const modules = nodes.filter(n => n.kind === 'module');
    const sourceNodes = modules.length ? modules : nodes.filter(n => n.kind === 'file');
    const paths = new Map(sourceNodes.map(n => [n.id, folder(n)]));
    const leaves = new Set(paths.values());
    const packages = new Map<string, Node>();
    for (const node of nodes.filter(n => n.kind === 'package')) {
        const directories = strings(node.attributes['directories']);
        const destination = directories.length > 1 ? `패키지 ${String(node.attributes['packageName'] ?? node.name)}` : directories[0] ?? folder(node);
        paths.set(node.id, destination);
        leaves.add(destination);
        if (directories.length > 1) packages.set(destination, node);
    }
    const directories = new Set(leaves);
    for (const leaf of leaves) { let p = parent(leaf); while (p !== '.') { directories.add(p); p = parent(p); } }
    if (leaves.size > 9 || leaves.has('.')) directories.add('.');
    const roots = new Set([...leaves].map(path => auxiliaryDirectory(path) ?? path));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const grouped = new Map<string, { source: string; target: string; files: Set<string>; projectFiles: Set<string>; }>();
    for (const edge of edges) {
        if (edge.kind !== 'imports') continue;
        const source = paths.get(edge.source), target = paths.get(edge.target), file = byId.get(edge.source)?.sources[0]?.path;
        if (!source || !target || source === target || !file) continue;
        const key = JSON.stringify([source, target]);
        const value = grouped.get(key) ?? { source, target, files: new Set<string>(), projectFiles: new Set<string>() };
        value.files.add(file); if (edge.attributes?.['importScope'] === 'project') value.projectFiles.add(file); grouped.set(key, value);
    }
    const flows: LoopFlow[] = [...grouped.values()].map(e => ({ source: `folder:${e.source}`, target: `folder:${e.target}`, count: e.files.size, sourceFiles: [...e.files].sort(), ...(e.projectFiles.size ? { projectSourceFiles: [...e.projectFiles].sort() } : {}), label: [e.files.size > e.projectFiles.size ? `${e.files.size - e.projectFiles.size}개 파일 사용` : '', e.projectFiles.size ? `프로젝트 선언 ${e.projectFiles.size}개` : ''].filter(Boolean).join(' · ') }));
    const groupedNodes = [...sourceNodes, ...packages.values()];
    const stages: LoopStage[] = [...directories].sort((a, b) => Number(roots.has(b)) - Number(roots.has(a)) || a.localeCompare(b)).map(path => {
        const descendants = groupedNodes.filter(n => within(paths.get(n.id) ?? folder(n), path));
        const members = groupedNodes.filter(n => (paths.get(n.id) ?? folder(n)) === path);
        const summaryCandidates = (members.length ? members : descendants).flatMap(n => n.kind === 'package' ? strings(n.attributes['memberIds']).flatMap(id => byId.get(id) ?? []) : [n]);
        const productionMembers = summaryCandidates.filter(n => productionSource(n.sources[0]?.path ?? n.name)), summaryMembers = productionMembers.length ? productionMembers : summaryCandidates;
        const packageDirectories = members.filter(n => n.kind === 'package').flatMap(n => strings(n.attributes['directories']));
        const summaryPath = packageDirectories.find(directory => productionSource(directory)) ?? packageDirectories[0] ?? path;
        const summary = structuralSummary(summaryMembers, nodes, summaryPath);
        const summarySources = [...summaryMembers, ...nodes.filter(n => /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? ''))].flatMap(n => {
            const source = n.sources[0]; if (!source) return [];
            const namedField = [['publicNames', '공개 이름: '], ['entryPoints', '실행 진입점: '], ['verificationNames', '검증 항목: ']].find(([, label]) => label !== undefined && summary.startsWith(label));
            if (namedField?.[0] && namedField[1]) {
                const names = summary.slice(namedField[1].length).split(' · '), values = namedField[0] === 'publicNames' ? publicEntries(n) : n.attributes[namedField[0]];
                return Array.isArray(values) ? values.flatMap(value => value && typeof value === 'object' && !Array.isArray(value) && typeof value['name'] === 'string' && names.includes(value['name']) ? [{ path: source.path, line: typeof value['line'] === 'number' ? value['line'] : source.line }] : []) : [];
            }
            if (!['module-doc', 'readme'].includes(String(descriptionKind(n))) || !descriptionText(n) || sentence(descriptionText(n)) !== summary) return [];
            const value = n.attributes['sourceDescription']; const line: unknown = value && typeof value === 'object' ? Reflect.get(value, 'line') : undefined;
            return [{ path: source.path, line: typeof line === 'number' ? line : source.line }];
        });
        const packageNode = packages.get(path);
        const childIds = [...directories].filter(p => p !== path && parent(p) === path).map(p => `folder:${p}`);
        const description = (flow: LoopFlow) => `${flow.label}: ${(flow.sourceFiles ?? []).map(p => p.split('/').at(-1)).join(', ')}`;
        const related = (direction: 'incoming' | 'outgoing') => flows.filter(e => (direction === 'incoming' ? e.target : e.source) === `folder:${path}`).map(e => ({ name: (direction === 'incoming' ? e.source : e.target).slice(7), description: description(e) }));
        return { id: `folder:${path}`, title: path === '.' ? '루트' : packageNode ? `${structuralCategoryLabel(packageNode)} ${String(packageNode.attributes['packageName'] ?? packageNode.name)}` : path, summary, summaryEvidence: summarySources, unit: '모듈', nodeIds: members.map(n => n.id), descendantNodeIds: descendants.map(n => n.id), groups: [{ title: '모듈', items: members.map(n => ({ id: n.id })) }], incoming: related('incoming'), outgoing: related('outgoing'), ...(directories.has(parent(path)) && path !== '.' ? { parentId: `folder:${parent(path)}` } : {}), ...(childIds.length ? { childIds } : {}) };
    });
    const frontier = structuralFrontier(stages, flows, productionSource);
    const scopedStages = frontier.stages.map(stage => {
        if (!stage.scopePaths) return stage;
        const included = (stage.descendantNodeIds ?? []).flatMap(id => byId.get(id) ?? []);
        const productionMembers = included.filter(n => productionSource(n.sources[0]?.path ?? n.name)), members = productionMembers.length ? productionMembers : included;
        const summary = structuralSummary(members, [], '\0');
        const names = summary.startsWith('공개 이름: ') ? summary.slice('공개 이름: '.length).split(' · ') : [];
        const summaryEvidence = members.flatMap(n => publicEntries(n).flatMap(v => v && typeof v === 'object' && !Array.isArray(v) && typeof v['name'] === 'string' && names.includes(v['name']) && n.sources[0] ? [{ path: n.sources[0].path, line: typeof v['line'] === 'number' ? v['line'] : n.sources[0].line }] : []));
        return { ...stage, summary: names.length ? summary : '', summaryEvidence };
    });
    return { ...frontier, stages: scopedStages, flows, verifiedCycleStageGroups: verifiedCycles(nodes, edges) };
}


export function buildStructuralOverview(nodes: readonly Node[], edges: readonly Edge[]) {
    const modules = nodes.filter(n => n.kind === 'module'), sources = modules.length ? modules : nodes.filter(n => n.kind === 'file');
    const productionCount = sources.filter(n => productionSource(n.sources[0]?.path ?? n.name)).length, auxiliaryCount = sources.length - productionCount;
    const all = buildStructuralMap(nodes, edges);
    if (!productionCount || !auxiliaryCount) return { ...all, structuralScope: { default: productionCount ? 'production' as const : 'all' as const, productionCount, auxiliaryCount, allRootStageIds: all.rootStageIds, allDefaultStage: all.defaultStage } };
    const allowed = new Set(nodes.filter(n => n.kind !== 'package' && productionSource(n.sources[0]?.path ?? n.name)).map(n => n.id));
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
        structuralScope: { default: 'production' as const, productionCount, auxiliaryCount, allRootStageIds: all.rootStageIds.map(prefix), allDefaultStage: prefix(all.defaultStage) },
    };
}
