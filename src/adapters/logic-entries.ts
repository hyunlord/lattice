import type { NodeDraft, Source } from '../core/model.js';
import type { SourceInput } from './types.js';
import type { LogicEntry, LogicFacts, LogicDefinition } from './logic-types.js';
const directory = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const join = (root: string, path: string): string => [root, path.replace(/^\.\//u, '')].filter(Boolean).join('/');
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const stringLeaves = (value: unknown): string[] => typeof value === 'string' ? [value] : object(value) ? Object.values(value).flatMap(stringLeaves) : [];
export function logicEntries(facts: readonly LogicFacts[], packages: readonly NodeDraft[], metadata: readonly SourceInput[], sourceFor: (fact: LogicFacts, line: number, endLine: number, pointer: string) => Source): ReadonlyMap<string, readonly LogicEntry[]> {
    const entries = new Map<string, LogicEntry[]>();
    const add = (definition: LogicDefinition, category: string, rule: string, source: Source) => {
        const values = entries.get(definition.id) ?? [];
        if (!values.some(item => item.category === category && item.rule === rule && item.source.path === source.path && item.source.line === source.line)) values.push({ category, rule, source });
        entries.set(definition.id, values);
    };
    for (const fact of facts) {
        for (const definition of fact.definitions) {
            const source = sourceFor(fact, definition.line, definition.endLine, `/logic/definitions/${definition.start}`);
            if (definition.name === 'main' && ['rust', 'go', 'kotlin', 'python'].includes(fact.language) && !definition.parent && !definition.owner) add(definition, 'executable', `${fact.language}-main-declaration`, source);
            if (['java', 'csharp'].includes(fact.language) && definition.static && ['main', 'Main'].includes(definition.name)) add(definition, 'executable', `${fact.language}-static-main`, source);
            const guard = definition.annotations.find(name => name.startsWith('python-main-guard@'));
            if (guard) { const line = Number(guard.split('@')[1]); add(definition, 'module-execution', 'python-main-guard', sourceFor(fact, line, line, '/logic/main-guard')); }
            if (definition.name === '<module>' && fact.language === 'python' && /(?:^|\/)__main__\.py$/u.test(fact.path)) add(definition, 'module-execution', 'python-main-module', source);
            if (definition.annotations.some(name => /(?:^|\.)(?:RequestMapping|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping)$/u.test(name))) add(definition, 'framework-callback', 'spring-route-annotation', source);
            if (definition.annotations.some(name => /\.(?:route|get|post|put|delete|patch)(?:\(|$)/u.test(name))) add(definition, 'route-handler', 'python-route-decorator', source);
            const owner = fact.classes.find(item => item.name === definition.owner);
            if (owner?.annotations.some(name => /(?:^|\.)SpringBootApplication$/u.test(name)) && definition.name === 'main' && definition.static) add(definition, 'framework-callback', 'spring-application-main', sourceFor(fact, owner.line, owner.line, '/logic/spring-application'));
            if (owner?.bases.some(base => ['Activity', 'ComponentActivity', 'AppCompatActivity', 'Application'].includes(base)) && ['onCreate', 'onStart', 'onResume'].includes(definition.name)) add(definition, 'framework-callback', 'android-lifecycle-override', source);
        }
        for (const call of fact.calls.filter(call => call.route)) for (const id of call.callbackIds) {
            const definition = fact.definitions.find(item => item.id === id);
            if (definition) add(definition, 'route-handler', 'static-route-callback-registration', sourceFor(fact, call.line, call.endLine, `/logic/calls/${call.start}`));
        }
    }
    for (const input of metadata) {
        const provenance = (needle: string): Source => ({ path: input.path, line: input.text.slice(0, Math.max(0, input.text.indexOf(needle))).split('\n').length, pointer: '/logic/entrypoints', contentHash: input.contentHash });
        if (input.path.split('/').at(-1) === 'package.json') {
            let value: unknown;
            try { value = JSON.parse(input.text); } catch (error) { if (error instanceof SyntaxError) continue; throw error; }
            if (!object(value)) continue;
            for (const [key, category] of [['bin', 'executable'], ['main', 'public-api'], ['exports', 'public-api']]) {
                if (!key || !category) continue;
                for (const path of stringLeaves(value[key])) {
                    const target = join(directory(input.path), path), fact = facts.find(item => item.path === target);
                    if (!fact) continue;
                    for (const definition of fact.definitions.filter(item => category === 'public-api' ? item.exported : item.name === '<module>' || item.name === 'main')) add(definition, category, `package-${key}`, provenance(path));
                }
            }
        }
        if (input.path.split('/').at(-1) === 'AndroidManifest.xml') {
            for (const match of input.text.matchAll(/<(application|activity)\b[^>]*\bandroid:name\s*=\s*["']([^"']+)["']/gu)) {
                const owner = match[2]?.split('.').at(-1) ?? '';
                const candidates = facts.filter(fact => ['java', 'kotlin'].includes(fact.language) && fact.classes.some(item => item.name === owner));
                if (candidates.length !== 1) continue;
                for (const fact of candidates) for (const definition of fact.definitions.filter(item => item.owner === owner && ['onCreate', 'onStart', 'onResume'].includes(item.name))) add(definition, 'framework-callback', 'android-manifest-component', provenance(match[0]));
            }
        }
        if (input.path.split('/').at(-1) === 'pyproject.toml') {
            let enabled = false;
            for (const [index, line] of input.text.split('\n').entries()) {
                if (/^\s*\[/u.test(line)) enabled = /^\s*\[(?:project\.scripts|project\.gui-scripts|tool\.poetry\.scripts)\]\s*$/u.test(line);
                if (!enabled) continue;
                const match = /^\s*[\w.-]+\s*=\s*["']([\w.]+):([\w.]+)["']/u.exec(line);
                if (!match) continue;
                const modulePath = match[1]?.replaceAll('.', '/') ?? '', name = match[2] ?? '';
                const candidates = new Set([join(directory(input.path), modulePath + '.py'), join(directory(input.path), 'src/' + modulePath + '.py')]);
                for (const fact of facts.filter(item => candidates.has(item.path))) for (const definition of fact.definitions.filter(item => item.name === name && !item.owner && !item.parent)) add(definition, 'executable', 'python-console-script', { ...provenance(line), line: index + 1 });
            }
        }
    }
    for (const pkg of packages) {
        const targets = pkg.attributes['entryTargets'];
        if (!Array.isArray(targets)) continue;
        for (const target of targets) {
            if (typeof target !== 'string') continue;
            const fact = facts.find(item => item.path === target);
            if (!fact) continue;
            for (const definition of fact.definitions.filter(item => item.exported && !item.parent)) {
                const source = pkg.sources[0];
                if (source && !entries.has(definition.id)) add(definition, 'public-api', 'manifest-public-target', source);
            }
        }
    }
    return entries;
}
