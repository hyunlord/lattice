import { canonicalJson } from "../core/canonical.js";
import type { Edge, Source } from "../core/model.js";
import { codeLanguage } from "./code.js";
import type { CodeModule, ModuleImport } from "./code.js";

export type ModuleDiagnostic = { readonly code: "external-or-unresolved-module" | "unresolved-local-module" | "ambiguous-module"; readonly specifier: string; readonly source: Source; };
function normalize(path: string): string | undefined {
    const parts: string[] = [];
    for (const part of path.split("/")) {
        if (part === "." || part === "") continue;
        if (part === "..") { if (parts.length === 0) return undefined; parts.pop(); }
        else parts.push(part);
    }
    return parts.join("/");
}
function candidates(module: CodeModule, reference: ModuleImport): readonly (readonly string[])[] {
    const directory = module.node.sources[0]?.path.split("/").slice(0, -1).join("/") ?? "";
    if (module.language === "python") {
        const dots = /^\.+/u.exec(reference.specifier)?.[0].length ?? 0;
        const suffix = reference.specifier.slice(dots).replaceAll(".", "/");
        const roots = dots ? [normalize(`${directory}/${"../".repeat(dots - 1)}${suffix}`)] : [suffix, `src/${suffix}`];
        const localRoots = roots.filter((root): root is string => root !== undefined);
        const members = reference.member && reference.member !== "*" ? localRoots.flatMap(root => {
            const prefix = root ? root + "/" : "";
            return [`${prefix}${reference.member}.py`, `${prefix}${reference.member}/__init__.py`];
        }) : [];
        return [members, localRoots.flatMap(root => [`${root}.py`, `${root ? root + "/" : ""}__init__.py`])];
    }
    if (!reference.specifier.startsWith(".")) return [];
    const path = normalize(`${directory}/${reference.specifier}`);
    if (path === undefined) return [];
    if (/\.[mc]?js$/u.test(path)) {
        const replacement = path.endsWith(".mjs") ? ".mts" : path.endsWith(".cjs") ? ".cts" : ".ts";
        return [[path], [path.replace(/\.[mc]?js$/u, replacement), ...(path.endsWith(".js") ? [path.slice(0, -3) + ".tsx"] : [])]];
    }
    if (codeLanguage(path) !== undefined) return [[path]];
    return [[path], ["ts", "tsx", "js", "jsx", "mts", "mjs", "cts", "cjs"].flatMap(extension => [`${path}.${extension}`, `${path}/index.${extension}`])];
}
export function resolveModuleLinks(modules: readonly CodeModule[]): { readonly edges: readonly Edge[]; readonly diagnostics: readonly ModuleDiagnostic[]; } {
    const paths = new Map(modules.map(module => [module.node.sources[0]?.path, module.node.id]));
    const edges: Edge[] = [];
    const diagnostics: ModuleDiagnostic[] = [];
    for (const module of modules) {
        for (const reference of module.imports) {
            const possible = candidates(module, reference);
            const matches = possible.map(group => [...new Set(group.filter(path => paths.has(path)))]).find(group => group.length > 0) ?? [];
            const target = matches[0] === undefined ? undefined : paths.get(matches[0]);
            if (matches.length === 1 && target !== undefined) {
                edges.push({ id: `import:${canonicalJson([module.node.id, target, reference.source.pointer])}`, kind: "imports", source: module.node.id, target, directed: true, field: reference.source.pointer, sources: [reference.source], attributes: { specifier: reference.specifier, ...(reference.member ? { member: reference.member } : {}) } });
            } else diagnostics.push({ code: matches.length > 1 ? "ambiguous-module" : reference.specifier.startsWith(".") ? "unresolved-local-module" : "external-or-unresolved-module", specifier: reference.specifier, source: reference.source });
        }
    }
    return { edges, diagnostics };
}
