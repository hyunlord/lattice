import type { InterpretationCitation } from '../interpretation/model.js';
import type { Source } from '../core/model.js';

export type FirstImpressionClaim = { readonly text: string; readonly citations: readonly Omit<InterpretationCitation, 'excerpt'>[]; };
export type FirstImpressionMember = { readonly id: string; readonly name: string; readonly path: string; };
export type FirstImpressionComponent = {
    readonly category?: 'auxiliary';
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly basis: 'source-description' | 'public-names' | 'inventory';
    readonly fileCount: number;
    readonly memberPreview: readonly FirstImpressionMember[];
    readonly sources: readonly Source[];
    readonly membershipPath: string;
    readonly claims?: readonly FirstImpressionClaim[];
    readonly titleClaim?: FirstImpressionClaim;
};
export type FirstImpressionDependency = { readonly source: string; readonly target: string; readonly importingFileCount: number; readonly declarationCount: number; readonly sources: readonly Source[]; };
export type FirstImpressionEntrypoint = { readonly id: string; readonly name: string; readonly category: 'executable' | 'public-api'; readonly source: Source; readonly componentId?: string; readonly targetKind?: 'function' | 'node'; readonly basis?: 'static-call-graph' | 'package-entry' | 'ui-root'; };
export type FirstImpressionFlow = {
    readonly rootId: string;
    readonly nodes: readonly { readonly id: string; readonly name: string; readonly source?: Source; readonly componentId?: string; }[];
    readonly edges: readonly { readonly id: string; readonly source: string; readonly target: string; readonly sources: readonly Source[]; }[];
    readonly truncated: boolean;
    readonly basis: 'static-call-graph';
};
export type FirstImpression = {
    readonly schemaVersion: 1;
    readonly graphHash: string;
    readonly purpose: { readonly text: string; readonly basis: 'source-description' | 'inventory'; readonly sources: readonly Source[]; };
    readonly components: readonly FirstImpressionComponent[];
    readonly componentCount: number;
    readonly fileCount: number;
    readonly auxiliaryFileCount: number;
    readonly dependencies: readonly FirstImpressionDependency[];
    readonly dependencyCount: number;
    readonly unprojectedDependencyCount: number;
    readonly entrypoints: readonly FirstImpressionEntrypoint[];
    readonly entrypointCount: number;
    readonly flows: readonly FirstImpressionFlow[];
    readonly stack: readonly { readonly name: string; readonly basis: 'language' | 'manifest'; readonly fileCount: number; readonly sources: readonly Source[]; }[];
    readonly remainder?: { readonly componentCount: number; readonly fileCount: number; readonly path: string; };
};
export type FirstImpressionMembershipPage = { readonly graphHash: string; readonly members: readonly FirstImpressionMember[]; readonly nextPath?: string; };
export type FirstImpressionComponentsPage = { readonly graphHash: string; readonly components: readonly FirstImpressionComponent[]; readonly nextPath?: string; };
