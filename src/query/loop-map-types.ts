export type LoopStatus = 'present' | 'absent' | 'unknown';
export type LoopShape = 'diamond' | 'square' | 'circle' | 'pill' | 'star' | 'triangle' | 'flag' | 'target' | 'hexagon' | 'house';
export type LoopTone = 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray' | 'teal';
export type LoopInterpretation = { readonly summary: string; readonly stale: boolean; readonly evidence: readonly { readonly path: string; readonly line?: number; readonly url?: string; }[]; };
export type LoopMedia = { readonly url: string; readonly frame?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }; readonly alt?: string; readonly sourcePath: string; readonly sourceHash: string; };
export type LoopItem = { readonly id: string; readonly note?: string; readonly via?: readonly { readonly id: string; readonly name: string; }[]; };
export type LoopRelationGroup = { readonly side: 'incoming' | 'outgoing'; readonly label: string; readonly items: readonly LoopItem[]; };
export type LoopNode = {
    readonly id: string; readonly name: string; readonly kind: string; readonly kindLabel?: string;
    readonly summary: string; readonly status: LoopStatus; readonly kindShape?: LoopShape; readonly kindColor?: LoopTone;
    readonly fields: readonly { readonly label: string; readonly value: string | readonly string[]; }[];
    readonly relationGroups: readonly LoopRelationGroup[]; readonly catalogSummary?: string; readonly ordinal?: number;
    readonly interpretation?: LoopInterpretation; readonly media?: LoopMedia;
};
export type LoopStage = {
    readonly id: string; readonly title: string; readonly summary: string; readonly unit: string; readonly nodeIds: readonly string[];
    readonly groups: readonly { readonly title: string; readonly items: readonly LoopItem[]; }[];
    readonly incoming: readonly { readonly name: string; readonly description: string; }[];
    readonly outgoing: readonly { readonly name: string; readonly description: string; }[];
    readonly interpretation?: LoopInterpretation;
    readonly parentId?: string; readonly childIds?: readonly string[]; readonly descendantNodeIds?: readonly string[];
    readonly summaryEvidence?: readonly { readonly path: string; readonly line: number; }[];
};
export type LoopFlow = { readonly source: string; readonly target: string; readonly label: string; readonly tone?: 'normal' | 'warning'; readonly auxiliary?: boolean; readonly count?: number; readonly sourceFiles?: readonly string[]; readonly projectSourceFiles?: readonly string[]; };
export type LoopMap = {
    readonly title?: string; readonly subtitle?: string; readonly lead: string;
    readonly verifiedCycleStageGroups?: readonly (readonly string[])[];
    readonly structural?: boolean; readonly rootStageIds?: readonly string[]; readonly showStatus?: boolean;
    readonly center?: { readonly title: string; readonly description: string; };
    readonly stages: readonly LoopStage[]; readonly flows: readonly LoopFlow[]; readonly nodes: readonly LoopNode[];
    readonly strips?: readonly { readonly title: string; readonly description: string; readonly groups: readonly { readonly title: string; readonly nodeIds: readonly string[]; }[]; }[];
    readonly places?: { readonly title: string; readonly description: string; readonly nodeIds: readonly string[]; };
    readonly statusLabels: Readonly<Record<LoopStatus, string>>;
    readonly kindOrder?: readonly string[]; readonly defaultStage?: string; readonly defaultFocus?: string;
};
export type LoopMapContext = {
    readonly kindLabel?: (kind: string) => string; readonly nodeHref?: (id: string) => string;
    readonly onEvidence?: () => void; readonly onDetails?: () => void;
};
export type LoopUI = {
    readonly model: LoopMap; readonly context: LoopMapContext; readonly byId: ReadonlyMap<string, LoopNode>;
    readonly openFocus: (id: string) => void;
};
