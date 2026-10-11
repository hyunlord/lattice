import type { NodeDraft } from "../core/model.js";
import { directory } from "./manifest-types.js";
/** Root-index lookup scales with path depth rather than package count × file count. */
export function packageOwner(packages: readonly NodeDraft[]): (path: string) => NodeDraft | undefined {
    const roots = new Map<string, NodeDraft>();
    for (const pkg of packages) {
        const root = typeof pkg.attributes['root'] === "string" ? pkg.attributes['root'] : "";
        const current = roots.get(root);
        if (!current || pkg.attributes['buildSystem'] === "unity") roots.set(root, pkg);
    }
    return path => {
        let folder = directory(path);
        for (; ;) { const owner = roots.get(folder); if (owner) return owner; if (!folder) return undefined; folder = directory(folder); }
    };
}
