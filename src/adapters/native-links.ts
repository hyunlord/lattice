import type { CodeModule, ModuleImport } from "./code.js";

export type NativeMatches = { readonly paths: readonly string[]; readonly multiple: boolean; readonly packageName?: string; };
function strings(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function csharpResolver(modules: readonly CodeModule[]): (reference: ModuleImport) => NativeMatches {
    const namespaces = new Map<string, CodeModule[]>(), types = new Map<string, CodeModule[]>(), order = new Map<CodeModule, number>();
    const declared = new Map<CodeModule, ReadonlySet<string>>(), cache = new Map<string, NativeMatches>();
    const add = (map: Map<string, CodeModule[]>, name: string, module: CodeModule): void => { const bucket = map.get(name); if (bucket) bucket.push(module); else map.set(name, [module]); };
    modules.forEach((module, index) => {
        if (module.language !== "csharp") return;
        order.set(module, index);
        const names = new Set(strings(module.node.attributes["namespaces"])); declared.set(module, names);
        for (const name of names) add(namespaces, name, module);
        for (const name of new Set(strings(module.node.attributes["declaredTypes"]))) add(types, name, module);
    });
    return reference => {
        const target = reference.specifier.replace(/^global::/u, "");
        const scopes = reference.specifier.startsWith("global::") ? [] : (reference.scope ?? "").split(".").filter(Boolean);
        for (let size = scopes.length; size >= 0; size--) {
            const name = [...scopes.slice(0, size), target].join("."), key = JSON.stringify([name, reference.form]);
            let result = cache.get(key);
            if (!result) {
                const matches = [...new Set([...(reference.form === "type" ? [] : namespaces.get(name) ?? []), ...(reference.form === "namespace" ? [] : types.get(name) ?? [])])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
                const multiple = matches.length > 0 && matches.every(module => declared.get(module)?.has(name));
                result = { paths: matches.flatMap(module => module.node.sources[0] ? [module.node.sources[0].path] : []), multiple, ...(multiple ? { packageName: name } : {}) };
                cache.set(key, result);
            }
            if (result.paths.length) return result;
        }
        return { paths: [], multiple: false };
    };
}
export function csharpMatches(modules: readonly CodeModule[], reference: ModuleImport): NativeMatches { return csharpResolver(modules)(reference); }
function rustRoot(path: string, modules: readonly CodeModule[], roots: Map<string, string>): string {
    const cached = roots.get(path);
    if (cached !== undefined) return cached;
    const directories = modules.flatMap(module => {
        const path = module.node.sources[0]?.path ?? "";
        return /(?:^|\/)(?:lib|main)\.rs$/u.test(path) ? [path.slice(0, path.lastIndexOf("/") + 1)] : [];
    }).filter(root => path.startsWith(root)).sort((a, b) => b.length - a.length);
    const root = directories[0] ?? path.slice(0, path.lastIndexOf("/") + 1);
    roots.set(path, root);
    return root;
}
function modulePath(path: string, root: string): readonly string[] {
    const parts = path.slice(root.length).replace(/\.rs$/u, "").split("/");
    if (["lib", "main", "mod"].includes(parts.at(-1) ?? "")) parts.pop();
    return parts;
}
function rustMatches(module: CodeModule, modules: readonly CodeModule[], reference: ModuleImport, roots: Map<string, string>): NativeMatches {
    if (reference.form === "mod-path") return { paths: [], multiple: false };
    const file = module.node.sources[0]?.path ?? "";
    const root = rustRoot(file, modules, roots);
    const current = [...modulePath(file, root), ...(reference.scope ?? "").split("::").filter(Boolean)];
    const requested = reference.specifier.split("::").filter(Boolean);
    let path: string[];
    if (reference.form === "mod") path = [...current, ...requested];
    else if (requested[0] === "crate") path = requested.slice(1);
    else if (requested[0] === "self") path = [...current, ...requested.slice(1)];
    else if (requested[0] === "super") {
        let count = 0;
        while (requested[count] === "super") count++;
        if (count > current.length) return { paths: [], multiple: false };
        path = [...current.slice(0, current.length - count), ...requested.slice(count)];
    } else path = requested;
    const local = modules.filter(candidate => candidate.language === "rust" && rustRoot(candidate.node.sources[0]?.path ?? "", modules, roots) === root);
    const declared = new Set(local.flatMap(candidate => {
        const base = modulePath(candidate.node.sources[0]?.path ?? "", root);
        return strings(candidate.node.attributes["declaredModules"]).map(name => [...base, name].join("::"));
    }));
    for (let size = path.length; size > 0; size--) {
        const name = path.slice(0, size).join("::");
        if (reference.form === "mod" && size !== path.length) break;
        if (!path.slice(0, size).every((_, index) => declared.has(path.slice(0, index + 1).join("::")))) continue;
        const matches = local.filter(candidate => {
            const base = modulePath(candidate.node.sources[0]?.path ?? "", root);
            return base.join("::") === name || strings(candidate.node.attributes["inlineModules"]).some(inline => [...base, inline].filter(Boolean).join("::") === name);
        });
        if (matches.length) return { paths: matches.flatMap(candidate => candidate.node.sources[0] ? [candidate.node.sources[0].path] : []), multiple: false };
        if (reference.form === "mod") break;
    }
    if (reference.form !== "mod") {
        const roots = local.filter(candidate => modulePath(candidate.node.sources[0]?.path ?? "", root).length === 0 && (
            path.length === 0 || strings(candidate.node.attributes["declaredItems"]).includes(path.join("::"))
        ));
        return { paths: roots.flatMap(candidate => candidate.node.sources[0] ? [candidate.node.sources[0].path] : []), multiple: false };
    }
    return { paths: [], multiple: false };
}

export function nativeResolver(modules: readonly CodeModule[]): (module: CodeModule, reference: ModuleImport) => NativeMatches | undefined {
    const roots = new Map<string, string>();
    const csharp = csharpResolver(modules);
    return (module, reference) => module.language === "csharp" ? csharp(reference) : module.language === "rust" ? rustMatches(module, modules, reference, roots) : undefined;
}
