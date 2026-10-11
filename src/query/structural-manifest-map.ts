import type { Edge, Node } from '../core/model.js';
import type { LoopFlow, LoopStage } from './loop-map-types.js';
import { representativeNames } from './structural-name-facts.js';
import { packageFrontier } from './structural-package-frontier.js';
import { components } from './structural-frontier.js';
import { structuralFilePreviews } from './structural-file-previews.js';

type Structure = { readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly rootStageIds: readonly string[]; readonly defaultStage: string; readonly structuralSourceRoot: string; readonly structuralEntryStageIds: readonly string[]; readonly verifiedCycleStageGroups: readonly (readonly string[])[]; };
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const root = (node: Node): string => typeof node.attributes['root'] === 'string' ? node.attributes['root'] || '.' : '.';
const pathOf = (node: Node): string => node.sources[0]?.path ?? node.name;
const parent = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';
export const manifestPackage = (node: Node): boolean => node.kind === 'package' && typeof node.attributes['buildSystem'] === 'string' && typeof node.attributes['manifestPath'] === 'string';


/** Build ownership is stronger evidence than incidental words in source paths. */
export function manifestProductSelection(nodes: readonly Node[]): ReadonlyMap<string, boolean> {
    const packages = nodes.filter(manifestPackage).sort((a, b) => root(b).length - root(a).length);
    const roots = new Map<string, Node>(), members = new Map<string, Node>();
    for (const pkg of packages) {
        if (!roots.has(root(pkg))) roots.set(root(pkg), pkg);
        for (const id of strings(pkg.attributes['memberIds'])) if (!members.has(id)) members.set(id, pkg);
    }
    const godotRoots = new Set(packages.filter(pkg => pkg.attributes['buildSystem'] === 'godot').map(root));
    const unity = packages.some(pkg => pkg.attributes['buildSystem'] === 'unity'), result = new Map<string, boolean>();
    for (const node of nodes) {
        if (node.kind !== 'module' && node.kind !== 'file') continue;
        const path = pathOf(node); let owner = members.get(node.id), directory = parent(path);
        while (!owner) { owner = roots.get(directory); if (directory === '.') break; directory = parent(directory); }
        const system = owner?.attributes['buildSystem'];
        if (owner && godotRoots.has(root(owner))) { result.set(node.id, true); continue; }
        if (system === 'unity') { result.set(node.id, owner?.attributes['isTestAssembly'] !== true); continue; }
        if (unity && /(?:^|\/)Assets\/.*\.cs$/u.test(path) && !owner) { result.set(node.id, true); continue; }
        if (system === 'godot') { result.set(node.id, true); continue; }
        if (!owner) continue;
        const relative = root(owner) === '.' ? path : path.slice(root(owner).length + 1);
        if (system === 'gradle') {
            const set = /^src\/([^/]+)\//u.exec(relative)?.[1];
            if (set) result.set(node.id, !/^(?:test|androidTest|testFixtures|androidUnitTest|androidInstrumentedTest|commonTest|jvmTest)|Test$/u.test(set));
        } else if (system === 'cargo' || system === 'maven') {
            if (strings(owner.attributes['sourceRoots']).some(source => path.startsWith(source + '/'))) result.set(node.id, true);
        }
    }
    return result;
}

