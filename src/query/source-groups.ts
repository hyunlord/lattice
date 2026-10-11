import type { Source } from "../core/model.js";
export type DeferredSourceGroup = { readonly id: string; readonly count: number; readonly pages: readonly string[]; };
const groups = new WeakMap<readonly Source[], readonly DeferredSourceGroup[]>();
export function deferredSources(sources: readonly Source[]): readonly DeferredSourceGroup[] { return groups.get(sources) ?? []; }
export function registerSourceGroups(sources: readonly Source[], references: readonly DeferredSourceGroup[]): void { groups.set(sources, references); }
export function sourceCount(sources: readonly Source[]): number { return sources.length + deferredSources(sources).reduce((sum, group) => sum + group.count, 0); }
export function mergeSourceGroups(collections: readonly (readonly Source[])[]): Source[] {
    const sources = [...new Map(collections.flatMap(collection => collection).map(source => [JSON.stringify(source), source])).values()];
    const references = [...new Map(collections.flatMap(deferredSources).map(group => [group.id, group])).values()];
    if (references.length) registerSourceGroups(sources, references);
    return sources;
}
