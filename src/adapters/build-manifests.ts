import type { Edge, NodeDraft } from "../core/model.js";
import type { SourceInput } from "./types.js";
import type { CodeModule } from "./code.js";
import { makeSource, validateSourceInput } from "./types.js";
import { cargoPackages } from "./manifest-cargo.js";
import { gradlePackages } from "./manifest-gradle.js";
import { dotnetPackages, mavenPackages } from "./manifest-dotnet.js";
import { scriptPackages } from "./manifest-scripts.js";
import { workspaceMembership } from "./manifest-workspaces.js";
import { packageOwner } from "./package-ownership.js";
import { directory, object, strings } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestPackage } from "./manifest-types.js";
export type { BuildManifestDiagnostic } from "./manifest-types.js";
export function buildManifestPath(path: string): boolean {
    return /(?:^|\/)(?:Cargo\.toml|global\.json|[^/]+\.versions\.toml|package\.json|pyproject\.toml|go\.mod|pom\.xml|settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|project\.godot|[^/]+\.(?:csproj|fsproj|vbproj|vcxproj|ilproj|proj|props|targets|asmdef|asmdef\.meta))$/u.test(path);
}
function packageId(pkg: ManifestPackage): string { return `build-package:${pkg.input.path}${pkg.system === "gradle" && /settings\.gradle/u.test(pkg.input.path) ? `:${pkg.name}` : ""}`; }
export function discoverBuildPackages(inputs: readonly SourceInput[], modules: readonly NodeDraft[]): { readonly nodes: readonly NodeDraft[]; readonly edges: readonly Edge[]; readonly diagnostics: readonly BuildManifestDiagnostic[]; } {
    const selected = inputs.filter(input => buildManifestPath(input.path)).sort((a, b) => a.path.localeCompare(b.path));
    for (const input of selected) validateSourceInput(input);
    const diagnostics: BuildManifestDiagnostic[] = [];
    const packages = [...cargoPackages(selected, diagnostics), ...gradlePackages(inputs, diagnostics), ...dotnetPackages(selected, diagnostics), ...mavenPackages(selected, diagnostics), ...scriptPackages(selected, diagnostics)].sort((a, b) => packageId(a).localeCompare(packageId(b)));
    const byName = new Map<string, ManifestPackage[]>(), byPath = new Map<string, ManifestPackage[]>();
    for (const pkg of packages) {
        for (const key of [pkg.name, ...pkg.aliases]) { const group = byName.get(key) ?? []; group.push(pkg); byName.set(key, group); }
        for (const key of [pkg.root, pkg.input.path]) { const group = byPath.get(key) ?? []; group.push(pkg); byPath.set(key, group); }
    }
    const workspaces = new Map(workspaceMembership(selected, packages, diagnostics));
    for (const pkg of packages) if (pkg.workspaceManifest) workspaces.set(pkg.input.path, pkg.workspaceManifest);
    const edges: Edge[] = [], bindings = new Map<string, Record<string, string>>();
    for (const pkg of packages) for (const [index, dependency] of pkg.dependencies.entries()) {
        const candidates = (dependency.path === undefined ? byName.get(dependency.name) : byPath.get(dependency.path))?.filter(other => other.system === pkg.system) ?? [];
        if (candidates.length !== 1) continue;
        const target = candidates[0]; if (!target || target === pkg) continue;
        const sourceId = packageId(pkg), targetId = packageId(target), names = bindings.get(sourceId) ?? {};
        names[dependency.alias ?? dependency.name] = targetId; bindings.set(sourceId, names);
        edges.push({ id: `build-dependency:${sourceId}:${index}:${targetId}`, kind: "depends-on", source: sourceId, target: targetId, directed: true, field: dependency.scope, sources: [dependency.source ?? makeSource(pkg.input, `/dependencies/${index}`, dependency.line), ...(dependency.evidence ?? [])], attributes: { scope: dependency.scope, declared: true, ...(dependency.condition ? { condition: dependency.condition } : {}), ...(dependency.optional ? { optional: true } : {}), ...(dependency.alias ? { alias: dependency.alias } : {}) } });
    }
    const nodes: NodeDraft[] = packages.map(pkg => ({ id: packageId(pkg), kind: "package", name: pkg.name, attributes: { buildSystem: pkg.system, ...(pkg.isTestAssembly === undefined ? {} : { isTestAssembly: pkg.isTestAssembly }), ...(workspaces.has(pkg.input.path) ? { workspaceManifest: workspaces.get(pkg.input.path) ?? "", workspaceManifestPath: workspaces.get(pkg.input.path) ?? "", workspaceRoot: directory(workspaces.get(pkg.input.path) ?? "") } : {}), manifestPath: pkg.input.path, root: pkg.root, sourceRoots: [...new Set(pkg.sourceRoots)], memberIds: [], description: pkg.description, entryTargets: pkg.entryTargets, packageName: pkg.name, importNames: pkg.importNames, importBindings: bindings.get(packageId(pkg)) ?? {} }, sources: [makeSource(pkg.input, "/build-package", 1)] }));
    const owner = packageOwner(nodes), members = new Map<string, string[]>();
    for (const module of modules) {
        const path = module.sources[0]?.path; if (!path) continue;
        const pkg = owner(path); if (!pkg) continue;
        const group = members.get(pkg.id) ?? []; group.push(module.id); members.set(pkg.id, group);
        edges.push({ id: `build-contains:${pkg.id}:${module.id}`, kind: "contains", source: pkg.id, target: module.id, directed: true, field: "memberIds", sources: pkg.sources });
    }
    return { nodes: nodes.map(node => ({ ...node, attributes: { ...node.attributes, memberIds: (members.get(node.id) ?? []).sort() } })), edges, diagnostics: [...new Map(diagnostics.map(item => [`${item.code}:${item.path}:${item.line}:${item.message}`, item])).values()] };
}
export function resolveBuildPackageImports(packages: readonly NodeDraft[], modules: readonly CodeModule[]): readonly Edge[] {
    const owner = packageOwner(packages), names = new Map<string, NodeDraft[]>(), edges: Edge[] = [];
    for (const pkg of packages) for (const name of strings(pkg.attributes['importNames'])) { const group = names.get(name) ?? []; group.push(pkg); names.set(name, group); }
    const byId = new Map(packages.map(pkg => [pkg.id, pkg]));
    for (const module of modules) for (const reference of module.imports) {
        if (reference.specifier.startsWith(".") || reference.form === "dynamic-require" || reference.form === "shadowed-require") continue;
        const specifier = reference.specifier, pkg = owner(module.node.sources[0]?.path ?? ""), bindings = object(pkg?.attributes['importBindings']);
        const parts = specifier.split(module.language === "rust" ? "::" : module.language === "python" ? "." : "/");
        let matches: readonly NodeDraft[] = [];
        for (let length = parts.length; length > 0 && !matches.length; length--) {
            const name = parts.slice(0, length).join(module.language === "rust" ? "::" : module.language === "python" ? "." : "/");
            const bound = bindings?.[name], target = typeof bound === "string" ? byId.get(bound) : undefined;
            matches = target ? [target] : names.get(name) ?? [];
        }
        if (matches.length !== 1) continue; const target = matches[0]; if (!target || target.id === pkg?.id) continue;
        edges.push({ id: `build-import:${module.node.id}:${reference.source.pointer}:${target.id}`, kind: "imports", source: module.node.id, target: target.id, directed: true, field: reference.source.pointer, sources: [reference.source], attributes: { specifier, resolution: "build-package", ...(reference.member ? { member: reference.member } : {}) } });
    }
    return edges;
}
