import { createHash } from 'node:crypto';
import type { Graph } from '../dist/core/model.js';
import type { LoopMap } from '../dist/query/loop-map-types.js';
import { createStructuralOverviewProjector } from '../dist/query/thin-structural-model.js';

function bucket(id: string): string { let value = 0; for (const char of id) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); }
export function writeOverviewParts(graph: Pick<Graph, 'hash' | 'repository'>, model: LoopMap, layer: string, write: (path: string, text: string) => void): string {
    const project = createStructuralOverviewProjector(model);
    const prefix = `overview-parts/${createHash('sha256').update(graph.hash + ':' + layer).digest('hex')}`;
    const buckets = new Map<string, Record<string, string>>();
    const nodes = new Map(model.nodes.map(node => [node.id, node]));
    const stages = new Map(model.stages.map(stage => [stage.id, stage]));
    const roots = model.rootStageIds ?? [], allRoots = model.structuralScope?.allRootStageIds ?? roots;
    const scopes = new Map<string, 'production' | 'all'>();
    for (const [scope, ids] of [['all', allRoots], ['production', roots]] as const) {
        const pending = [...ids], seen = new Set<string>();
        while (pending.length) { const id = pending.pop(); if (!id || seen.has(id)) continue; seen.add(id); scopes.set(id, scope); pending.push(...stages.get(id)?.childIds ?? []); }
    }
    const pageSize = model.stages.some(stage => stage.id.startsWith('manifest:') || stage.id.startsWith('manifest-folder:')) ? Math.max(12, Math.min(24, roots.length)) : 9;
    const pages = new Map<string, LoopMap>();
    const register = (id: string, path: string) => { const key = bucket(id), records = buckets.get(key) ?? {}; Object.defineProperty(records, id, { value: path, enumerable: true, configurable: true }); buckets.set(key, records); };
    const save = (value: LoopMap): string => { const text = JSON.stringify({ schemaVersion: 1, hash: graph.hash, repository: graph.repository, model: value }); const path = `${prefix}/data/${createHash('sha256').update(text).digest('hex')}.json`; write(path, text); return path; };
    const page = (scope: 'production' | 'all', parent: string, number: number): LoopMap => {
        const key = JSON.stringify([scope, parent, number]), prior = pages.get(key); if (prior) return prior;
        const siblings = parent ? stages.get(parent)?.childIds ?? [] : scope === 'all' ? allRoots : roots;
        const value = project(siblings.slice(number * pageSize, (number + 1) * pageSize));
        pages.set(key, value); register('page:' + key, save(value)); return value;
    };
    for (const scope of ['production', 'all'] as const) { const ids = scope === 'all' ? allRoots : roots; for (let index = 0; index < Math.max(ids.length, 1); index += pageSize) page(scope, '', index / pageSize); }
    for (const stage of model.stages) {
        const scope = scopes.get(stage.id) ?? 'production';
        const rootIds = scope === 'all' ? allRoots : roots;
        const parent = rootIds.includes(stage.id) ? '' : stage.parentId ?? '';
        const siblings = parent ? stages.get(parent)?.childIds ?? [] : rootIds;
        const base = page(scope, parent, Math.floor(Math.max(0, siblings.indexOf(stage.id)) / pageSize));
        const selectedNodes = stage.childIds?.length ? [] : stage.nodeIds.flatMap(id => nodes.get(id) ?? []);
        const selected = selectedNodes.length ? { ...stage, groups: stage.groups, nodeCount: stage.nodeIds.length } : base.stages.find(item => item.id === stage.id);
        register('stage:' + stage.id, save({ ...base, nodes: selectedNodes, stages: base.stages.map(item => item.id === stage.id && selected ? selected : item) }));
        for (let index = 0; index < (stage.childIds?.length ?? 0); index += pageSize) page(scope, stage.id, index / pageSize);
    }
    const initial = project();
    register('catalog', save({ ...initial, stages: [], flows: [], rootStageIds: [], structuralDependencyPages: [], structuralDependencyGroups: [], nodes: model.nodes.map(node => ({ ...node, fields: [], relationGroups: [] })) }));
    for (const node of model.nodes) {
        const ids = new Set([node.id, ...node.relationGroups.flatMap(group => group.items.map(item => item.id))]);
        register('focus:' + node.id, save({ ...initial, stages: [], flows: [], rootStageIds: [], structuralDependencyPages: [], structuralDependencyGroups: [], nodes: [...ids].flatMap(id => { const related = nodes.get(id); return related ? [{ ...related, relationGroups: id === node.id ? related.relationGroups : [] }] : []; }), defaultFocus: node.id }));
    }
    for (let index = 0; index < 256; index++) { const key = index.toString(16).padStart(2, '0'); write(`${prefix}/lookup/${key}.json`, JSON.stringify({ schemaVersion: 1, hash: graph.hash, repository: graph.repository, records: buckets.get(key) ?? {} })); }
    return prefix;
}
