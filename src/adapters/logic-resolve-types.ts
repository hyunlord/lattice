import type { LogicCall, LogicFacts, LogicImport } from './logic-types.js';

type Owner = { readonly fact: LogicFacts; readonly name: string; };
type Imports = (fact: LogicFacts, binding: LogicImport) => readonly LogicFacts[];

export function rustReceiverTypes(fact: LogicFacts, type: string, call: LogicCall, imports: Imports): readonly Owner[] {
    const binding = (specifier: string): LogicImport => ({ local: '', imported: '*', namespace: true, specifier, scopeStart: 0, scopeEnd: Number.MAX_SAFE_INTEGER, line: call.line });
    const files = (source: LogicFacts, path: string, visited = new Set<string>()): readonly LogicFacts[] => {
        const key = source.path + '\0' + path;
        if (visited.has(key) || visited.size >= 32) return [];
        const next = new Set(visited).add(key), direct = imports(source, binding(path));
        if (direct.length) return direct;
        const parts = path.split('::'), first = parts.shift() ?? '';
        if (!parts.length) return [];
        const roots = imports(source, binding(first));
        return roots.flatMap(root => {
            const local = parts[0], rest = parts.slice(1);
            return root.imports.filter(item => item.exported && item.namespace && item.local === local).flatMap(item => {
                const suffix = [item.specifier, ...rest].join('::');
                return files(root, suffix, next);
            });
        });
    };
    const named = (source: LogicFacts, name: string, visited = new Set<string>()): readonly Owner[] => {
        const key = source.path + '\0' + name;
        if (visited.has(key) || visited.size >= 32) return [];
        const next = new Set(visited).add(key);
        if (source.classes.some(item => item.name === name)) return [{ fact: source, name }];
        return source.imports.filter(item => item.exported && item.local === name && !item.namespace).flatMap(item => imports(source, item).flatMap(target => named(target, item.imported, next)));
    };
    const parts = type.split('::'), name = parts.pop() ?? '';
    const owners = parts.length ? files(fact, parts.join('::')).flatMap(source => named(source, name)) : fact.imports.filter(item => item.local === name && !item.namespace && item.scopeStart <= call.start && call.start < item.scopeEnd).flatMap(item => imports(fact, item).flatMap(source => named(source, item.imported)));
    return [...new Map(owners.map(owner => [owner.fact.path + '\0' + owner.name, owner])).values()];
}
