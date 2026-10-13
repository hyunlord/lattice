import { extractPackageDescription } from '../dist/index.js';
import { workingRepository, InputSizeError } from './repository.mjs';
import { inInputScope } from './inputs.mjs';
import { digest } from './storage.mjs';
import { object } from './types.mjs';
import type { Options } from './types.mjs';

export interface OpenInventory {
    readonly name: string;
    readonly files: number;
    readonly source: 'working-tree';
    readonly paths: readonly string[];
    readonly manifests: readonly { readonly path: string; readonly excerpt: string; readonly contentHash: string; }[];
    readonly description?: { readonly path: string; readonly text: string; readonly contentHash: string; };
}
export interface OpenProgress {
    readonly phase: 'starting' | 'clone' | 'inventory' | 'observe' | 'extract' | 'resolve' | 'export' | 'complete';
    readonly detail?: string;
    readonly inventory?: OpenInventory;
}
export function openInventory(options: Options): OpenInventory {
    const repository = workingRepository(options.root, options.cacheDir, options.readOnlySource ? 'inventory' : false);
    const paths = repository.paths.filter(path => inInputScope(path));
    const manifests = paths.filter(path => /(?:^|\/)(?:package\.json|Cargo\.toml|go\.mod|pyproject\.toml|pom\.xml|build\.gradle(?:\.kts)?|[^/]+\.csproj)$/u.test(path)).slice(0, 16).flatMap(path => {
        try { const text = repository.readText(path); return text === undefined ? [] : [{ path, excerpt: text.slice(0, 1200), contentHash: digest(text) }]; }
        catch (error) { if (error instanceof InputSizeError) return []; throw error; }
    });
    const rootManifest = manifests.find(manifest => !manifest.path.includes('/'));
    let description: OpenInventory['description'];
    if (rootManifest) {
        const text = repository.readText(rootManifest.path);
        const node = text === undefined ? undefined : extractPackageDescription({ path: rootManifest.path, text, contentHash: rootManifest.contentHash });
        const source = node?.attributes['sourceDescription'];
        if (object(source) && typeof source['text'] === 'string') description = { path: rootManifest.path, text: source['text'], contentHash: rootManifest.contentHash };
    }
    if (!description) {
        const path = paths.find(path => /^readme(?:\.md|\.rst|\.markdown)?$/iu.test(path));
        if (path) {
            try { const text = repository.readText(path); if (text) description = { path, text: text.slice(0, 1200), contentHash: digest(text) }; }
            catch (error) { if (!(error instanceof InputSizeError)) throw error; }
        }
    }
    return { name: repository.name, files: paths.length, source: 'working-tree', paths: paths.slice(0, 80), manifests, ...(description ? { description } : {}) };
}
