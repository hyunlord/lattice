import type { SourceInput } from "./types.js";
import { basePackage, jsonObject, object, string, strings, joinPath, sourceLine, diagnostic } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestPackage } from "./manifest-types.js";
import { tomlEntries, tomlGet } from "./manifest-toml.js";
function leaves(value: unknown): string[] { if (typeof value === "string") return [value]; if (Array.isArray(value)) return value.flatMap(leaves); const record = object(value); return record ? Object.values(record).flatMap(leaves) : []; }
export function scriptPackages(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): ManifestPackage[] {
    const packages: ManifestPackage[] = [];
    for (const input of inputs) {
        const filename = input.path.split("/").at(-1);
        if (filename === "package.json") {
            const value = jsonObject(input, diagnostics); if (!value) continue;
            const pkg = basePackage(input, "npm", string(value['name'])); pkg.description = string(value['description']);
            for (const scope of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) for (const [name, version] of Object.entries(object(value[scope]) ?? {})) {
                const path = typeof version === "string" && /^(?:file|link):/u.test(version) ? joinPath(pkg.root, version.replace(/^[^:]+:/u, "")) : undefined;
                pkg.dependencies.push({ name, scope, line: sourceLine(input, Math.max(0, input.text.indexOf(JSON.stringify(name)))), ...(path !== undefined ? { path } : {}) });
            }
            pkg.entryTargets = [...new Set([...leaves(value['exports']), ...leaves(value['main']), ...leaves(value['bin'])].flatMap(path => { const joined = joinPath(pkg.root, path); return joined === undefined ? [] : [joined]; }))];
            packages.push(pkg);
        } else if (filename === "pyproject.toml") {
            const entries = tomlEntries(input, diagnostics), pkg = basePackage(input, "python", string(tomlGet(entries, "project", "name")) || string(tomlGet(entries, "tool.poetry", "name")));
            pkg.description = string(tomlGet(entries, "project", "description")) || string(tomlGet(entries, "tool.poetry", "description"));
            pkg.importNames = [string(tomlGet(entries, "tool.flit.module", "name")) || pkg.name.replaceAll("-", "_")];
            pkg.entryTargets = entries.filter(entry => ["project.scripts", "project.gui-scripts", "tool.poetry.scripts"].includes(entry.section)).flatMap(entry => typeof entry.value === "string" ? [entry.value] : []);
            for (const dep of strings(tomlGet(entries, "project", "dependencies"))) { const name = /^[A-Za-z0-9_.-]+/u.exec(dep)?.[0]; if (name) pkg.dependencies.push({ name, scope: "dependencies", line: 1 }); }
            pkg.sourceRoots = [pkg.root, joinPath(pkg.root, "src") ?? pkg.root]; packages.push(pkg);
        } else if (filename === "go.mod") {
            const name = /^\s*module\s+(?:"([^"]+)"|(\S+))/mu.exec(input.text), pkg = basePackage(input, "go", name?.[1] ?? name?.[2] ?? "");
            const replacements = new Map<string, string>();
            for (const match of input.text.matchAll(/(?:^\s*replace\s+|^\s*)([\w./-]+)(?:\s+v[^\s]+)?\s*=>\s*(\.{1,2}\/[^\s]+)(?:\s|$)/gmu)) {
                const path = joinPath(pkg.root, match[2] ?? ""); if (path !== undefined) replacements.set(match[1] ?? "", path);
            }
            let requireBlock = false;
            for (const [index, line] of input.text.split("\n").entries()) {
                if (/^\s*require\s*\(/u.test(line)) { requireBlock = true; continue; }
                if (/^\s*\)/u.test(line)) { requireBlock = false; continue; }
                const requirement = (requireBlock ? /^\s*([\w./-]+)\s+v\S+/u : /^\s*require\s+([\w./-]+)\s+v\S+/u).exec(line);
                if (!requirement?.[1]) continue;
                const path = replacements.get(requirement[1]);
                pkg.dependencies.push({ name: requirement[1], ...(path !== undefined ? { path } : {}), scope: "require", line: index + 1 });
            }
            packages.push(pkg);
        } else if (filename === "project.godot") {
            const entries = tomlEntries(input, diagnostics), pkg = basePackage(input, "godot", string(tomlGet(entries, "application", "config/name")));
            const main = string(tomlGet(entries, "application", "run/main_scene"));
            if (main.startsWith("res://")) { const target = joinPath(pkg.root, main.slice(6)); if (target) pkg.entryTargets = [target]; }
            else if (main) diagnostic(input, diagnostics, "unresolved-package", "Scene UID needs the corresponding scene resource to resolve");
            packages.push(pkg);
        }
    }
    return packages;
}
