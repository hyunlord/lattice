import type { NodeDraft } from '../core/model.js';
import type { CodeModule } from './code.js';
import type { LogicCall, LogicDefinition, LogicFacts, LogicImport } from './logic-types.js';

type Definition = { readonly fact: LogicFacts; readonly definition: LogicDefinition; };
const strings = (value: unknown): readonly string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const directory = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
function normalized(path: string): string | undefined {
    const parts: string[] = [];
    for (const item of path.split('/')) { if (!item || item === '.') continue; if (item === '..') { if (!parts.length) return undefined; parts.pop(); } else parts.push(item); }
    return parts.join('/');
}
export function logicResolver(facts: readonly LogicFacts[], modules: readonly CodeModule[], packages: readonly NodeDraft[]) {
    const byPath = new Map(facts.map(fact => [fact.path, fact]));
    const byId = new Map(facts.flatMap(fact => fact.definitions.map(definition => [definition.id, { fact, definition }] as const)));
    const byModule = new Map(modules.map(module => [module.node.sources[0]?.path, module]));
    const byName = new Map<string, Definition[]>();
    for (const item of byId.values()) { const key = item.fact.path + '\0' + item.definition.name; byName.set(key, [...(byName.get(key) ?? []), item]); }
    const namespacesByPath = new Map(facts.filter(fact => fact.language === 'csharp').map(fact => [fact.path, strings(byModule.get(fact.path)?.node.attributes['namespaces'])]));
    const staticByNamespace = new Map<string, Definition[]>();
    for (const item of byId.values()) {
        if (!item.definition.static) continue;
        for (const namespace of new Set(namespacesByPath.get(item.fact.path) ?? [])) {
            const key = namespace + '\0' + item.definition.owner + '\0' + item.definition.name;
            const existing = staticByNamespace.get(key);
            if (existing) existing.push(item); else staticByNamespace.set(key, [item]);
        }
    }
    const named = (fact: LogicFacts, name: string): Definition[] => byName.get(fact.path + '\0' + name) ?? [];
    const unique = (items: readonly Definition[]): Definition | undefined => items.length === 1 ? items[0] : undefined;
    const imports = (fact: LogicFacts, binding: LogicImport): LogicFacts[] => {
        const specifier = binding.specifier, paths = new Set<string>();
        const add = (path: string) => { const clean = normalized(path); if (clean && byPath.has(clean)) paths.add(clean); };
        if (specifier.startsWith('.') && fact.language !== 'python') {
            const path = `${directory(fact.path)}/${specifier}`;
            add(path);
            for (const ext of ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts']) { add(`${path}.${ext}`); add(`${path}/index.${ext}`); if (/\.[mc]?js$/u.test(path)) add(path.replace(/\.[mc]?js$/u, '.' + ext)); }
        }
        if (fact.language === 'python') {
            const dots = /^\.+/u.exec(specifier)?.[0].length ?? 0;
            const suffix = specifier.slice(dots).replaceAll('.', '/');
            const roots = dots ? [`${directory(fact.path)}/${'../'.repeat(dots - 1)}${suffix}`] : [suffix, `src/${suffix}`];
            for (const root of roots) { add(root + '.py'); add(root + '/__init__.py'); }
        }
        if (fact.language === 'go') {
            const owner = packages.find(pkg => strings(pkg.attributes['memberIds']).includes(`module:${fact.path}`));
            const name = owner?.attributes['packageName'], root = owner?.attributes['root'];
            if (typeof name === 'string' && typeof root === 'string' && (specifier === name || specifier.startsWith(name + '/'))) {
                const target = normalized(`${root}/${specifier.slice(name.length)}`) ?? '';
                for (const other of facts) if (other.language === 'go' && directory(other.path) === target) add(other.path);
            }
        }
        if (fact.language === 'rust') {
            if (specifier.startsWith('self::') || specifier.startsWith('super::')) {
                const parts = specifier.split('::');
                let root = directory(fact.path);
                if (!/(?:^|\/)(?:lib|main|mod)\.rs$/u.test(fact.path)) root = fact.path.replace(/\.rs$/u, '');
                if (parts[0] === 'super') root = directory(root);
                const suffix = parts.slice(1).join('/'); add(`${root}/${suffix}.rs`); add(`${root}/${suffix}/mod.rs`);
            }
            const owner = packages.find(pkg => strings(pkg.attributes['memberIds']).includes(`module:${fact.path}`));
            const roots = specifier.startsWith('crate') && typeof owner?.attributes['root'] === 'string' ? [owner] : packages.filter(pkg => strings(pkg.attributes['importNames']).includes(specifier.split('::')[0] ?? '') || pkg.attributes['packageName'] === specifier.split('::')[0]);
            for (const pkg of roots) {
                const root = pkg?.attributes['root']; if (typeof root !== 'string') continue;
                const suffix = specifier.split('::').slice(1).join('/');
                const entries = strings(pkg.attributes['entryTargets']).filter(path => path.endsWith('.rs') && byPath.has(path));
                const sourceRoots = entries.length ? [...new Set(entries.map(directory))] : [`${root}/src`];
                if (suffix) for (const sourceRoot of sourceRoots) { add(`${sourceRoot}/${suffix}.rs`); add(`${sourceRoot}/${suffix}/mod.rs`); }
                else if (entries.length) for (const entry of entries) add(entry);
                else { add(`${root}/src/lib.rs`); add(`${root}/src/main.rs`); }
            }
        }
        for (const pkg of packages) {
            const name = pkg.attributes['packageName'];
            if (typeof name !== 'string' || !['javascript', 'typescript'].includes(fact.language) || name !== specifier) continue;
            for (const target of strings(pkg.attributes['entryTargets'])) add(target);
            if (!paths.size) for (const root of strings(pkg.attributes['sourceRoots'])) { add(`${root}/index.ts`); add(`${root}/index.js`); }
        }
        if (['java', 'kotlin'].includes(fact.language)) for (const other of facts) if (['java', 'kotlin'].includes(other.language) && byModule.get(other.path)?.node.attributes['package'] === specifier) add(other.path);
        return [...paths].flatMap(path => { const target = byPath.get(path); return target ? [target] : []; });
    };
    const exportedDefinitions = (fact: LogicFacts, name: string, visited = new Set<string>()): Definition[] => {
        const key = fact.path + '\0' + name;
        if (visited.has(key) || visited.size >= 64) return [];
        const next = new Set(visited).add(key);
        const direct = fact.definitions.filter(definition => definition.exportNames.includes(name) && !definition.owner && !definition.parent).map(definition => ({ fact, definition }));
        if (fact.language !== 'rust') return direct;
        return [...new Map([...direct, ...fact.imports.filter(binding => binding.exported && binding.local === name).flatMap(binding => imports(fact, binding).flatMap(target => exportedDefinitions(target, binding.imported, next)))].map(item => [item.definition.id, item])).values()];
    };
    const shadowed = (fact: LogicFacts, caller: LogicDefinition, name: string): boolean => {
        let cursor: LogicDefinition | undefined = caller;
        while (cursor) { if (cursor.bindings.includes(name)) return true; cursor = byId.get(cursor.parent)?.definition; }
        return fact.topBindings.includes(name);
    };
    return (fact: LogicFacts, call: LogicCall): Definition | undefined => {
        const caller = byId.get(call.caller)?.definition;
        if (!caller || !call.name) return undefined;
        if (shadowed(fact, caller, call.receiver || call.name) || call.receiver && shadowed(fact, caller, `${call.receiver}.${call.name}`)) return undefined;
        const inScope = (binding: LogicImport): boolean => binding.scopeStart <= call.start && call.start < binding.scopeEnd;
        if (!call.receiver) {
            let scope = caller.id;
            while (true) {
                const matches = named(fact, call.name).filter(item => item.definition.parent === scope && item.definition.scopeStart <= call.start && call.start < item.definition.scopeEnd && (!item.definition.owner || ['java', 'csharp', 'kotlin'].includes(fact.language) && item.definition.owner === caller.owner && (!caller.static || item.definition.static)));
                if (matches.length) return unique(matches);
                const current = byId.get(scope)?.definition;
                if (!current || !scope) break;
                scope = current.parent;
            }
            const ownerMatches = named(fact, call.name).filter(item => item.definition.owner && item.definition.owner === caller.owner && ['java', 'csharp', 'kotlin'].includes(fact.language) && (!caller.static || item.definition.static));
            if (ownerMatches.length) return unique(ownerMatches);
            const binding = fact.imports.filter(item => item.local === call.name && inScope(item) && (!item.namespace || item.imported === 'default'));
            if (binding.length === 1 && binding[0]) return unique(imports(fact, binding[0]).flatMap(target => exportedDefinitions(target, binding[0]?.imported ?? '')));
            if (fact.language === 'go') return unique(facts.filter(other => other.language === 'go' && directory(other.path) === directory(fact.path) && byModule.get(other.path)?.node.attributes['package'] === byModule.get(fact.path)?.node.attributes['package']).flatMap(other => named(other, call.name).filter(item => !item.definition.owner && !item.definition.parent)));
            return undefined;
        }
        const binding = fact.imports.filter(item => item.local === call.receiver && item.namespace && inScope(item));
        if (binding.length === 1 && binding[0]) return unique(imports(fact, binding[0]).flatMap(target => exportedDefinitions(target, call.name)));
        if (fact.language === 'rust') {
            const targetFiles = imports(fact, { local: call.receiver, imported: '*', specifier: call.receiver, namespace: true, scopeStart: 0, scopeEnd: Number.MAX_SAFE_INTEGER, line: call.line });
            const targets = targetFiles.flatMap(target => exportedDefinitions(target, call.name));
            if (targets.length) return unique(targets);
        }
        const importedClass = fact.imports.filter(item => item.local === call.receiver && !item.namespace && inScope(item));
        if (importedClass.length === 1 && importedClass[0]) {
            const binding = importedClass[0];
            const targets = imports(fact, binding).flatMap(target => named(target, call.name).filter(item => item.definition.owner === binding.imported && item.definition.static));
            if (targets.length) return unique(targets);
        }
        if (fact.language === 'csharp') {
            const targets = [...new Set((namespacesByPath.get(fact.path) ?? []).flatMap(namespace => staticByNamespace.get(namespace + '\0' + call.receiver + '\0' + call.name) ?? []))];
            if (targets.length) return unique(targets);
        }
        const classes = fact.classes.filter(item => item.name === call.receiver);
        if (classes.length === 1) return unique(named(fact, call.name).filter(item => item.definition.owner === call.receiver && item.definition.static));
        return undefined;
    };
}
