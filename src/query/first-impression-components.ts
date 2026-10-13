import type { Edge, Node, Source } from '../core/model.js';
import { manifestPackage, manifestProductSelection } from './structural-manifest-map.js';
import { productLogicPath } from '../core/logic-policy.js';
import type { FirstImpressionDependency } from './first-impression-types.js';

const productFile = (node: Node): boolean => {
    const path = pathOf(node);
    return !/(?:^|\/)(?:docs?|documentation|[^/]+-docs|__mocks__|dist|coverage|node_modules)(?:\/|$)/iu.test(path) && !/(?:^|\/)\.[^/]+(?:\/|$)/u.test(path) && !/(?:^|\/)(?:(?:vite|webpack|rollup|babel|jest|eslint|prettier|tailwind|postcss|tsup|next|nuxt|svelte)\.config\.[cm]?[jt]s)$/u.test(path);
};
const mainFile = (node: Node): boolean => productLogicPath(pathOf(node)) && !/(?:^|\/)(?:build\.gradle(?:\.kts)?|settings\.gradle(?:\.kts)?|gradlew(?:\.bat)?)$/u.test(pathOf(node));
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const strings = (value: unknown): readonly string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export const pathOf = (node: Node): string => node.sources[0]?.path ?? node.name;
export type ComponentGroup = { readonly id: string; readonly members: readonly Node[]; readonly package?: Node; readonly packageNames: readonly string[]; };
export function firstImpressionGroups(nodes: readonly Node[], edges: readonly Edge[]) {
    const selection = manifestProductSelection(nodes);
    const modules = nodes.filter(node => node.kind === 'module');
    const files = (modules.length ? modules : nodes.filter(node => node.kind === 'file')).sort((a, b) => compare(a.id, b.id));
    const selected = files.filter(node => selection.get(node.id) ?? (productLogicPath(pathOf(node)) && productFile(node)));
    const filesById = new Map(selected.map(node => [node.id, node]));
    const packages = nodes.filter(manifestPackage).sort((a, b) => String(b.attributes['root'] ?? '').length - String(a.attributes['root'] ?? '').length || compare(a.id, b.id));
    const ownership = new Map<string, string>();
    const packageMembers = new Map<string, string[]>();
    const ownersByRoot = new Map<string, string>();
    for (const pkg of packages) {
        const root = String(pkg.attributes['root'] ?? '.') || '.';
        if (!ownersByRoot.has(root)) ownersByRoot.set(root, pkg.id);
        for (const id of strings(pkg.attributes['memberIds'])) if (filesById.has(id) && !ownership.has(id)) ownership.set(id, pkg.id);
        packageMembers.set(pkg.id, []);
    }
    for (const node of selected) {
        let owner = ownership.get(node.id), directory = pathOf(node).split('/').slice(0, -1).join('/') || '.';
        while (!owner) { owner = ownersByRoot.get(directory); if (directory === '.') break; directory = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : '.'; }
        if (owner) { ownership.set(node.id, owner); packageMembers.get(owner)?.push(node.id); }
    }
    // Mutable union-find builder. Only declared package membership or a real dependency can join units.
    const parent = new Map(selected.map(node => [node.id, node.id]));
    const size = new Map(selected.map(node => [node.id, 1]));
    let count = selected.length;
    const find = (id: string): string => { let root = id; while (parent.get(root) !== root && parent.has(root)) root = parent.get(root) ?? root; let current = id; while (parent.has(current) && parent.get(current) !== root) { const next = parent.get(current) ?? root; parent.set(current, root); current = next; } return root; };
    const join = (left: string, right: string): void => { const a = find(left), b = find(right); if (a === b) return; const [root, child] = compare(a, b) < 0 ? [a, b] : [b, a]; if (!root || !child) return; parent.set(child, root); size.set(root, (size.get(a) ?? 0) + (size.get(b) ?? 0)); count--; };
    const cap = Math.max(1, Math.ceil(selected.length / 5));
    const namespaces = nodes.filter(node => node.kind === 'package' && !manifestPackage(node)).sort((a, b) => compare(a.id, b.id));
    for (const pkg of namespaces) packageMembers.set(pkg.id, strings(pkg.attributes['memberIds']).filter(id => filesById.has(id)));
    const declaredIds = new Set(packages.map(pkg => pkg.id));
    const declared = [...packageMembers].filter(([id, members]) => declaredIds.has(id) && members.length);
    const hasModuleLinks = edges.some(edge => edge.kind === 'imports' && filesById.has(edge.source) && filesById.has(edge.target));
    for (const [, members] of declared) if (members.length <= cap || (!hasModuleLinks && !namespaces.some(pkg => packageMembers.get(pkg.id)?.length))) {
        const first = members[0]; if (first) for (const id of members.slice(1)) join(first, id);
    }
    if (declared.length <= 1) for (const pkg of namespaces) {
        const members = packageMembers.get(pkg.id) ?? [], first = members[0];
        if (first) for (const id of members.slice(1)) join(first, id);
    }
    const units = new Map(selected.map(node => [node.id, find(node.id)]));
    for (const [id, members] of packageMembers) {
        const roots = [...new Set(members.map(find))];
        if (roots.length === 1 && roots[0]) units.set(id, roots[0]);
    }
    const degree = new Map<string, number>();
    const weights = new Map<string, { readonly source: string; readonly target: string; weight: number; }>();
    for (const edge of edges) {
        if ((edge.kind !== 'imports' && edge.kind !== 'depends-on') || !edge.directed) continue;
        const from = units.get(edge.source), to = units.get(edge.target);
        if (!from || !to || from === to) continue;
        const [source, target] = [from, to].sort(compare); if (!source || !target) continue;
        const key = JSON.stringify([source, target]);
        const relation = weights.get(key) ?? { source, target, weight: 0 }; relation.weight++; weights.set(key, relation);
        degree.set(source, (degree.get(source) ?? 0) + 1); degree.set(target, (degree.get(target) ?? 0) + 1);
    }
    const affinity = (relation: { readonly source: string; readonly target: string; readonly weight: number; }): number => relation.weight / Math.sqrt((degree.get(relation.source) ?? 1) * (degree.get(relation.target) ?? 1));
    const ranked = [...weights.values()].sort((a, b) => affinity(b) - affinity(a) || compare(a.source, b.source) || compare(a.target, b.target));
    for (const relation of ranked) {
        if (count <= 7) break;
        const a = find(relation.source), b = find(relation.target);
        if (a !== b && (size.get(a) ?? 0) + (size.get(b) ?? 0) <= cap) join(a, b);
    }
    // Sparse evidence falls back only to real directory ancestors; never an invented relation.
    if (count > 9) {
        const directories = new Map<string, string[]>();
        for (const node of selected) {
            let directory = pathOf(node).split('/').slice(0, -1).join('/');
            while (directory) { const ids = directories.get(directory) ?? []; ids.push(node.id); directories.set(directory, ids); directory = directory.includes('/') ? directory.slice(0, directory.lastIndexOf('/')) : ''; }
        }
        for (const [, ids] of [...directories].sort(([a], [b]) => b.split('/').length - a.split('/').length || compare(a, b))) {
            if (count <= 9) break;
            const inside = new Map<string, number>();
            for (const id of ids) inside.set(find(id), (inside.get(find(id)) ?? 0) + 1);
            const roots = [...inside].filter(([root, members]) => members === size.get(root)).map(([root]) => root), first = roots[0];
            if (first && count - roots.length + 1 >= 5) for (const id of roots.slice(1)) join(first, id);
        }
    }
    const members = new Map<string, Node[]>();
    for (const node of selected) { const root = find(node.id), list = members.get(root) ?? []; list.push(node); members.set(root, list); }
    const exactPackages = new Map<string, Node>();
    for (const pkg of [...packages, ...namespaces]) {
        const recorded = packageMembers.get(pkg.id) ?? [], first = recorded[0];
        if (!first) continue;
        const root = find(first);
        if (!exactPackages.has(root) && members.get(root)?.length === recorded.length && recorded.every(id => find(id) === root)) exactPackages.set(root, pkg);
    }
    const packageNames = new Map(packages.map(pkg => [pkg.id, pkg.name]));
    const groups: ComponentGroup[] = [...members].map(([root, values]) => {
        const pkg = exactPackages.get(root);
        return { id: `component:${root}`, members: values, packageNames: [...new Set(values.flatMap(node => { const owner = ownership.get(node.id); return owner ? packageNames.get(owner) ?? [] : []; }))].sort(compare), ...(pkg ? { package: pkg } : {}) };
    }).sort((a, b) => Number(b.members.some(mainFile)) - Number(a.members.some(mainFile)) || b.members.length - a.members.length || compare(a.id, b.id));
    const componentByNode = new Map(groups.flatMap(group => group.members.map(node => [node.id, group.id] as const)));
    // A namespace/package dependency is projected only when all its members resolve to one component.
    for (const pkg of nodes.filter(node => node.kind === 'package')) {
        const ids = [...new Set((packageMembers.get(pkg.id) ?? strings(pkg.attributes['memberIds'])).flatMap(id => componentByNode.get(id) ?? []))];
        if (ids.length === 1 && ids[0]) componentByNode.set(pkg.id, ids[0]);
    }
    let unprojectedDependencyCount = 0;
    const dependencies = new Map<string, { source: string; target: string; files: Set<string>; declarations: Set<string>; sources: Map<string, Source>; }>();
    for (const edge of edges) {
        if ((edge.kind !== 'imports' && edge.kind !== 'depends-on') || !edge.directed) continue;
        const source = componentByNode.get(edge.source), target = componentByNode.get(edge.target);
        if (!source || !target) { if ((source || packageMembers.get(edge.source)?.length) && (target || packageMembers.get(edge.target)?.length)) unprojectedDependencyCount++; continue; }
        if (source === target) continue;
        const key = JSON.stringify([source, target]);
        const value = dependencies.get(key) ?? { source, target, files: new Set<string>(), declarations: new Set<string>(), sources: new Map<string, Source>() };
        const origin = filesById.get(edge.source);
        if (edge.kind === 'depends-on' || edge.attributes?.['importScope'] === 'project' || !origin) value.declarations.add(edge.source); else value.files.add(pathOf(origin));
        for (const evidence of edge.sources) value.sources.set(JSON.stringify(evidence), evidence);
        dependencies.set(key, value);
    }
    const links: FirstImpressionDependency[] = [...dependencies.values()].map(value => ({ source: value.source, target: value.target, importingFileCount: value.files.size, declarationCount: value.declarations.size, sources: [...value.sources].sort(([a], [b]) => compare(a, b)).slice(0, 3).map(([, source]) => source) })).sort((a, b) => compare(a.source, b.source) || compare(a.target, b.target));
    const executableModules = new Set(nodes.filter(node => node.kind === 'function' && Array.isArray(node.attributes['entrypoints']) && node.attributes['entrypoints'].some(value => value !== null && typeof value === 'object' && !Array.isArray(value) && ['executable', 'module-execution'].includes(String(value['category'])))).map(node => String(node.attributes['module'] ?? '')));
    const connectivity = new Map<string, number>();
    for (const link of links) for (const id of [link.source, link.target]) connectivity.set(id, (connectivity.get(id) ?? 0) + link.importingFileCount + link.declarationCount);
    groups.sort((a, b) => Number(b.members.some(node => executableModules.has(node.id))) - Number(a.members.some(node => executableModules.has(node.id))) || Number(b.members.some(mainFile)) - Number(a.members.some(mainFile)) || (connectivity.get(b.id) ?? 0) - (connectivity.get(a.id) ?? 0) || b.members.length - a.members.length || compare(a.id, b.id));
    return { groups, dependencies: links, unprojectedDependencyCount, fileCount: selected.length, auxiliaryFileCount: files.length - selected.length };
}
