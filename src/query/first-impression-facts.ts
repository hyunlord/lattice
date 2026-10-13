import { firstImpressionFlow } from './first-impression-flow.js';
import { descriptiveProse } from '../adapters/description-prose.js';
import type { Node, Source } from '../core/model.js';
import type { JsonValue } from '../core/canonical.js';
import { executionCategory } from '../core/logic-policy.js';
import { logicEntrypoints, type LogicGraph } from './logic-model.js';
import { structuralSummary } from './structural-map-model.js';
import { representativeNames } from './structural-name-facts.js';
import { manifestPackage } from './structural-manifest-map.js';
import { pathOf, strings, type ComponentGroup } from './first-impression-components.js';
import type { FirstImpression, FirstImpressionComponent, FirstImpressionEntrypoint, FirstImpressionFlow } from './first-impression-types.js';

const object = (value: JsonValue | undefined): value is { readonly [key: string]: JsonValue; } => value !== null && typeof value === 'object' && !Array.isArray(value);
function description(node: Node): { readonly text: string; readonly sources: readonly Source[]; } | undefined {
    const value = node.attributes['sourceDescription'];
    if (!object(value) || typeof value['text'] !== 'string' || !value['text'].trim() || !descriptiveProse(value['text']) || /^(?:unless required by applicable law|distributed under the licen[cs]e|without warranties or conditions|see the licen[cs]e for the specific language)/iu.test(value['text'].trim())) return undefined;
    const source = node.sources[0];
    if (!source) return undefined;
    const narrowed = { ...source, ...(typeof value['line'] === 'number' ? { line: value['line'] } : {}), ...(typeof value['endLine'] === 'number' ? { endLine: value['endLine'] } : {}) };
    const fragment = `#L${narrowed.line}${narrowed.endLine !== undefined && narrowed.endLine > narrowed.line ? `-L${narrowed.endLine}` : ''}`;
    return { text: value['text'].replace(/\s+/gu, ' ').trim().slice(0, 500), sources: [{ ...narrowed, ...(source.url ? { url: source.url.replace(/#L\d+(?:-L\d+)?$/u, fragment) } : {}) }] };
}
export function firstImpressionPurpose(nodes: readonly Node[], count: number): FirstImpression['purpose'] {
    const documents = nodes.filter(node => node.kind === 'document').sort((a, b) => pathOf(a).localeCompare(pathOf(b)));
    const text = structuralSummary([], documents, '.');
    const document = documents.find(node => /^(?:[^/]+|\.github\/readme(?:\.[^/]*)?)$/iu.test(pathOf(node)) && description(node)?.text.startsWith(text));
    const introduction = document?.attributes['sourceIntroduction'];
    const paragraph = document && object(introduction) && typeof introduction['text'] === 'string' ? description({ ...document, attributes: { ...document.attributes, sourceDescription: introduction } }) : undefined;
    const fact = paragraph ?? (document ? description(document) : undefined);
    return text && fact ? { text: fact.text, basis: 'source-description', sources: fact.sources } : { text: `${count} source files`, basis: 'inventory', sources: [] };
}
export function firstImpressionComponent(group: ComponentGroup, membershipPath: string): FirstImpressionComponent {
    const preview = group.members.slice(0, 3).map(node => ({ id: node.id, name: node.name, path: pathOf(node) }));
    const directories = group.members.map(node => pathOf(node).split('/').slice(0, -1).join('/') || '.');
    const common = (directories[0] ?? '.').split('/');
    while (common.length && !directories.every(path => path === common.join('/') || path.startsWith(common.join('/') + '/'))) common.pop();
    const commonPath = common.join('/');
    const packageTitle = group.packageNames.length > 1 ? group.packageNames.slice(0, 2).join(' + ') + (group.packageNames.length > 2 ? ` (+${group.packageNames.length - 2})` : '') : undefined;
    const title = group.package?.name ?? packageTitle ?? (commonPath && commonPath !== '.' ? `${commonPath} · ${preview[0]?.path.split('/').at(-1) ?? ''}${group.members.length > 1 ? ` (+${group.members.length - 1})` : ''}` : preview.slice(0, 2).map(node => node.path.split('/').at(-1) ?? node.name).join(' + ') + (group.members.length > 2 ? ` (+${group.members.length - 2})` : ''));
    const documented = group.package ? description(group.package) : group.members.length === 1 && group.members[0] ? description(group.members[0]) : undefined;
    const names = representativeNames(group.members);
    return { id: group.id, title, description: documented?.text ?? names?.text ?? `${group.members.length} source files · ${preview.map(node => node.path).join(' · ')}`, basis: documented ? 'source-description' : names ? 'public-names' : 'inventory', fileCount: group.members.length, memberPreview: preview, sources: documented?.sources ?? group.members.flatMap(node => node.sources.slice(0, 1)).slice(0, 3), membershipPath };
}
export function firstImpressionLogic(graph: LogicGraph, groups: readonly ComponentGroup[] = []) {
    const componentByNode = new Map(groups.flatMap(group => group.members.map(node => [node.id, group.id] as const)));
    const componentByPath = new Map(groups.flatMap(group => group.members.map(node => [pathOf(node), group.id] as const)));
    const component = (node: Node): { readonly componentId?: string; } => {
        const id = componentByNode.get(String(node.attributes['module'] ?? node.id)) ?? componentByPath.get(pathOf(node));
        return id ? { componentId: id } : {};
    };
    const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
    const page = logicEntrypoints(graph, { limit: 200 });
    const logicRootByDestination = new Map<string, string>();
    const selected: FirstImpressionEntrypoint[] = page.items.flatMap(item => {
        const entry = item.entrypoints.find(value => executionCategory(value.category)) ?? item.entrypoints.find(value => value.category === 'public-api') ?? item.entrypoints.find(value => value.category === 'ui-root');
        const owner = entry?.category === 'ui-root' && item.node.name === '<module>' ? nodesById.get(String(item.node.attributes['module'] ?? '')) : undefined;
        const target = owner && (owner.kind === 'module' || owner.kind === 'file') ? owner : item.node;
        logicRootByDestination.set(target.id, item.node.id);
        return entry ? [{ id: target.id, name: entry.rule.startsWith('ui-root:') ? entry.rule.slice(8) : item.node.name, ...component(target), targetKind: target.kind === 'function' ? 'function' as const : 'node' as const, basis: entry.category === 'ui-root' ? 'ui-root' as const : 'static-call-graph' as const, category: executionCategory(entry.category) ? 'executable' as const : 'public-api' as const, source: entry.source }] : [];
    });
    const flows: FirstImpressionFlow[] = [];
    for (const entry of selected.slice(0, 12)) {
        if (flows.length === 3) break;
        const rootId = logicRootByDestination.get(entry.id) ?? entry.id;
        const flow = firstImpressionFlow(graph, rootId, componentByNode);
        if (!flow.edges.length) continue;
        flows.push({ rootId, nodes: flow.nodes.map(item => ({ id: item.node.id, name: item.node.name, ...component(item.node), ...(item.node.sources[0] ? { source: item.node.sources[0] } : {}) })), edges: flow.edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, sources: edge.sources.slice(0, 2) })), truncated: flow.truncated, basis: 'static-call-graph' });
    }
    const alternatives: FirstImpressionEntrypoint[] = [];
    if (!selected.some(entry => entry.category === 'executable') || !flows.length) {
        for (const pkg of graph.nodes.filter(manifestPackage)) {
            if (!strings(pkg.attributes['entryTargets']).length || !pkg.sources[0]) continue;
            const members = strings(pkg.attributes['memberIds']).flatMap(id => componentByNode.get(id) ?? []);
            const ids = [...new Set(members)];
            if (!ids.length) continue;
            const target = graph.nodes.find(node => (node.kind === 'module' || node.kind === 'file') && strings(pkg.attributes['entryTargets']).includes(pathOf(node)) && componentByNode.has(node.id));
            const componentId = target ? componentByNode.get(target.id) : ids.length === 1 ? ids[0] : undefined;
            alternatives.push({ id: target?.id ?? pkg.id, name: pkg.name, category: 'public-api', source: pkg.sources[0], targetKind: 'node', basis: 'package-entry', ...(componentId ? { componentId } : {}) });
        }
    }
    const entries = selected.some(entry => entry.category === 'executable') ? [...selected, ...alternatives] : [...selected.filter(entry => entry.basis === 'ui-root'), ...alternatives, ...selected.filter(entry => entry.basis !== 'ui-root')];
    return { entrypoints: entries.slice(0, 8), entrypointCount: page.total + alternatives.length, flows };
}
export function firstImpressionStack(nodes: readonly Node[]): FirstImpression['stack'] {
    const facts = new Map<string, { name: string; basis: 'language' | 'manifest'; files: Set<string>; sources: Source[]; }>();
    for (const node of nodes) {
        const manifest = manifestPackage(node), language = node.attributes['language'];
        const name = manifest ? node.attributes['buildSystem'] : (node.kind === 'module' || node.kind === 'file') && typeof language === 'string' ? language : undefined;
        if (typeof name !== 'string' || !name) continue;
        const basis = manifest ? 'manifest' : 'language', key = `${basis}:${name}`;
        const value = facts.get(key) ?? { name, basis, files: new Set(), sources: [] };
        value.files.add(pathOf(node)); if (value.sources.length < 3 && node.sources[0]) value.sources.push(node.sources[0]); facts.set(key, value);
    }
    return [...facts.values()].sort((a, b) => b.files.size - a.files.size || a.name.localeCompare(b.name) || a.basis.localeCompare(b.basis)).slice(0, 12).map(value => ({ name: value.name, basis: value.basis, fileCount: value.files.size, sources: value.sources }));
}
