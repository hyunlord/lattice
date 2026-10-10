import type { CodeModule, ModuleImport } from "./code.js";
import type { NativeMatches } from "./native-links.js";

function pathOf(module: CodeModule): string { return module.node.sources[0]?.path ?? ""; }
function names(module: CodeModule): readonly string[] {
    const definitions = module.node.attributes["definitions"];
    return Array.isArray(definitions) ? definitions.flatMap(value => value && typeof value === "object" && !Array.isArray(value) && typeof value["name"] === "string" ? [value["name"]] : []) : [];
}
function normalized(path: string): string | undefined {
    const parts: string[] = [];
    for (const item of path.split("/")) {
        if (!item || item === ".") continue;
        if (item === "..") { if (!parts.length) return undefined; parts.pop(); }
        else parts.push(item);
    }
    return parts.join("/");
}
export function languageMatches(module: CodeModule, modules: readonly CodeModule[], reference: ModuleImport): NativeMatches | undefined {
    let matches: readonly CodeModule[] = [], multiple = false;
    let packageName: string | undefined;
    const specifier = reference.specifier;
    if (["java", "kotlin"].includes(module.language)) {
        const candidates = modules.filter(candidate => ["java", "kotlin"].includes(candidate.language));
        if (specifier.endsWith(".*")) {
            const target = specifier.slice(0, -2);
            matches = candidates.filter(candidate => candidate.node.attributes["package"] === target); multiple = true; packageName = target;
            if (!matches.length) { matches = candidates.filter(candidate => names(candidate).some(name => `${String(candidate.node.attributes["package"] ?? "")}.${name}` === target)); multiple = false; packageName = undefined; }
        } else matches = candidates.filter(candidate => names(candidate).some(name => {
            const full = [candidate.node.attributes["package"], name].filter(Boolean).join(".");
            return full === specifier || specifier.startsWith(`${full}.`);
        }));
    } else if (module.language === "swift") {
        const target = specifier.split(".")[0] ?? "";
        const parts = pathOf(module).split("/"), sourceIndex = parts.lastIndexOf("Sources");
        const root = sourceIndex < 0 ? undefined : parts.slice(0, sourceIndex).join("/");
        if (root !== undefined) matches = modules.filter(candidate => candidate.language === "swift" && pathOf(candidate).startsWith(`${root ? root + "/" : ""}Sources/${target}/`));
        multiple = true; packageName = `${root ? root + "/" : ""}Sources/${target}`;
    } else if (module.language === "go") {
        let directory: string | undefined;
        const manifests = modules.filter(candidate => candidate.language === "gomod" && typeof candidate.node.attributes["goModule"] === "string");
        const owning = manifests.filter(candidate => pathOf(module).startsWith(pathOf(candidate).slice(0, -6))).sort((a, b) => pathOf(b).length - pathOf(a).length)[0];
        const prefix = owning?.node.attributes["goModule"];
        if (owning && typeof prefix === "string" && (specifier === prefix || specifier.startsWith(prefix + "/"))) directory = normalized(`${pathOf(owning).slice(0, -6)}${specifier.slice(prefix.length).replace(/^\//u, "")}`);
        else if (specifier.startsWith(".")) directory = normalized(`${pathOf(module).split("/").slice(0, -1).join("/")}/${specifier}`);
        if (directory !== undefined) matches = modules.filter(candidate => candidate.language === "go" && !pathOf(candidate).endsWith("_test.go") && pathOf(candidate).split("/").slice(0, -1).join("/") === directory);
        multiple = true; packageName = directory;
    } else if (module.language === "gdscript") {
        if (reference.form === "script-class") matches = modules.filter(candidate => candidate.language === "gdscript" && candidate.node.attributes["globalClass"] === specifier);
        else {
            const path = specifier.startsWith("res://") ? normalized(specifier.slice(6)) : normalized(`${pathOf(module).split("/").slice(0, -1).join("/")}/${specifier}`);
            matches = modules.filter(candidate => pathOf(candidate) === path);
        }
    } else return undefined;
    return { paths: matches.map(pathOf), multiple, ...(packageName === undefined ? {} : { packageName }) };
}
