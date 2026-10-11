import type { Source } from '../core/model.js';

export type LogicDefinition = {
    readonly id: string;
    readonly name: string;
    readonly line: number;
    readonly endLine: number;
    readonly start: number;
    readonly end: number;
    readonly parent: string;
    readonly scopeStart: number;
    readonly scopeEnd: number;
    readonly owner: string;
    readonly static: boolean;
    readonly exported: boolean;
    readonly exportNames: readonly string[];
    readonly bindings: readonly string[];
    readonly annotations: readonly string[];
};
export type LogicImport = { readonly local: string; readonly imported: string; readonly specifier: string; readonly namespace: boolean; readonly exported?: boolean; readonly scopeStart: number; readonly scopeEnd: number; readonly line: number; };
export type LogicCall = { readonly caller: string; readonly name: string; readonly receiver: string; readonly line: number; readonly endLine: number; readonly start: number; readonly callbackIds: readonly string[]; readonly route: boolean; };
export type LogicDiagnostic = { readonly code: string; readonly path: string; readonly line: number; readonly message: string; };
export type LogicFacts = {
    readonly version: 1;
    readonly path: string;
    readonly language: string;
    readonly contentHash: string;
    readonly definitions: readonly LogicDefinition[];
    readonly imports: readonly LogicImport[];
    readonly calls: readonly LogicCall[];
    readonly topBindings: readonly string[];
    readonly classes: readonly { readonly name: string; readonly bases: readonly string[]; readonly annotations: readonly string[]; readonly line: number; }[];
    readonly diagnostics: readonly LogicDiagnostic[];
    readonly supported: boolean;
};
export type LogicEntry = { readonly category: string; readonly rule: string; readonly source: Source; };
