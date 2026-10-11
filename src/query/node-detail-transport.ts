import type { Repository } from '../core/model.js';
export type DetailRef = { readonly parts: readonly { readonly path: string; readonly key: string; }[]; };
export type DetailPages = { readonly total: number; readonly pages: readonly DetailRef[]; };
export type DetailBinding = { readonly schemaVersion: 1; readonly graphHash: string; readonly repository: Repository; };
export type DetailIndex = DetailBinding & { readonly lookupRoot: string; readonly pageSize: 20; readonly nodeCount: number; };
export type DetailLookup = DetailBinding & { readonly ranges: readonly { readonly first: string; readonly last: string; readonly ref: DetailRef; }[]; };
export type DetailRecord = {
    readonly graph: unknown;
    readonly facets: DetailPages;
    readonly findings: DetailPages;
    readonly relations: { readonly incoming: DetailPages; readonly outgoing: DetailPages; readonly undirected: DetailPages; };
};
export type DetailCollection = { readonly graph: unknown; readonly findingRefs?: readonly DetailRef[]; };
export type DetailPacket = DetailBinding & { readonly records: Readonly<Record<string, string>>; };
/** Keys are tagged to distinguish literal node IDs from cross-snapshot identities. */
export function detailIdKey(id: string): string { return `id:${id}`; }
export function detailIdentityKey(identity: string): string { return `identity:${identity}`; }
