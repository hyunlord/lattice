import type { SourceInput } from "./types.js";
import { makeSource } from "./types.js";
import { tomlEntries } from "./manifest-toml.js";
import { object, inside } from "./manifest-types.js";
import { basePackage, diagnostic, directory, joinPath, sourceLine } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestPackage } from "./manifest-types.js";
function conditionalLines(text: string): ReadonlySet<number> {
    const result = new Set<number>(), stack: boolean[] = []; let conditional = false;
    for (const [index, line] of text.split("\n").entries()) {
        const code = line.replace(/["'][^"'\n]*["']/gu, "");
        if (/\b(?:if|when|for|while)\s*\(/u.test(code)) conditional = true;
        if (conditional || stack.some(Boolean)) result.add(index + 1);
        for (const char of code) { if (char === "{") { stack.push(conditional || stack.some(Boolean)); conditional = false; } else if (char === "}") stack.pop(); }
        if (!code.trim()) continue;
        if (!code.includes("{") && !/\b(?:if|when|for|while)\s*\(/u.test(code)) conditional = false;
    }
    return result;
}
function literals(text: string): string[] { return [...text.matchAll(/["']([^"'\n]+)["']/gu)].map(match => match[1] ?? ""); }
function accessor(name: string): string { return name.slice(1).split(":").map(part => part.replace(/[-_]([a-z])/gu, (_, letter: string) => letter.toUpperCase())).join("."); }
type Plugin = { input: SourceInput; body: string; registration: SourceInput; line: number; };
function clean(text: string): string {
    return text.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|\/\*[\s\S]*?\*\/|\/\/[^\n]*/gu, (value, literal: string | undefined) => literal ?? value.replace(/[^\n]/gu, " "));
}
function block(text: string, opening: number): string {
    let depth = 0, quote = "", escape = false;
    for (let i = opening; i < text.length; i++) {
        const c = text[i] ?? "";
        if (escape) { escape = false; continue; }
        if (quote) { if (c === "\\") escape = true; else if (c === quote) quote = ""; continue; }
        if (c === '"' || c === "'") quote = c;
        else if (c === "{") depth++;
        else if (c === "}" && --depth === 0) return text.slice(opening + 1, i);
    }
    return "";
}
function conventionPlugins(inputs: readonly SourceInput[], settings: SourceInput, diagnostics: BuildManifestDiagnostic[]): Map<string, Plugin> {
    const root = directory(settings.path), roots = [joinPath(root, "buildSrc") ?? ""];
    for (const match of clean(settings.text).matchAll(/\bincludeBuild\s*\(\s*["']([^"'$]+)["']\s*\)/gu)) {
        if (conditionalLines(clean(settings.text)).has(sourceLine(settings, match.index ?? 0))) { diagnostic(settings, diagnostics, "dynamic-manifest", "Conditional included plugin build is not evaluated", sourceLine(settings, match.index ?? 0)); continue; }
        const path = joinPath(root, match[1] ?? ""); if (path !== undefined) roots.push(path);
    }
    const result = new Map<string, Plugin>(), duplicates = new Set<string>();
    for (const registration of inputs.filter(input => /(?:^|\/)build\.gradle(?:\.kts)?$/u.test(input.path) && roots.some(root => inside(input.path, root)))) {
        const text = clean(registration.text);
        const owner = inputs.filter(input => /(?:^|\/)settings\.gradle(?:\.kts)?$/u.test(input.path) && inside(registration.path, directory(input.path))).sort((a, b) => b.path.length - a.path.length)[0];
        const aliases = pluginAliases(inputs, owner ? directory(owner.path) : root, diagnostics);
        for (const match of text.matchAll(/\b(?:register|create)\s*\(\s*["'][^"']+["']\s*\)\s*\{/gu)) {
            if (conditionalLines(text).has(sourceLine(registration, match.index ?? 0))) { diagnostic(registration, diagnostics, "dynamic-manifest", "Conditional plugin registration is not evaluated", sourceLine(registration, match.index ?? 0)); continue; }
            const body = block(text, (match.index ?? 0) + match[0].lastIndexOf("{"));
            const catalogKey = /\bid\s*=\s*([\w.]+?)(?:\.asProvider\(\))?\.get\(\)\.pluginId/u.exec(body)?.[1];
            const id = /\bid\s*=\s*["']([^"'$]+)["']/u.exec(body)?.[1] ?? aliases.get(catalogKey ?? ""), implementation = /\bimplementationClass\s*=\s*["']([^"'$]+)["']/u.exec(body)?.[1];
            if (!id || !implementation) { diagnostic(registration, diagnostics, "dynamic-manifest", "Local plugin registration requires a literal ID or catalog alias and implementation class", sourceLine(registration, match.index ?? 0)); continue; }
            const matches = inputs.filter(input => inside(input.path, directory(registration.path)) && /\.(?:kt|java|groovy)$/u.test(input.path) && new RegExp(`\\bclass\\s+${implementation.split(".").at(-1)}\\b`, "u").test(clean(input.text)));
            if (matches.length !== 1) { diagnostic(registration, diagnostics, "unresolved-package", "Local plugin implementation is missing or ambiguous", sourceLine(registration, match.index ?? 0)); continue; }
            const input = matches[0]; if (!input) continue;
            const source = clean(input.text), apply = /\b(?:fun\s+|void\s+)apply\s*\([^)]*\)\s*\{/u.exec(source);
            if (!apply) { diagnostic(input, diagnostics, "dynamic-manifest", "Local plugin apply body could not be resolved statically"); continue; }
            const offset = (apply.index ?? 0) + apply[0].lastIndexOf("{");
            const selected = source.slice(0, offset + 1).replace(/[^\n]/gu, " ") + block(source, offset);
            if (result.has(id)) duplicates.add(id);
            result.set(id, { input, body: selected, registration, line: sourceLine(registration, match.index ?? 0) });
        }
    }
    for (const id of duplicates) { const value = result.get(id); if (value) diagnostic(value.registration, diagnostics, "unresolved-package", "Local plugin ID has multiple implementations", value.line); result.delete(id); }
    return result;
}
function pluginAliases(inputs: readonly SourceInput[], root: string, diagnostics: BuildManifestDiagnostic[]): Map<string, string> {
    const result = new Map<string, string>();
    const catalogs = inputs.filter(input => directory(input.path) === joinPath(root, "gradle") && /\.versions\.toml$/u.test(input.path)).map(input => ({ input, catalog: input.path.split("/").at(-1)?.replace(/\.versions\.toml$/u, "") ?? "libs" }));
    const settings = inputs.find(input => directory(input.path) === root && /(?:^|\/)settings\.gradle(?:\.kts)?$/u.test(input.path));
    if (settings) for (const match of clean(settings.text).matchAll(/\bcreate\s*\(\s*["']([^"']+)["']\s*\)\s*\{/gu)) {
        const body = block(clean(settings.text), (match.index ?? 0) + match[0].lastIndexOf("{")), path = /\bfrom\s*\(\s*files\s*\(\s*["']([^"'$]+)["']/u.exec(body)?.[1];
        const input = path ? inputs.find(input => input.path === joinPath(root, path)) : undefined;
        if (input) catalogs.push({ input, catalog: match[1] ?? "libs" });
    }
    for (const { input, catalog } of catalogs) {
        for (const entry of tomlEntries(input, diagnostics)) if (entry.section === "plugins") {
            const id = object(entry.value)?.['id']; if (typeof id === "string") result.set(`${catalog}.plugins.${entry.key.replace(/[-_]/gu, ".")}`, id);
        }
    }
    return result;
}
function appliedPlugins(input: SourceInput, text: string, aliases: ReadonlyMap<string, string>, diagnostics: BuildManifestDiagnostic[]): { id: string; line: number; }[] {
    const result: { id: string; line: number; }[] = [], conditional = conditionalLines(text);
    for (const match of text.matchAll(/\b(?:id\s*\(\s*["']([^"'$]+)["']\s*\)|alias\s*\(\s*([\w.]+)\s*\)|apply\s*\(\s*plugin\s*[:=]\s*["']([^"'$]+)["']\s*\)|pluginManager\.apply\s*\(\s*["']([^"'$]+)["']\s*\))/gu)) {
        const line = sourceLine(input, match.index ?? 0);
        if (/^\s*apply\s+false\b/u.test(text.slice((match.index ?? 0) + match[0].length))) continue;
        if (conditional.has(line)) { diagnostic(input, diagnostics, "dynamic-manifest", "Conditional plugin application is not evaluated", line); continue; }
        const id = match[1] ?? aliases.get(match[2] ?? "") ?? match[3] ?? match[4]; if (id) result.push({ id, line });
    }
    return result;
}
function projectDependencies(pkg: ManifestPackage, input: SourceInput, text: string, root: string, accessors: ReadonlyMap<string, string>, diagnostics: BuildManifestDiagnostic[], applying?: { input: SourceInput; line: number; }): void {
    const conditional = conditionalLines(text);
    const expression = /(?:["'](\w+)["']|\b(\w+))\s*\(?\s*(?:project\s*\(\s*(?:path\s*[:=]\s*)?["']([^"']+)["']|projects\.([\w.]+))|\badd\s*\(\s*["'](\w+)["']\s*,\s*project\s*\(\s*["']([^"']+)["']|\btargetProjectPath\s*=\s*["']([^"']+)["']/gu;
    for (const match of text.matchAll(expression)) {
        const line = sourceLine(input, match.index ?? 0), target = match[3] ?? accessors.get(match[4] ?? "") ?? match[6] ?? match[7];
        if (conditional.has(line) || target?.includes("$")) { diagnostic(input, diagnostics, "dynamic-manifest", "Computed or conditional Gradle dependency is not evaluated", line); continue; }
        if (!target) { diagnostic(input, diagnostics, "unresolved-package", "Gradle project accessor has no declared project", line); continue; }
        pkg.dependencies.push({ name: `gradle:${root}:${target}`, scope: match[1] ?? match[2] ?? match[5] ?? "testedApks", line, source: makeSource(input, "/dependencies", line), ...(applying ? { evidence: [makeSource(applying.input, "/plugins", applying.line)] } : {}) });
    }
    for (const match of text.matchAll(/\bproject\s*\(\s*(?!["'\s])[^)]+\)/gu)) diagnostic(input, diagnostics, "dynamic-manifest", "Computed Gradle project reference is not evaluated", sourceLine(input, match.index ?? 0));
}
export function gradlePackages(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): ManifestPackage[] {
    const byPath = new Map(inputs.map(input => [input.path, input])), packages: ManifestPackage[] = [];
    for (const settings of inputs.filter(input => /(?:^|\/)settings\.gradle(?:\.kts)?$/u.test(input.path))) {
        const root = directory(settings.path), text = clean(settings.text);
        const conditionalSettings = conditionalLines(text);
        const members = new Map<string, { root: string; line: number; }>();
        for (const match of text.matchAll(/\binclude\b\s*(?:\(([^)]*)\)|([^\n;]+))/gu)) {
            if (conditionalSettings.has(sourceLine(settings, match.index ?? 0))) { diagnostic(settings, diagnostics, "dynamic-manifest", "Conditional Gradle includes are not evaluated", sourceLine(settings, match.index ?? 0)); continue; }
            const body = match[1] ?? match[2] ?? "", names = literals(body), residue = body.replace(/["'][^"'\n]*["']/gu, "").replace(/[\s,]/gu, "");
            if (residue || !names.length) { diagnostic(settings, diagnostics, "dynamic-manifest", "Computed Gradle includes are not evaluated", sourceLine(settings, match.index ?? 0)); continue; }
            for (const name of names) { const path = joinPath(root, name.replace(/^:/u, "").replaceAll(":", "/")); if (path !== undefined) members.set(name.startsWith(":") ? name : ":" + name, { root: path, line: sourceLine(settings, match.index ?? 0) }); }
        }
        for (const match of text.matchAll(/project\(["']([^"']+)["']\)\.projectDir\s*=\s*(?:file\(["']([^"']+)["']\)|File\(rootDir,\s*["']([^"']+)["']\))/gu)) {
            const member = members.get(match[1] ?? ""), path = joinPath(root, match[2] ?? match[3] ?? ""); if (member && path !== undefined) member.root = path;
        }
        const plugins = conventionPlugins(inputs, settings, diagnostics), aliases = pluginAliases(inputs, root, diagnostics);
        const accessors = new Map([...members.keys()].map(name => [accessor(name), name]));
        for (const [name, member] of members) {
            const build = byPath.get(`${member.root}/build.gradle.kts`) ?? byPath.get(`${member.root}/build.gradle`);
            const pkg = basePackage(build ?? settings, "gradle", name); pkg.workspaceManifest = settings.path; pkg.root = member.root; pkg.sourceRoots = [member.root]; pkg.aliases = [`gradle:${root}:${name}`];
            if (build) {
                const buildText = clean(build.text);
                projectDependencies(pkg, build, buildText, root, accessors, diagnostics);
                const visited = new Set<string>();
                const visit = (id: string, applicationLine: number): void => {
                    if (visited.has(id)) return; visited.add(id);
                    const plugin = plugins.get(id); if (!plugin) return;
                    projectDependencies(pkg, plugin.input, plugin.body, root, accessors, diagnostics, { input: build, line: applicationLine });
                    for (const next of appliedPlugins(plugin.input, plugin.body, aliases, diagnostics)) visit(next.id, applicationLine);
                };
                for (const application of appliedPlugins(build, buildText, aliases, diagnostics)) visit(application.id, application.line);
            } else diagnostic(settings, diagnostics, "unresolved-package", `Included Gradle project has no selected build manifest: ${name}`, member.line);
            packages.push(pkg);
        }
        if (/\b(?:include|project)\([^"'\s)]/u.test(text)) diagnostic(settings, diagnostics, "dynamic-manifest", "Dynamic Gradle declarations require build-tool evaluation");
    }
    return packages;
}
