import type { LensKind, Source, SourceInput } from '../dist/index.js';
export interface Options {
    root: string;
    lens?: string | undefined;
    output?: string | undefined;
    cacheDir?: string | undefined;
    port?: string | undefined;
    viewerUrl?: string | undefined;
    json?: boolean;
    noGlobal?: boolean;
    noLens?: boolean;
    force?: boolean;
}
export interface RepositoryReader {
    readonly name: string;
    readonly remoteUrl?: string;
    readonly commit?: string;
    readonly dirty: boolean;
    readonly paths: readonly string[];
    prepare?(paths: readonly string[]): void;
    readText(path: string): string | undefined;
}
export interface Selection {
    readonly path: string;
    readonly kind: LensKind | undefined;
    readonly format: string;
}
export type SelectedInput = Selection & { readonly input: SourceInput; };
export type SourceLink = (source: Source) => Source;
export function errorCode(error: unknown): unknown {
    return error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
export function errorStatus(error: unknown): unknown {
    return error !== null && typeof error === 'object' && 'status' in error ? error.status : undefined;
}
export function object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
