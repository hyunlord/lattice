import type { SourceInput } from "./types.js";
import { basePackage, directory, globMatches, inside, joinPath, object, string, strings } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestDependency, ManifestPackage } from "./manifest-types.js";
import { tomlEntries, tomlGet } from "./manifest-toml.js";
import type { TomlEntry } from "./manifest-toml.js";
function dependencies(entries: readonly TomlEntry[]): { section: string; name: string; value: unknown; line: number; }[] {
    const result: { section: string; name: string; value: unknown; line: number; }[] = [];
    const nested = new Map<string, { section: string; name: string; value: Record<string, unknown>; line: number; }>();
    for (const entry of entries) {
        const match = /^(.*(?:^|\.)(?:dependencies|dev-dependencies|build-dependencies))(?:\.(.+))?$/u.exec(entry.section);
        if (!match) continue;
        if (!match[2]) result.push({ section: entry.section, name: entry.key, value: entry.value, line: entry.line });
        else { const group = nested.get(entry.section) ?? { section: match[1] ?? "", name: match[2], value: {}, line: entry.line }; group.value[entry.key] = entry.value; nested.set(entry.section, group); }
    }
    return [...result, ...nested.values()];
}
export function cargoPackages(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): ManifestPackage[] {
    const parsed = inputs.filter(input => input.path.endsWith("Cargo.toml")).map(input => ({ input, entries: tomlEntries(input, diagnostics) }));
    const workspaces = parsed.filter(item => item.entries.some(entry => entry.section.startsWith("workspace"))).map(item => ({ ...item, root: directory(item.input.path), members: strings(tomlGet(item.entries, "workspace", "members")), exclude: strings(tomlGet(item.entries, "workspace", "exclude")) }));
    const packages: ManifestPackage[] = [];
    for (const item of parsed) {
        const name = string(tomlGet(item.entries, "package", "name")); if (!name) continue;
        const root = directory(item.input.path), workspace = workspaces.filter(ws => inside(root, ws.root)).sort((a, b) => b.root.length - a.root.length)[0];
        const relative = workspace ? root.slice(workspace.root ? workspace.root.length + 1 : 0) : root;
        if (workspace && root !== workspace.root && workspace.exclude.some(glob => globMatches(relative, glob))) continue;
        const pkg = basePackage(item.input, "cargo", name); pkg.importNames = [name.replaceAll("-", "_")];
        pkg.description = string(tomlGet(item.entries, "package", "description"));
        pkg.sourceRoots = [joinPath(root, "src") ?? root];
        for (const entry of item.entries.filter(entry => (entry.section.startsWith("bin#") || entry.section === "lib") && entry.key === "path")) {
            const path = joinPath(root, string(entry.value)); if (path) { pkg.entryTargets.push(path); pkg.sourceRoots.push(directory(path)); }
        }
        if (!pkg.entryTargets.length) pkg.entryTargets.push(...["src/main.rs", "src/lib.rs"].map(path => joinPath(root, path) ?? path));
        const inherited = workspace ? dependencies(workspace.entries).filter(dep => dep.section === "workspace.dependencies") : [];
        for (const declaration of dependencies(item.entries).filter(dep => !dep.section.startsWith("workspace."))) {
            let value = object(declaration.value), dependencyRoot = root;
            if (value?.['workspace'] === true) { value = object(inherited.find(dep => dep.name === declaration.name)?.value); dependencyRoot = workspace?.root ?? root; }
            const path = typeof value?.['path'] === "string" ? joinPath(dependencyRoot, value['path']) : undefined;
            const dependency: ManifestDependency = { name: string(value?.['package']) || declaration.name, alias: declaration.name.replaceAll("-", "_"), scope: declaration.section, line: declaration.line, ...(path !== undefined ? { path } : {}), ...(value?.['optional'] === true ? { optional: true } : {}) };
            pkg.dependencies.push(dependency);
        }
        packages.push(pkg);
    }
    return packages;
}
