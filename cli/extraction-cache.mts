import { errorCode, object } from './types.mjs';
import type { SourceInput } from '../dist/index.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, GraphInputError } from '../dist/index.js';
import { atomic, cacheDirectory, digest } from './storage.mjs';

function implementationFingerprint() {
    const root = fileURLToPath(new URL('../dist/', import.meta.url));
    const sources: { path: string; hash: string; }[] = [];
    function visit(directory: string, prefix: string): void {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = prefix + entry.name;
            if (entry.isDirectory()) visit(join(directory, entry.name), path + '/');
            else if (entry.isFile() && path.endsWith('.js')) sources.push({ path, hash: digest(readFileSync(join(directory, entry.name), 'utf8')) });
        }
    }
    visit(root, '');
    sources.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
    const manifest: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return digest(canonicalJson({ sources, dependencies: object(manifest) ? manifest['dependencies'] ?? {} : {} }));
}
export function extractionCache(root: string, cacheDir?: string) {
    const implementation = implementationFingerprint();
    const stats = { mode: 'strict-content', files: 0, bytes: 0, parsed: 0, reused: 0, discarded: 0, implementation };
    const manifest: { schemaVersion: number; implementation: string; path: string; contentHash: string; format: string; selector: string; key: string; }[] = [];
    return {
        stats, manifest,
        extract<T>(input: SourceInput, selection: { readonly format: string; readonly selector: string; }, parse: () => T, decode: (value: unknown) => T): T {
            const identity = { schemaVersion: 1, implementation, path: input.path, contentHash: input.contentHash, ...selection };
            const key = digest(canonicalJson(identity));
            const path = join(cacheDirectory(root, cacheDir), 'extractions', `${key}.json`);
            stats.files++;
            stats.bytes += Buffer.byteLength(input.text, 'utf8');
            manifest.push({ ...identity, key });
            let text;
            try { text = readFileSync(path, 'utf8'); }
            catch (error) { if (errorCode(error) !== 'ENOENT') throw error; }
            if (text !== undefined) {
                let cached: unknown;
                try {
                    cached = JSON.parse(text);
                    if (object(cached) && cached['key'] === key && canonicalJson(cached['identity']) === canonicalJson(identity) && cached['valueHash'] === digest(canonicalJson(cached['value']))) {
                        const value = decode(cached['value']);
                        stats.reused++;
                        return value;
                    }
                } catch (error) {
                    if (!(error instanceof SyntaxError) && !(error instanceof GraphInputError)) throw error;
                }
                stats.discarded++;
            }
            stats.parsed++;
            const value = parse();
            atomic(path, { key, identity, valueHash: digest(canonicalJson(value)), value });
            return value;
        },
    };
}
