import type { Node, Edge } from '../core/model.js';
import type { LoopStage, LoopFlow } from './loop-map-types.js';

const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const folder = (node: Node): string => parent(node.sources[0]?.path ?? node.name);
const within = (path: string, directory: string): boolean => directory === '.' || path === directory || path.startsWith(directory + '/');
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const auxiliaryDirectory = (path: string): string | undefined => {
    const parts = path.split('/');
    const index = parts.findIndex(part => /^(?:tests?|test-d|specs?|examples?|samples?|docs?|documentation|benchmarks?|bench)$/u.test(part.toLowerCase().replace(/^_+|_+$/gu, '')));
    return index < 0 ? undefined : parts.slice(0, index + 1).join('/');
};
export const productionSource = (path: string): boolean => auxiliaryDirectory(path) === undefined && !/(?:_test\.go|(?:^|[._-])(?:test|spec)\.[cm]?[jt]sx?|(?:^|\/)test_[^/]+\.py|[^/]*Tests?\.(?:java|cs))$/u.test(path);
const descriptionKind = (node: Node): unknown => { const value = node.attributes['sourceDescription']; return value && typeof value === 'object' ? Reflect.get(value, 'kind') : undefined; };
const descriptionText = (node: Node): string => { const value = node.attributes['sourceDescription']; const text: unknown = value && typeof value === 'object' ? Reflect.get(value, 'text') : undefined; return typeof text === 'string' ? text : ''; };
export const structuralCategoryLabel = (node: Node): string => `${node.attributes['scope'] === 'repository' ? '내부 ' : ''}${node.attributes['category'] === 'namespace' ? '네임스페이스' : '패키지'}`;
const sentence = (value: string): string => value.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '';

export function structuralSummary(members: readonly Node[], documents: readonly Node[], path: string): string {
    const rootReadme = path === '.' ? documents.find(n => n.kind === 'document' && /^readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && descriptionText(n)) : undefined;
    if (rootReadme) return sentence(descriptionText(rootReadme));
    const section = documents.filter(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && within(path, parent(n.sources[0]?.path ?? ''))).sort((a, b) => parent(b.sources[0]?.path ?? '').length - parent(a.sources[0]?.path ?? '').length).find(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && n.name.toLowerCase() === (path.split('/').at(-1) ?? '').toLowerCase() && descriptionKind(n) === 'readme' && descriptionText(n));
    if (section) return sentence(descriptionText(section));
    const documented = members.filter(n => folder(n) === path).sort((a, b) => Number(/(?:__init__|doc|lib|mod|index)\./u.test(b.name)) - Number(/(?:__init__|doc|lib|mod|index)\./u.test(a.name)) || a.name.localeCompare(b.name)).find(n => {
        const value = n.attributes['sourceDescription'];
        return descriptionKind(n) === 'module-doc' && value && typeof value === 'object' && !Array.isArray(value) && typeof Reflect.get(value, 'text') === 'string';
    });
    const source = documented?.attributes['sourceDescription'];
    const description: unknown = source && typeof source === 'object' ? Reflect.get(source, 'text') : undefined;
    if (typeof description === 'string') return sentence(description);
    const readme = documents.filter(n => /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && descriptionText(n) !== '');
    const relevant = readme.find(n => n.kind === 'document' && parent(n.sources[0]?.path ?? '') === path);
    if (relevant) return sentence(descriptionText(relevant));
    const names = new Map<string, number>();
    for (const node of members) {
        const values = node.attributes['publicNames'];
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
    const connectivity = (path: string): number => new Set(flows.filter(e => within(e.source.slice(7), path) !== within(e.target.slice(7), path) && productionSource(e.target.slice(7))).flatMap(e => (e.sourceFiles ?? []).filter(productionSource))).size;
    while (roots.size > 9) {
        const candidates = [...directories].map(path => ({ path, descendants: [...roots].filter(p => p !== path && within(p, path)) })).filter(c => c.descendants.length > (roots.has(c.path) ? 0 : 1)).sort((a, b) => (b.path === '.' ? 0 : b.path.split('/').length) - (a.path === '.' ? 0 : a.path.split('/').length) || a.descendants.length - b.descendants.length || a.path.localeCompare(b.path));
        const choice = candidates[0];
        if (!choice) break;
        const needed = roots.size - 9 + (roots.has(choice.path) ? 0 : 1);
        const folded = choice.descendants.sort((a, b) => Number(productionSource(a)) - Number(productionSource(b)) || connectivity(a) - connectivity(b) || a.localeCompare(b)).slice(0, needed);
        for (const path of folded) roots.delete(path);
        roots.add(choice.path);
    }
    const owner = (id: string) => [...roots].filter(p => within(id.slice(7), p)).sort((a, b) => b.length - a.length)[0];
    const degree = (path: string): number => flows.filter(e => owner(e.source) !== owner(e.target) && (owner(e.source) === path || owner(e.target) === path)).reduce((sum, e) => sum + (e.count ?? 0), 0);
    const orderedRoots = [...roots].sort((a, b) => Number(productionSource(b)) - Number(productionSource(a)) || degree(b) - degree(a) || a.localeCompare(b));
    const groupedNodes = [...sourceNodes, ...packages.values()];
    const stages: LoopStage[] = [...directories].sort((a, b) => Number(roots.has(b)) - Number(roots.has(a)) || a.localeCompare(b)).map(path => {
        const descendants = groupedNodes.filter(n => within(paths.get(n.id) ?? folder(n), path));
        const members = groupedNodes.filter(n => (paths.get(n.id) ?? folder(n)) === path);
        const summaryMembers = (members.length ? members : descendants).flatMap(n => n.kind === 'package' ? strings(n.attributes['memberIds']).flatMap(id => byId.get(id) ?? []) : [n]);
        const packageDirectories = members.filter(n => n.kind === 'package').flatMap(n => strings(n.attributes['directories']));
        const summaryPath = packageDirectories.find(directory => productionSource(directory)) ?? packageDirectories[0] ?? path;
        const summary = structuralSummary(summaryMembers, nodes, summaryPath);
        const summarySources = [...summaryMembers, ...nodes.filter(n => /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? ''))].flatMap(n => {
            const source = n.sources[0]; if (!source) return [];
            const namedField = [['publicNames', '공개 이름: '], ['entryPoints', '실행 진입점: '], ['verificationNames', '검증 항목: ']].find(([, label]) => label !== undefined && summary.startsWith(label));
            if (namedField?.[0] && namedField[1]) {
                const names = summary.slice(namedField[1].length).split(' · '), values = n.attributes[namedField[0]];
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
    return { stages, flows, rootStageIds: orderedRoots.map(p => `folder:${p}`), defaultStage: `folder:${orderedRoots[0] ?? '.'}` };
}
