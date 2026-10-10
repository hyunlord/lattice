import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import { matchesGlob } from "../lens/index.js";
import type { CodeModule, ModuleImport } from "./code.js";
import { codeLanguage } from "./code.js";
import type { ExtractedRecord } from "./types.js";
import { pointerToken } from "./types.js";
import { configDirectory, isTypeScriptConfig, resolveConfigPath } from "./typescript-config.js";

type Setting = { readonly value: JsonValue; readonly record: ExtractedRecord; readonly pointer: string; };
type Config = { readonly record: ExtractedRecord; readonly options: ReadonlyMap<string, Setting>; readonly scope: ReadonlyMap<string, Setting>; readonly evidence: readonly Source[]; readonly error?: string; };
type Resolution = { readonly paths: readonly string[]; readonly sources: readonly Source[]; readonly reason: string; readonly diagnosticCode?: "unresolved-configuration" | "ambiguous-module"; };
function object(value: JsonValue | undefined): value is JsonObject { return value !== null && typeof value === "object" && !Array.isArray(value); }
function file(record: ExtractedRecord): string { return record.node.sources[0]?.path ?? ""; }
function within(path: string, directory: string): boolean { return !directory || path.startsWith(directory + "/"); }
function evidence(setting: Setting | undefined): readonly Source[] { const source = setting?.record.fields[setting.pointer]; return source ? [source] : []; }
function unique(sources: readonly Source[]): readonly Source[] { return [...new Map(sources.map(source => [source.path + source.pointer, source])).values()]; }
function strings(setting: Setting | undefined): readonly string[] | undefined { return Array.isArray(setting?.value) && setting.value.every(value => typeof value === "string") ? setting.value : undefined; }
function patterns(setting: Setting | undefined, path: string): readonly Source[] {
    const values = strings(setting); if (!setting || !values) return [];
    return values.flatMap((value, index) => {
        const normalized = resolveConfigPath(configDirectory(file(setting.record)), value);
        if (normalized === undefined) return [];
        const pattern = /[*?]/u.test(normalized) || /\.[^/]+$/u.test(normalized) ? normalized : normalized ? normalized + "/**/*" : "**/*";
        const matched = matchesGlob(path, pattern);
        const source = setting.record.fields[`${setting.pointer}/${index}`];
        return matched && source ? [source] : [];
    });
}
function scope(config: Config, path: string): readonly Source[] | undefined {
    const files = config.scope.get("files"), include = config.scope.get("include"), exclude = config.scope.get("exclude");
    const named = strings(files)?.flatMap((value, index) => {
        const source = files?.record.fields[`${files.pointer}/${index}`];
        return resolveConfigPath(configDirectory(file(files?.record ?? config.record)), value) === path && source ? [source] : [];
    }) ?? [];
    if (named.length) return named;
    if (patterns(exclude, path).length || /(?:^|\/)(?:node_modules|bower_components|jspm_packages)\//u.test(path)) return undefined;
    if (include) { const matching = patterns(include, path); return matching.length ? matching : undefined; }
    if (files) return undefined;
    const output = config.options.get("outDir");
    const outputPath = typeof output?.value === "string" ? resolveConfigPath(configDirectory(file(output.record)), output.value) : undefined;
    if (outputPath && within(path, outputPath)) return undefined;
    return within(path, configDirectory(file(config.record))) ? config.record.node.sources : undefined;
}
function selectedCandidates(path: string, selected: ReadonlySet<string>): readonly string[] {
    if (selected.has(path)) return [path];
    if (/\.[mc]?js$/u.test(path)) {
        const replacement = path.endsWith(".mjs") ? ".mts" : path.endsWith(".cjs") ? ".cts" : ".ts";
        return [path.replace(/\.[mc]?js$/u, replacement), ...(path.endsWith(".js") ? [path.slice(0, -3) + ".tsx"] : [])].filter(candidate => selected.has(candidate));
    }
    if (codeLanguage(path) !== undefined) return [];
    return ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"].flatMap(extension => [`${path}.${extension}`, `${path}/index.${extension}`]).filter(candidate => selected.has(candidate));
}
function match(pattern: string, specifier: string): string | undefined {
    const star = pattern.indexOf("*");
    if (star < 0) return pattern === specifier ? "" : undefined;
    const suffix = pattern.slice(pattern.lastIndexOf("*") + 1);
    return specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(suffix) && specifier.length >= star + suffix.length ? specifier.slice(star, specifier.length - suffix.length) : undefined;
}
export function typeScriptPathsResolver(modules: readonly CodeModule[], records: readonly ExtractedRecord[]) {
    const metadata = new Map(records.filter(record => record.node.sources[0]?.pointer === "").map(record => [file(record), record]));
    const entries = [...metadata.keys()].filter(isTypeScriptConfig);
    const selected = new Set(modules.flatMap(module => module.node.sources[0] ? [module.node.sources[0].path] : []));
    const cache = new Map<string, Config>();
    const load = (path: string, stack: ReadonlySet<string> = new Set()): Config | undefined => {
        const cached = cache.get(path); if (cached) return cached;
        const record = metadata.get(path); if (!record) return undefined;
        if (stack.has(path)) return { record, options: new Map(), scope: new Map(), evidence: record.node.sources, error: `configuration extends cycle at ${path}` };
        const base = record.node.attributes["extends"];
        let inherited: Config | undefined, error: string | undefined;
        if (base !== undefined) {
            const resolved = typeof base === "string" && base.startsWith(".") ? resolveConfigPath(configDirectory(path), base.endsWith(".json") ? base : `${base}.json`) : undefined;
            inherited = resolved ? load(resolved, new Set([...stack, path])) : undefined;
            error = inherited?.error ?? (inherited ? undefined : `configuration extends is not a selected local config: ${typeof base === "string" ? base : path}`);
        }
        const options = new Map(inherited?.options), scope = new Map(inherited?.scope);
        const own = record.node.attributes["compilerOptions"];
        if (object(own)) for (const [key, value] of Object.entries(own)) options.set(key, { value, record, pointer: `/compilerOptions/${pointerToken(key)}` });
        for (const key of ["files", "include", "exclude"]) { const value = record.node.attributes[key]; if (value !== undefined) scope.set(key, { value, record, pointer: `/${key}` }); }
        const result: Config = { record, options, scope, evidence: [...(inherited?.evidence ?? []), ...(record.fields["/extends"] ? [record.fields["/extends"]] : [])], ...(error ? { error } : {}) };
        cache.set(path, result); return result;
    };
    return (module: CodeModule, reference: ModuleImport): Resolution | undefined => {
        if (!["typescript", "javascript"].includes(module.language) || reference.specifier.startsWith(".")) return undefined;
        const path = module.node.sources[0]?.path ?? "";
        const candidates = entries.filter(entry => within(path, configDirectory(entry))).sort((a, b) => configDirectory(b).length - configDirectory(a).length);
        const directory = candidates[0] === undefined ? undefined : configDirectory(candidates[0]);
        if (directory === undefined) return undefined;
        const local = candidates.filter(entry => configDirectory(entry) === directory);
        const canonical = local.find(entry => entry.split("/").at(-1) === "tsconfig.json");
        const configs = (canonical ? [canonical] : local).flatMap(entry => {
            const config = load(entry); if (!config || !object(config.options.get("paths")?.value)) return [];
            const sources = scope(config, path); return config.error || sources ? [{ config, sources: sources ?? [] }] : [];
        });
        if (!configs.length) return undefined;
        if (configs.length > 1) return { paths: [], sources: configs.flatMap(item => item.config.record.node.sources), reason: "configuration selection is ambiguous between named configs", diagnosticCode: "ambiguous-module" };
        const active = configs[0]; if (!active) return undefined;
        const { config } = active;
        const sources = [...config.evidence, ...active.sources];
        const setting = config.options.get("paths");
        if (!setting || !object(setting.value)) return undefined;
        const matches = Object.keys(setting.value).filter(pattern => match(pattern, reference.specifier) !== undefined).sort((a, b) => Number(b === reference.specifier) - Number(a === reference.specifier) || (b.split("*")[0]?.length ?? 0) - (a.split("*")[0]?.length ?? 0) || b.length - a.length);
        const pattern = matches[0]; if (pattern === undefined) return undefined;
        if (config.error) return { paths: [], sources: unique([...sources, ...config.record.node.sources, ...evidence(setting)]), reason: config.error, diagnosticCode: "unresolved-configuration" };
        const pointer = `${setting.pointer}/${pointerToken(pattern)}`;
        const patternSource = setting.record.fields[pointer]; if (patternSource) sources.push(patternSource);
        const values = setting.value[pattern];
        if ((pattern.match(/\*/gu)?.length ?? 0) > 1 || !Array.isArray(values) || !values.every(value => typeof value === "string" && (value.match(/\*/gu)?.length ?? 0) <= 1 && (pattern.includes("*") || !value.includes("*")))) return { paths: [], sources: unique(sources), reason: "configuration paths supports exact or single-wildcard string targets" };
        const baseUrl = config.options.get("baseUrl");
        const root = typeof baseUrl?.value === "string" ? resolveConfigPath(configDirectory(file(baseUrl.record)), baseUrl.value) : baseUrl === undefined ? configDirectory(file(setting.record)) : undefined;
        sources.push(...evidence(baseUrl));
        if (root === undefined) return { paths: [], sources: unique(sources), reason: "configuration baseUrl is not a repository-relative path" };
        const paths = values.flatMap((value, index) => {
            const source = setting.record.fields[`${pointer}/${index}`]; if (source) sources.push(source);
            const target = resolveConfigPath(root, value.replace("*", match(pattern, reference.specifier) ?? ""));
            return target === undefined ? [] : selectedCandidates(target, selected);
        });
        return { paths: [...new Set(paths)], sources: unique(sources), reason: "configuration paths requires one selected module target" };
    };
}
