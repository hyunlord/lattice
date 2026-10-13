import { firstImpressionPages } from './first-impression-pages.js';
import type { ClaimInterpretation } from '../interpretation/model.js';
import type { Graph } from '../core/model.js';
import { firstImpressionGroups, pathOf } from './first-impression-components.js';
import { firstImpressionComponent, firstImpressionLogic, firstImpressionPurpose, firstImpressionStack } from './first-impression-facts.js';
import type { FirstImpression, FirstImpressionComponentsPage, FirstImpressionMembershipPage } from './first-impression-types.js';

export type FirstImpressionGraph = Pick<Graph, 'hash' | 'repository' | 'nodes' | 'edges'>;
export type FirstImpressionWrite = (path: string, value: FirstImpressionMembershipPage | FirstImpressionComponentsPage) => void;
/** Bounded transport derived from source facts; canonical graph identity and lens projections stay unchanged. */
export function buildFirstImpression(graph: FirstImpressionGraph, write: FirstImpressionWrite, options: { readonly namespace?: string; readonly interpretations?: readonly ClaimInterpretation[]; } = {}): FirstImpression {
    const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
    const grouped = firstImpressionGroups(nodes, graph.edges);
    const namespace = (options.namespace ?? '').split('').map(unit => unit.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    const prefix = `first-impression/${graph.hash}/layer-${namespace}`;
    const components = grouped.groups.map((group, index) => {
        const members = group.members.map(node => ({ id: node.id, name: node.name, path: pathOf(node) }));
        const path = (page: number): string => `${prefix}/members-${index}-${page}.json`;
        const pages = firstImpressionPages(members, 128);
        pages.forEach((members, index) => write(path(index), { graphHash: graph.hash, members, ...(index + 1 < pages.length ? { nextPath: path(index + 1) } : {}) }));
        const component = firstImpressionComponent(group, path(0));
        const sources = new Map(group.members.flatMap(node => node.sources.map(source => [source.path, source.contentHash] as const)));
        const note = options.interpretations?.find(item => item.sources.length === sources.size && item.sources.every(source => sources.get(source.path) === source.contentHash));
        const claims = note?.validatedClaims.filter(claim => claim.citations.length <= 4).slice(0, 2).map(claim => ({ text: claim.text, citations: claim.citations.map(citation => ({ path: citation.path, contentHash: citation.contentHash, startLine: citation.startLine, endLine: citation.endLine, ...(citation.nodeId ? { nodeId: citation.nodeId } : {}), ...(citation.edgeId ? { edgeId: citation.edgeId } : {}), ...(citation.url ? { url: citation.url } : {}) })) }));
        return claims?.length ? { ...component, claims } : component;
    });
    const featured = components.slice(0, 9), visible = new Set(featured.map(component => component.id));
    const remaining = components.slice(9), path = (page: number): string => `${prefix}/remaining-${page}.json`;
    const pages = firstImpressionPages(remaining, 32);
    pages.forEach((components, index) => write(path(index), { graphHash: graph.hash, components, ...(index + 1 < pages.length ? { nextPath: path(index + 1) } : {}) }));
    return { schemaVersion: 1, graphHash: graph.hash, purpose: firstImpressionPurpose(nodes, grouped.fileCount), components: featured, componentCount: components.length, fileCount: grouped.fileCount, auxiliaryFileCount: grouped.auxiliaryFileCount, dependencyCount: grouped.dependencies.length, unprojectedDependencyCount: grouped.unprojectedDependencyCount, dependencies: grouped.dependencies.filter(edge => visible.has(edge.source) && visible.has(edge.target)), ...firstImpressionLogic({ nodes, edges: graph.edges }), stack: firstImpressionStack(nodes), ...(remaining.length ? { remainder: { componentCount: remaining.length, fileCount: remaining.reduce((count, component) => count + component.fileCount, 0), path: path(0) } } : {}) };
}
