import type { CodeModule } from '../dist/adapters/code.js';
import type { JsonObject, SourceInput } from '../dist/index.js';
import { declarationTokens } from '../dist/adapters/code-declarations.js';

type Candidate = { readonly path: string; readonly definition: JsonObject; count: number; };
function definition(value: unknown): value is JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Counts lexical name mentions, not compiler-resolved type uses. */
export function publicTypeUsage(modules: readonly CodeModule[], inputs: readonly SourceInput[]): readonly CodeModule[] {
    const languages = new Map<string, Map<string, Candidate | null>>();
    for (const module of modules) {
        const path = module.node.sources[0]?.path, definitions = module.node.attributes['definitions'];
        if (!path || !Array.isArray(definitions)) continue;
        let names = languages.get(module.language);
        if (!names) { names = new Map(); languages.set(module.language, names); }
        for (const value of definitions) {
            if (!definition(value) || value['kind'] !== 'type' || value['public'] !== true || typeof value['name'] !== 'string') continue;
            const name = value['name'];
            names.set(name, names.has(name) ? null : { path, definition: value, count: 0 });
        }
    }
    const sources = new Map(inputs.map(input => [input.path, input]));
    const visited = new Set<string>();
    for (const module of modules) {
        const path = module.node.sources[0]?.path, names = languages.get(module.language);
        const input = path ? sources.get(path) : undefined;
        if (!path || !input || !names?.size || visited.has(path)) continue;
        visited.add(path);
        const seen = new Set<Candidate>();
        for (const token of declarationTokens(input.text, module.language)) {
            if (token.kind !== 'word') continue;
            const candidate = names.get(token.value);
            if (candidate && candidate.path !== path) seen.add(candidate);
        }
        for (const candidate of seen) candidate.count++;
    }
    return modules.map(module => {
        const definitions = module.node.attributes['definitions'], names = languages.get(module.language);
        if (!Array.isArray(definitions) || !names?.size) return module;
        return {
            ...module, node: {
                ...module.node, attributes: {
                    ...module.node.attributes, definitions: definitions.map(value => {
                        if (!definition(value) || typeof value['name'] !== 'string') return value;
                        const candidate = names.get(value['name']);
                        return candidate?.definition === value ? { ...value, mentionFiles: candidate.count, usageBasis: 'distinct-other-files-lexical' } : value;
                    })
                }
            }
        };
    });
}
