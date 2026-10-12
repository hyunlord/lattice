import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Parser, Language } from 'web-tree-sitter';
import { extractLogicFacts } from './logic-facts.mjs';
import type { SourceInput } from '../dist/adapters/types.js';
import type { LogicFacts } from '../dist/adapters/logic-types.js';

const require = createRequire(import.meta.url);
const names: Readonly<Record<string, string>> = { javascript: 'javascript', typescript: 'typescript', tsx: 'tsx', python: 'python', go: 'go', rust: 'rust', java: 'java', kotlin: 'kotlin', csharp: 'c_sharp' };
const languages = new Map<string, Language>();
let initialization: Promise<void> | undefined;
const grammarHash = createHash('sha256');
for (const grammar of Object.values(names).toSorted()) grammarHash.update(grammar).update(readFileSync(require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`)));
grammarHash.update(readFileSync(require.resolve('web-tree-sitter/tree-sitter.wasm')));
export const logicParserVersion = `web-tree-sitter@0.25.10/tree-sitter-wasms@0.1.13/logic-5/${grammarHash.digest('hex')}`;

export async function prepareLogicParser(requested: readonly string[] = Object.keys(names)): Promise<void> {
    initialization ??= Parser.init();
    await initialization;
    for (const name of new Set(requested.flatMap(name => name === 'typescript' ? [name, 'tsx'] : [name]))) {
        const grammar = names[name];
        if (!grammar || languages.has(name)) continue;
        languages.set(name, await Language.load(require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`)));
    }
}
export function parseLogicFacts(input: SourceInput, language: string): LogicFacts {
    const key = input.path.endsWith('.tsx') ? 'tsx' : language;
    if (!names[key]) return { version: 1, path: input.path, contentHash: input.contentHash, language, definitions: [], imports: [], calls: [], classes: [], topBindings: [], diagnostics: [], supported: false };
    const grammar = languages.get(key);
    if (!grammar) throw new Error(`Logic parser ${key} was not prepared`);
    const parser = new Parser();
    try {
        parser.setLanguage(grammar);
        const tree = parser.parse(input.text, null, { progressCallback: state => state.currentOffset > 10000000 });
        if (!tree) return { version: 1, path: input.path, contentHash: input.contentHash, language, definitions: [], imports: [], calls: [], classes: [], topBindings: [], diagnostics: [{ code: 'logic-parse-limit', path: input.path, line: 1, message: 'Parser did not complete within its input budget' }], supported: true };
        try { return extractLogicFacts(input, language, tree.rootNode); }
        finally { tree.delete(); }
    } finally { parser.delete(); }
}

await prepareLogicParser();
