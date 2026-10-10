import type { Node, Edge } from '../core/model.js';
import type { LoopStage, LoopFlow } from './loop-map-types.js';

const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const folder = (node: Node): string => parent(node.sources[0]?.path ?? node.name);
const within = (path: string, directory: string): boolean => directory === '.' || path === directory || path.startsWith(directory + '/');
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
const descriptionKind = (node: Node): unknown => { const value = node.attributes['sourceDescription']; return value && typeof value === 'object' ? Reflect.get(value, 'kind') : undefined; };
const descriptionText = (node: Node): string => { const value = node.attributes['sourceDescription']; const text: unknown = value && typeof value === 'object' ? Reflect.get(value, 'text') : undefined; return typeof text === 'string' ? text : ''; };
const sentence = (value: string): string => value.replace(/\s+/gu, ' ').trim().split(/(?<=[.!?。])\s/u)[0] ?? '';

export function structuralSummary(members: readonly Node[], documents: readonly Node[], path: string): string {
    const rootReadme = path === '.' ? documents.find(n => n.kind === 'document' && /^readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && descriptionText(n)) : undefined;
    if (rootReadme) return sentence(descriptionText(rootReadme));
    const section = documents.filter(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && within(path, parent(n.sources[0]?.path ?? ''))).sort((a, b) => parent(b.sources[0]?.path ?? '').length - parent(a.sources[0]?.path ?? '').length).find(n => n.kind === 'heading' && /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? '') && n.name.toLowerCase() === (path.split('/').at(-1) ?? '').toLowerCase() && descriptionKind(n) === 'readme' && descriptionText(n));
    if (section) return sentence(descriptionText(section));
    const documented = [...members].sort((a, b) => Number(/(?:__init__|doc|lib|mod|index)\./u.test(b.name)) - Number(/(?:__init__|doc|lib|mod|index)\./u.test(a.name)) || a.name.localeCompare(b.name)).find(n => {
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
    return top.length ? `공개 이름: ${top.join(' · ')}` : '';
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
    const roots = new Set(leaves);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const grouped = new Map<string, { source: string; target: string; files: Set<string>; }>();
    for (const edge of edges) {
        if (edge.kind !== 'imports') continue;
        const source = paths.get(edge.source), target = paths.get(edge.target), file = byId.get(edge.source)?.sources[0]?.path;
        if (!source || !target || source === target || !file) continue;
        const key = JSON.stringify([source, target]);
        const value = grouped.get(key) ?? { source, target, files: new Set<string>() };
        value.files.add(file); grouped.set(key, value);
    }
    const flows: LoopFlow[] = [...grouped.values()].map(e => ({ source: `folder:${e.source}`, target: `folder:${e.target}`, count: e.files.size, sourceFiles: [...e.files].sort(), label: `${e.files.size}개 파일 사용` }));
    const connectivity = (path: string): number => flows.filter(e => e.source === `folder:${path}` || e.target === `folder:${path}`).reduce((sum, e) => sum + (e.count ?? 0), 0);
    while (roots.size > 9) {
        const candidates = [...directories].map(path => ({ path, descendants: [...roots].filter(p => p !== path && within(p, path)) })).filter(c => c.descendants.length > (roots.has(c.path) ? 0 : 1)).sort((a, b) => (b.path === '.' ? 0 : b.path.split('/').length) - (a.path === '.' ? 0 : a.path.split('/').length) || a.descendants.length - b.descendants.length || a.path.localeCompare(b.path));
        const choice = candidates[0];
        if (!choice) break;
        const needed = roots.size - 9 + (roots.has(choice.path) ? 0 : 1);
        const folded = choice.descendants.sort((a, b) => connectivity(a) - connectivity(b) || a.localeCompare(b)).slice(0, needed);
        for (const path of folded) roots.delete(path);
        roots.add(choice.path);
    }
    const owner = (id: string) => [...roots].filter(p => within(id.slice(7), p)).sort((a, b) => b.length - a.length)[0];
    const degree = (path: string): number => flows.filter(e => owner(e.source) !== owner(e.target) && (owner(e.source) === path || owner(e.target) === path)).reduce((sum, e) => sum + (e.count ?? 0), 0);
    const orderedRoots = [...roots].sort((a, b) => degree(b) - degree(a) || a.localeCompare(b));
    const groupedNodes = [...sourceNodes, ...packages.values()];
    const stages: LoopStage[] = [...directories].sort((a, b) => Number(roots.has(b)) - Number(roots.has(a)) || a.localeCompare(b)).map(path => {
        const descendants = groupedNodes.filter(n => within(paths.get(n.id) ?? folder(n), path));
        const members = groupedNodes.filter(n => (paths.get(n.id) ?? folder(n)) === path);
        const summaryMembers = members.length ? members : descendants;
        const summary = structuralSummary(summaryMembers, nodes, path);
        const summarySources = [...summaryMembers, ...nodes.filter(n => /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(n.sources[0]?.path ?? ''))].flatMap(n => {
            const source = n.sources[0]; if (!source) return [];
            if (summary.startsWith('공개 이름:')) {
                const names = summary.slice('공개 이름: '.length).split(' · '), values = n.attributes['publicNames'];
                return Array.isArray(values) ? values.flatMap(value => value && typeof value === 'object' && !Array.isArray(value) && typeof value['name'] === 'string' && names.includes(value['name']) ? [{ path: source.path, line: typeof value['line'] === 'number' ? value['line'] : source.line }] : []) : [];
            }
            if (!['module-doc', 'readme'].includes(String(descriptionKind(n))) || !descriptionText(n) || sentence(descriptionText(n)) !== summary) return [];
            const value = n.attributes['sourceDescription']; const line: unknown = value && typeof value === 'object' ? Reflect.get(value, 'line') : undefined;
            return [{ path: source.path, line: typeof line === 'number' ? line : source.line }];
        });
        const childIds = [...directories].filter(p => p !== path && parent(p) === path).map(p => `folder:${p}`);
        const description = (flow: LoopFlow) => `${flow.count ?? 0}개 파일이 사용: ${(flow.sourceFiles ?? []).map(p => p.split('/').at(-1)).join(', ')}`;
        const related = (direction: 'incoming' | 'outgoing') => flows.filter(e => (direction === 'incoming' ? e.target : e.source) === `folder:${path}`).map(e => ({ name: (direction === 'incoming' ? e.source : e.target).slice(7), description: description(e) }));
        return { id: `folder:${path}`, title: path === '.' ? '루트' : path, summary, summaryEvidence: summarySources, unit: '모듈', nodeIds: members.map(n => n.id), descendantNodeIds: descendants.map(n => n.id), groups: [{ title: '모듈', items: members.map(n => ({ id: n.id })) }], incoming: related('incoming'), outgoing: related('outgoing'), ...(directories.has(parent(path)) && path !== '.' ? { parentId: `folder:${parent(path)}` } : {}), ...(childIds.length ? { childIds } : {}) };
    });
    return { stages, flows, rootStageIds: orderedRoots.map(p => `folder:${p}`), defaultStage: `folder:${orderedRoots[0] ?? '.'}` };
}
