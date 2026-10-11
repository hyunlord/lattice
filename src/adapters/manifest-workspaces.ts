import type { SourceInput } from "./types.js";
import type { BuildManifestDiagnostic, ManifestPackage } from "./manifest-types.js";
import { directory, globMatches, inside, joinPath, jsonObject, object, strings } from "./manifest-types.js";
import { tomlEntries, tomlGet } from "./manifest-toml.js";
/** Annotate declared workspace membership without treating every nested project as a member. */
export function workspaceMembership(inputs: readonly SourceInput[], packages: readonly ManifestPackage[], diagnostics: BuildManifestDiagnostic[]): ReadonlyMap<string, string> {
    const membership = new Map<string, string>();
    for (const input of inputs) {
        const root = directory(input.path); let patterns: string[] = [], system = "";
        if (input.path.endsWith("package.json")) { const value = jsonObject(input, []); patterns = strings(value?.['workspaces']).concat(strings(object(value?.['workspaces'])?.['packages'])); system = "npm"; }
        else if (input.path.endsWith("Cargo.toml")) { patterns = strings(tomlGet(tomlEntries(input, []), "workspace", "members")); system = "cargo"; }
        else if (input.path.endsWith("pom.xml")) { patterns = [...input.text.matchAll(/<module\b[^>]*>([^<]+)<\/module>/gu)].map(match => match[1]?.trim() ?? ""); system = "maven"; }
        if (!patterns.length) continue;
        for (const pkg of packages) {
            if (pkg.system !== system || !inside(pkg.root, root)) continue;
            const relative = pkg.root.slice(root ? root.length + 1 : 0);
            if (pkg.root === root || patterns.some(pattern => globMatches(relative, pattern))) membership.set(pkg.input.path, input.path);
        }
        for (const pattern of patterns.filter(pattern => !/[?*]/u.test(pattern))) {
            const path = joinPath(root, pattern);
            if (path !== undefined && !packages.some(pkg => pkg.system === system && pkg.root === path)) {
                diagnostics.push({ code: "unresolved-package", path: input.path, line: 1, message: `Declared workspace member has no selected manifest: ${pattern}`, source: { path: input.path, line: 1, pointer: "/workspace-members", contentHash: input.contentHash } });
            }
        }
    }
    return membership;
}
