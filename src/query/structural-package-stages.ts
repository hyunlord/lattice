import type { Node } from '../core/model.js';
import type { LoopFlow, LoopStage } from './loop-map-types.js';

type Structure = { stages: readonly LoopStage[]; rootStageIds: readonly string[]; defaultStage: string; flows: readonly LoopFlow[]; };
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

export function packageStages(model: Structure, nodes: readonly Node[]) {
    const byStage = new Map(model.stages.map(s => [s.id, s])), byNode = new Map(nodes.map(n => [n.id, n]));
    const rootOf = (id: string): string | undefined => { while (id) { if (model.rootStageIds.includes(id)) return id; id = byStage.get(id)?.parentId ?? ''; } return undefined; };
    const physical = new Map(model.stages.flatMap(s => s.nodeIds.filter(id => byNode.get(id)?.kind !== 'package').map(id => [id, rootOf(s.id)] as const)));
    const aliases = new Map<string, string>(), removedNodes = new Set<string>();
    const spanning = new Map<string, { directories: readonly string[]; label: string; }>();
    for (const stage of model.stages) {
        const pkg = stage.nodeIds.length === 1 ? byNode.get(stage.nodeIds[0] ?? '') : undefined;
        if (pkg?.kind !== 'package') continue;
        const members = strings(pkg.attributes['memberIds']), owners = new Set(members.map(id => physical.get(id)));
        const owner = owners.size === 1 ? [...owners][0] : undefined;
        if (members.length && owner && owner !== stage.id) { aliases.set(stage.id, owner); removedNodes.add(pkg.id); }
        else if (strings(pkg.attributes['directories']).length > 1) spanning.set(stage.id, { directories: strings(pkg.attributes['directories']), label: `여러 폴더가 공유하는 ${pkg.attributes['category'] === 'namespace' ? '네임스페이스' : '패키지'}` });
    }
    const removed = new Set(aliases.keys()), pending = [...removed];
    const parents = new Map<string, string[]>(), childCounts = new Map<string, number>();
    for (const stage of model.stages) for (const child of stage.childIds ?? []) { parents.set(child, [...(parents.get(child) ?? []), stage.id]); childCounts.set(stage.id, (childCounts.get(stage.id) ?? 0) + 1); }
    for (let index = 0; index < pending.length; index++) for (const parent of parents.get(pending[index] ?? '') ?? []) {
        const count = (childCounts.get(parent) ?? 1) - 1; childCounts.set(parent, count);
        if (!count && !byStage.get(parent)?.nodeIds.length && !removed.has(parent)) { removed.add(parent); pending.push(parent); }
    }
    const removedPaths = new Set([...aliases.keys()].map(id => id.slice('folder:'.length)));
    const stages = model.stages.filter(s => !removed.has(s.id)).map(stage => {
        const shared = spanning.get(stage.id), directories = shared?.directories;
        const scopePaths = stage.scopePaths?.filter(path => !removedPaths.has(path));
        const changed = !stage.nodeIds.length && scopePaths && scopePaths.length !== stage.scopePaths?.length;
        const headingParts = changed ? [...new Set([...(stage.headingParts ?? []).filter(path => scopePaths.includes(path)), ...scopePaths])].slice(0, 2) : stage.headingParts;
        const headingRemainder = changed ? Math.max(0, scopePaths.length - (headingParts?.length ?? 0)) : stage.headingRemainder;
        const title = changed ? `${headingParts?.join(' · ')}${headingRemainder ? ` 외 ${headingRemainder}개 폴더` : ''}` : stage.title;
        return { ...stage, ...(changed ? { title, scopePaths, headingParts: headingParts ?? [], headingRemainder: headingRemainder ?? 0 } : {}), ...(stage.childIds ? { childIds: stage.childIds.filter(id => !removed.has(id)) } : {}), ...(stage.descendantNodeIds ? { descendantNodeIds: stage.descendantNodeIds.filter(id => !removedNodes.has(id)) } : {}), ...(directories ? { summary: '', summaryDetails: [], summaryEvidence: [], scopePaths: directories, summaryDetail: { label: shared?.label ?? '', text: directories.join(' · ') } } : {}) };
    });
    const grouped = new Map<string, { source: string; target: string; files: Set<string>; project: Set<string>; }>();
    for (const flow of model.flows) {
        const source = aliases.get(flow.source) ?? flow.source, target = aliases.get(flow.target) ?? flow.target;
        if (source === target) continue;
        const key = JSON.stringify([source, target]), group = grouped.get(key) ?? { source, target, files: new Set<string>(), project: new Set<string>() };
        for (const file of flow.sourceFiles ?? []) group.files.add(file);
        for (const file of flow.projectSourceFiles ?? []) group.project.add(file);
        grouped.set(key, group);
    }
    const flows: LoopFlow[] = aliases.size ? [...grouped.values()].map(g => ({ source: g.source, target: g.target, sourceFiles: [...g.files].sort(), count: g.files.size, ...(g.project.size ? { projectSourceFiles: [...g.project].sort() } : {}), label: [g.files.size > g.project.size ? `${g.files.size - g.project.size}개 파일 사용` : '', g.project.size ? `프로젝트 선언 ${g.project.size}개` : ''].filter(Boolean).join(' · ') })) : [...model.flows];
    const rootStageIds = model.rootStageIds.filter(id => !removed.has(id));
    const selected = aliases.get(model.defaultStage) ?? model.defaultStage;
    return { stages, flows, rootStageIds, defaultStage: rootStageIds.includes(selected) ? selected : rootStageIds[0] ?? '' };
}