export function manifestStructuralMap(nodes: readonly Node[], edges: readonly Edge[], fallback: (nodes: readonly Node[], edges: readonly Edge[]) => Structure): Structure | undefined {
    const packages = nodes.filter(manifestPackage).sort((a, b) => root(b).length - root(a).length || a.id.localeCompare(b.id));
    if (!packages.length) return undefined;
    const byId = new Map(nodes.map(node => [node.id, node]));
    const modules = nodes.filter(node => node.kind === 'module');
    const sources = modules.length ? modules : nodes.filter(node => node.kind === 'file');
    const sourceIds = new Set(sources.map(node => node.id));
    const owner = new Map<string, string>();
    const roots = new Map<string, string>();
    for (const pkg of packages) {
        if (!roots.has(root(pkg))) roots.set(root(pkg), pkg.id);
        for (const id of strings(pkg.attributes['memberIds'])) if (sourceIds.has(id) && !owner.has(id)) owner.set(id, pkg.id);
    }
    for (const source of sources) {
        if (owner.has(source.id)) continue;
        let directory = parent(pathOf(source));
        while (true) {
            const id = roots.get(directory);
            if (id) { owner.set(source.id, id); break; }
            if (directory === '.') break;
            directory = parent(directory);
        }
    }
    const members = new Map<string, Node[]>();
    for (const source of sources) { const id = owner.get(source.id); if (id) members.set(id, [...(members.get(id) ?? []), source]); }
    const remaining = nodes.filter(node => !manifestPackage(node) && !owner.has(node.id));
    const folders = fallback(remaining, edges);
    const stageOwner = new Map<string, string>([...owner].map(([id, pkg]) => [id, `manifest:${pkg}`]));
    for (const stage of folders.stages) for (const id of stage.nodeIds) stageOwner.set(id, stage.id);
    for (const pkg of packages) stageOwner.set(pkg.id, `manifest:${pkg.id}`);
    for (const node of nodes.filter(node => node.kind === 'package' && !manifestPackage(node))) {
        const owners = new Set(strings(node.attributes['memberIds']).flatMap(id => stageOwner.get(id) ?? []));
        if (owners.size === 1) { const id = [...owners][0]; if (id) stageOwner.set(node.id, id); }
    }
    const previewEdges = new Map<string, Edge[]>();
    for (const edge of edges) {
        if (edge.kind !== 'references') continue;
        const id = owner.get(edge.source);
        if (id) { const list = previewEdges.get(id) ?? []; list.push(edge); previewEdges.set(id, list); }
    }
    const packageStages: LoopStage[] = [...packages].sort((a, b) => root(a).localeCompare(root(b)) || a.name.localeCompare(b.name)).map(pkg => {
        const items = members.get(pkg.id) ?? [], ids = items.map(node => node.id);
        const description = text(pkg.attributes['description']);
        const manifestPath = text(pkg.attributes['manifestPath']);
        const summaryDetail = description ? undefined : representativeNames(items);
        return { id: `manifest:${pkg.id}`, title: pkg.name, directoryPath: root(pkg), summary: description || '역할 설명 없음 — 요약 실행 필요', ...(summaryDetail ? { summaryDetail } : {}), summaryEvidence: description ? [{ path: manifestPath, line: pkg.sources[0]?.line ?? 1 }] : [], unit: '파일', nodeIds: ids, descendantNodeIds: ids, childIds: [], groups: [{ title: '파일', items: ids.map(id => ({ id })) }], incoming: [], outgoing: [], filePreviews: structuralFilePreviews(items, previewEdges.get(pkg.id) ?? []) };
    });
    const grouped = new Map<string, { source: string; target: string; files: Set<string>; manifests: Set<string>; }>();
    for (const edge of edges) {
        if (edge.kind !== 'imports' && edge.kind !== 'depends-on') continue;
        const source = stageOwner.get(edge.source), target = stageOwner.get(edge.target);
        if (!source || !target || source === target) continue;
        const key = JSON.stringify([source, target]);
        const value = grouped.get(key) ?? { source, target, files: new Set<string>(), manifests: new Set<string>() };
        const origin = byId.get(edge.source);
        if (origin) {
            const path = pathOf(origin);
            value.files.add(path);
            if (edge.kind === 'depends-on' || edge.attributes?.['importScope'] === 'project') value.manifests.add(path);
        }
        grouped.set(key, value);
    }
    const flows: LoopFlow[] = [...grouped.values()].map(value => ({ source: value.source, target: value.target, sourceFiles: [...value.files].sort(), count: value.files.size, ...(value.manifests.size ? { projectSourceFiles: [...value.manifests].sort() } : {}), label: [value.files.size > value.manifests.size ? `${value.files.size - value.manifests.size}개 파일 사용` : '', value.manifests.size ? `패키지 의존 선언 ${value.manifests.size}개` : ''].filter(Boolean).join(' · ') }));
    const frontier = packageFrontier([...packageStages, ...folders.stages.filter(stage => folders.rootStageIds.includes(stage.id))], byId);
    const merged = new Map(folders.stages.map(stage => [stage.id, stage]));
    for (const stage of frontier.stages) merged.set(stage.id, stage);
    const stages = [...merged.values()];
    const rootStageIds = frontier.roots;
    const entries = sources.filter(node => Array.isArray(node.attributes['entryPoints']) && node.attributes['entryPoints'].length > 0).flatMap(node => stageOwner.get(node.id) ?? []);
    for (const pkg of packages) if (Array.isArray(pkg.attributes['entryTargets']) && pkg.attributes['entryTargets'].length > 0) entries.push(`manifest:${pkg.id}`);
    return { stages, flows, rootStageIds, defaultStage: rootStageIds[0] ?? '', structuralSourceRoot: '.', structuralEntryStageIds: [...new Set(entries)], verifiedCycleStageGroups: components(rootStageIds, flows).filter(group => group.length > 1) };
}
