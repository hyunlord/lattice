import { typeScriptPathsResolver } from "./tsconfig-links.js";
import { selfPackageResolver } from "./self-package-links.js";
import type { ExtractedRecord } from "./types.js";
import { canonicalJson } from "../core/canonical.js";
import type { Edge, NodeDraft, Source } from "../core/model.js";
import { languageMatches } from "./language-links.js";
import { packageNode, packageMembership } from "./package-links.js";
import { nativeResolver } from "./native-links.js";
import { codeLanguage } from "./code.js";
import type { CodeModule, ModuleImport } from "./code.js";

export type ModuleDiagnostic = { readonly code: "external-or-unresolved-module" | "unresolved-local-module" | "ambiguous-module" | "unresolved-configuration"; readonly specifier: string; readonly source: Source; readonly reason?: string; readonly evidence?: readonly Source[]; };
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
export function resolveModuleLinks(modules: readonly CodeModule[], metadata: readonly ExtractedRecord[] = []): { readonly nodes: readonly NodeDraft[]; readonly membershipEdges: readonly Edge[]; readonly edges: readonly Edge[]; readonly diagnostics: readonly ModuleDiagnostic[]; } {
    const nativeMatches = nativeResolver(modules);
    const selfPackage = selfPackageResolver(modules, metadata);
    const configuredPaths = typeScriptPathsResolver(modules, metadata);
    const paths = new Map(modules.map(module => [module.node.sources[0]?.path, module.node.id]));
    const edges: Edge[] = [];
    const packages = new Map<string, NodeDraft>();
    const byPath = new Map(modules.map(module => [module.node.sources[0]?.path, module]));
    const diagnostics: ModuleDiagnostic[] = [];
    for (const module of modules) {
        for (const reference of module.imports) {
            const native = nativeMatches(module, reference) ?? languageMatches(module, modules, reference);
            const configured = configuredPaths(module, reference);
            const self = configured ?? selfPackage(module, reference);
            const possible = self ? [self.paths] : native ? [native.paths] : candidates(module, reference);
            const matches = possible.map(group => [...new Set(group.filter(path => paths.has(path)))]).find(group => group.length > 0) ?? [];
            if (matches.length === 1 || (matches.length > 1 && native?.multiple)) {
                const group = native?.packageName === undefined ? undefined : packageNode(module.language === "kotlin" ? "jvm" : module.language === "java" ? "jvm" : module.language, native.packageName, matches.flatMap(path => { const member = byPath.get(path); return member ? [member] : []; }));
                if (group) packages.set(group.id, group);
                for (const target of group ? [group.id] : matches.map(path => paths.get(path))) {
                    if (target === undefined) continue;
                    edges.push({ id: `import:${canonicalJson([module.node.id, target, reference.source.pointer])}`, kind: "imports", source: module.node.id, target, directed: true, field: reference.source.pointer, sources: [reference.source, ...(self?.sources ?? [])], attributes: { specifier: reference.specifier, ...(reference.importScope ? { importScope: reference.importScope } : {}), ...(reference.form ? { importForm: reference.form } : {}), ...(reference.member ? { member: reference.member } : {}) } });
                }
            } else diagnostics.push({ code: configured?.diagnosticCode ?? (matches.length > 1 ? "ambiguous-module" : (self !== undefined || reference.specifier.startsWith(".") || reference.form?.startsWith("mod") || reference.form === "script-path" || /^(?:crate|self|super)::/u.test(reference.specifier)) ? "unresolved-local-module" : "external-or-unresolved-module"), specifier: reference.specifier, source: reference.source, ...(self ? { reason: self.reason, evidence: self.sources } : {}) });
        }
    }
    const nodes = [...packages.values()].sort((a, b) => a.id.localeCompare(b.id));
    return { nodes, membershipEdges: nodes.flatMap(packageMembership), edges, diagnostics };
}
