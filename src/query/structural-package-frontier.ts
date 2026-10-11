import type { LoopStage } from './loop-map-types.js';
import { representativeNames } from './structural-name-facts.js';
import type { Node } from '../core/model.js';

/** Large package sets fold only at physical parent boundaries; small workspaces stay explicit. */
export function packageFrontier(packages: readonly LoopStage[], nodes: ReadonlyMap<string, Node>): { readonly stages: readonly LoopStage[]; readonly roots: readonly string[]; } {
    if (packages.length <= 12) return { stages: packages, roots: packages.map(stage => stage.id) };
    const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    const byDirectory = new Map<string, LoopStage[]>();
    const paths = new Set(['.']);
    for (const stage of packages) {
        let path = stage.directoryPath ?? '.';
        const list = byDirectory.get(path) ?? []; list.push(stage); byDirectory.set(path, list);
        while (true) { paths.add(path); if (path === '.') break; path = parent(path); }
    }
    const children = new Map<string, string[]>();
    for (const path of paths) if (path !== '.') { const p = parent(path), list = children.get(p) ?? []; list.push(path); children.set(p, list); }
    const stages = new Map(packages.map(stage => [stage.id, stage]));
    const tree = new Map<string, string>();
    const packageCounts = new Map<string, number>(packages.map(stage => [stage.id, 1]));
    for (const path of [...paths].sort((a, b) => b.split('/').length - a.split('/').length || b.length - a.length || a.localeCompare(b))) {
        const direct = byDirectory.get(path) ?? [];
        const childIds = [...direct.map(stage => stage.id), ...(children.get(path) ?? []).sort().flatMap(child => tree.get(child) ?? [])];
        if (childIds.length === 1) { const id = childIds[0]; if (id) tree.set(path, id); continue; }
        const id = `manifest-folder:${path}`;
        const descendants = childIds.flatMap(child => stages.get(child)?.descendantNodeIds ?? []);
        const units = childIds.every(child => child.startsWith('manifest:') || child.startsWith('manifest-folder:')) ? '패키지' : '덩어리';
        const count = childIds.reduce((sum, child) => sum + (packageCounts.get(child) ?? 0), 0);
        const names = childIds.slice(0, 3).flatMap(child => stages.get(child)?.title ?? []);
        const facts = representativeNames(descendants.flatMap(member => nodes.get(member) ?? []));
        const stage: LoopStage = { id, title: `${path} · ${units} ${count}개`, directoryPath: path, summary: '하위 패키지를 포함하는 경로입니다.', summaryDetail: facts ?? { label: '포함 패키지', text: names.join(' · ') + (childIds.length > names.length ? ` 외 ${childIds.length - names.length}개` : '') }, unit: '파일', nodeIds: [], descendantNodeIds: descendants, childIds, folderCount: count, groups: [], incoming: [], outgoing: [] };
        stages.set(id, stage); packageCounts.set(id, count); tree.set(path, id);
        for (const child of childIds) { const childStage = stages.get(child); if (childStage) stages.set(child, { ...childStage, parentId: id }); }
    }
    const top = tree.get('.'), topChildren = top ? stages.get(top)?.childIds ?? [] : [];
    const roots = topChildren.length > 12 && topChildren.length <= 24 ? [...topChildren] : top ? [top] : [];
    while (true) {
        const candidate = roots.map((id, index) => ({ id, index, children: stages.get(id)?.childIds ?? [] })).find(item => item.children.length > 0 && roots.length - 1 + item.children.length <= 12);
        if (!candidate) break;
        roots.splice(candidate.index, 1, ...candidate.children);
    }
    return { stages: [...stages.values()], roots };
}
