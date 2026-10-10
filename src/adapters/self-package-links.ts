import type { JsonValue, JsonObject } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import type { CodeModule, ModuleImport } from "./code.js";
import type { ExtractedRecord } from "./types.js";
import { pointerToken } from "./types.js";

function isObject(value: JsonValue | undefined): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function object(value: JsonValue | undefined): JsonObject | undefined { return isObject(value) ? value : undefined; }
function directory(path: string) { return path.split("/").slice(0, -1).join("/"); }
function inside(path: string, root: string) { return !root || path.startsWith(root + "/"); }
function join(root: string, suffix: string): string | undefined {
    if (suffix.startsWith("/") || /[\\:*\u0000-\u001f]/u.test(suffix)) return undefined;
    const parts = root ? root.split("/") : [];
    for (const part of suffix.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { if (!parts.length) return undefined; parts.pop(); }
        else parts.push(part);
    }
    return parts.join("/");
}
function leaves(value: JsonValue | undefined, pointer: string): readonly { readonly path: string; readonly pointer: string; }[] {
    if (typeof value === "string") return [{ path: value, pointer }];
    if (!object(value)) return [];
    return Object.entries(object(value) ?? {}).flatMap(([key, child]) => leaves(child, `${pointer}/${pointerToken(key)}`));
}
export function selfPackageResolver(modules: readonly CodeModule[], records: readonly ExtractedRecord[]) {
    const roots = records.filter(record => record.node.sources[0]?.pointer === "");
    const metadata = new Map(roots.map(record => [record.node.sources[0]?.path, record]));
    const packages = roots.filter(record => record.node.sources[0]?.path.split("/").at(-1) === "package.json").sort((a, b) => (b.node.sources[0]?.path.length ?? 0) - (a.node.sources[0]?.path.length ?? 0));
    const selected = new Set(modules.map(module => module.node.sources[0]?.path));
    return (module: CodeModule, reference: ModuleImport): { readonly paths: readonly string[]; readonly sources: readonly Source[]; readonly reason: string; } | undefined => {
        if (!["typescript", "javascript"].includes(module.language) || reference.specifier.startsWith(".")) return undefined;
        const owner = packages.find(record => inside(module.node.sources[0]?.path ?? "", directory(record.node.sources[0]?.path ?? "")));
        const name = owner?.node.attributes["name"];
        if (!owner || typeof name !== "string" || !(reference.specifier === name || reference.specifier.startsWith(name + "/"))) return undefined;
        const root = directory(owner.node.sources[0]?.path ?? ""), attributes = owner.node.attributes;
        const subpath = reference.specifier === name ? "." : "./" + reference.specifier.slice(name.length + 1);
        const exports = attributes["exports"], exportMap = object(exports);
        const targets = exports !== undefined ? leaves(exportMap && Object.keys(exportMap).some(key => key.startsWith(".")) ? exportMap[subpath] : subpath === "." ? exports : undefined, exportMap && Object.keys(exportMap).some(key => key.startsWith(".")) ? `/exports/${pointerToken(subpath)}` : "/exports") : subpath === "." ? ["types", "main"].flatMap(key => leaves(attributes[key], `/${key}`)) : [];
        const sources: Source[] = owner.fields["/name"] ? [owner.fields["/name"]] : [];
        const paths = new Set<string>();
        let unresolvedTarget = targets.length === 0;
        const scripts = object(attributes["scripts"]);
        const configs = Object.entries(scripts ?? {}).flatMap(([key, command]) => typeof command === "string" ? [...command.matchAll(/(?:^|[;&|]\s*|\s)tsc\s+(?:--project|-p)\s+([\w./-]+)(?=\s|$)/gu)].flatMap(match => {
            const configPath = join(root, match[1] ?? ""), record = metadata.get(configPath?.endsWith(".json") ? configPath : `${configPath}.json`);
            const options = object(record?.node.attributes["compilerOptions"]);
            if (!record || typeof options?.["rootDir"] !== "string" || typeof options["outDir"] !== "string") return [];
            const base = directory(record.node.sources[0]?.path ?? "");
            const sourceRoot = join(base, options["rootDir"]), outputRoot = join(base, options["outDir"]);
            return sourceRoot === undefined || outputRoot === undefined ? [] : [{ record, sourceRoot, outputRoot, script: owner.fields[`/scripts/${pointerToken(key)}`] }];
        }) : []);
        for (const target of targets) {
            if (!target.path.startsWith("./")) { unresolvedTarget = true; continue; }
            const path = join(root, target.path);
            if (path === undefined || !inside(path, root)) { unresolvedTarget = true; continue; }
            const targetSource = owner.fields[target.pointer]; if (targetSource) sources.push(targetSource);
            if (selected.has(path)) { paths.add(path); continue; }
            const projected = new Set<string>();
            for (const config of configs) {
                if (!inside(path, config.outputRoot)) continue;
                const suffix = path.slice(config.outputRoot ? config.outputRoot.length + 1 : 0);
                const stem = suffix.replace(/(?:\.d)?\.[mc]?js$|\.d\.[mc]?ts$/u, "");
                if (stem === suffix) continue;
                const extensions = /\.(?:mjs|mts)$/u.test(suffix) ? ["mts"] : /\.(?:cjs|cts)$/u.test(suffix) ? ["cts"] : ["ts", "tsx"];
                for (const extension of extensions) {
                    const source = join(config.sourceRoot, `${stem}.${extension}`);
                    if (source !== undefined && selected.has(source)) projected.add(source);
                }
                for (const evidence of [config.script, config.record.fields["/compilerOptions/rootDir"], config.record.fields["/compilerOptions/outDir"]]) if (evidence) sources.push(evidence);
            }
            if (!projected.size) unresolvedTarget = true;
            for (const source of projected) paths.add(source);
        }
        return { paths: unresolvedTarget ? [] : [...paths], sources: [...new Map(sources.map(source => [source.path + source.pointer, source])).values()], reason: "self-package requires one selected export target or an explicit tsc project rootDir/outDir source projection" };
    };
}
