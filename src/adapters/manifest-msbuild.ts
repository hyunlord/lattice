import type { Source } from "../core/model.js";
import type { SourceInput } from "./types.js";
import { makeSource } from "./types.js";
import { diagnostic, directory, joinPath, sourceLine } from "./manifest-types.js";
import type { BuildManifestDiagnostic, ManifestDependency } from "./manifest-types.js";
type Event = { readonly kind: "property" | "import" | "reference" | "deferred"; readonly name: string; readonly value: string; readonly line: number; readonly condition: string; readonly sdk?: string; };
type Value = { readonly text: string; readonly sources: readonly Source[]; };
function attributes(text: string): ReadonlyMap<string, string> { return new Map([...text.matchAll(/([\w:]+)\s*=\s*(["'])(.*?)\2/gsu)].map(match => [match[1] ?? "", match[3] ?? ""])); }
function events(input: SourceInput): readonly Event[] {
    const text = input.text.replace(/<!--[\s\S]*?-->/gu, value => value.replace(/[^\n]/gu, " ")), stack: { name: string; condition: string; }[] = [], result: Event[] = [];
    for (const match of text.matchAll(/<(\/?)([\w:.-]+)\b([^>]*)>/gu)) {
        if (match[1]) { stack.pop(); continue; }
        const name = match[2] ?? "", attrs = attributes(match[3] ?? ""), condition = [...stack.map(item => item.condition), attrs.get("Condition") ?? ""].filter(Boolean).join(" && ");
        const line = sourceLine(input, match.index ?? 0), deferred = stack.some(item => item.name === "Target");
        if (deferred && name === "ProjectReference") result.push({ kind: "deferred", name, value: "", condition, line });
        else if (!deferred && name === "Import") result.push({ kind: "import", name, value: attrs.get("Project") ?? "", sdk: attrs.get("Sdk") ?? "", condition, line });
        else if (!deferred && name === "ProjectReference" && attrs.has("Include")) result.push({ kind: "reference", name, value: attrs.get("Include") ?? "", condition, line });
        else if (!deferred && stack.at(-1)?.name === "PropertyGroup") {
            const start = (match.index ?? 0) + match[0].length, end = text.indexOf("<", start);
            result.push({ kind: "property", name, value: match[0].endsWith("/>") ? "" : text.slice(start, end).trim(), condition, line });
        }
        if (!match[0].endsWith("/>")) stack.push({ name, condition: attrs.get("Condition") ?? "" });
    }
    return result;
}
function relative(from: string, to: string): string {
    const left = from.split("/").filter(Boolean), right = to.split("/").filter(Boolean); let same = 0;
    while (left[same] !== undefined && left[same] === right[same]) same++;
    return [...left.slice(same).map(() => ".."), ...right.slice(same)].join("/") || ".";
}
function expanded(text: string, properties: ReadonlyMap<string, Value>, builtin: ReadonlyMap<string, Value>, root: string): Value | undefined {
    if (/[@%]\(|[?*]/u.test(text)) return undefined;
    let missing = false; const sources: Source[] = [];
    let result = text.replace(/\$\(([A-Za-z_][\w]*)\)/gu, (_, key: string) => {
        const value = builtin.get(key) ?? properties.get(key); if (!value) { missing = true; return ""; }
        sources.push(...value.sources); return value.text;
    });
    // NormalizePath combines/canonicalizes; NormalizeDirectory also appends a separator.
    // https://learn.microsoft.com/en-us/visualstudio/msbuild/property-functions
    result = result.replace(/\$\(\[MSBuild\]::(NormalizeDirectory|NormalizePath)\(([^()]*)\)\)/gu, (_, method: string, argumentsText: string) => {
        const args = [...argumentsText.matchAll(/(['"])(.*?)\1/gu)].map(match => match[2] ?? "");
        if (!args.length || argumentsText.replace(/(['"])(.*?)\1/gu, "").replace(/[\s,]/gu, "")) { missing = true; return ""; }
        const path = joinPath(root, args.join("/")); if (path === undefined) { missing = true; return ""; }
        return relative(root, path) + (method === "NormalizeDirectory" ? "/" : "");
    });
    if (missing || /\$\(/u.test(result)) return undefined;
    return { text: result, sources };
}
function literalCondition(text: string, properties: ReadonlyMap<string, Value>, builtin: ReadonlyMap<string, Value>, root: string): boolean | undefined {
    if (!text) return true;
    const value = expanded(text, properties, builtin, root)?.text;
    const match = value?.match(/^(['"])(.*?)\1\s*(==|!=)\s*(['"])(.*?)\4$/u);
    if (!match) return undefined;
    const equal = (match[2] ?? "").toLowerCase() === (match[5] ?? "").toLowerCase();
    return match[3] === "==" ? equal : !equal;
}
/** Interpret literal declarations and explicitly recognized SDK defaults; never execute MSBuild. */
export function msbuildResolver(inputs: readonly SourceInput[], diagnostics: BuildManifestDiagnostic[]): (project: SourceInput) => readonly ManifestDependency[] {
    const byPath = new Map(inputs.map(input => [input.path, input])), parsed = new Map<string, readonly Event[]>();
    const getEvents = (input: SourceInput): readonly Event[] => { const cached = parsed.get(input.path); if (cached) return cached; const value = events(input); parsed.set(input.path, value); return value; };
    return project => {
        const root = directory(project.path), properties = new Map<string, Value>(), dependencies: ManifestDependency[] = [], active = new Set<string>();
        const sdk = project.text.match(/<Project\b[^>]*\bSdk\s*=\s*["']([^"']+)/u)?.[1] ?? "";
        // Microsoft.NET.Sdk/Sdk.props sets this before Directory.Build.props imports.
        // https://github.com/dotnet/sdk/blob/main/src/Tasks/Microsoft.NET.Build.Tasks/sdk/Sdk.props
        if (sdk.split(";").some(value => /^(?:Microsoft\.NET\.Sdk|Microsoft\.NET\.Sdk\.(?:Web|Razor|Worker|WindowsDesktop))(?:\/[^/]+)?$/u.test(value))) properties.set("UsingMicrosoftNETSdk", { text: "true", sources: [makeSource(project, "/sdk/Microsoft.NET.Sdk", 1)] });
        const applySdk = (name: string, source: Source): void => {
            if (name.split("/")[0] !== "Microsoft.DotNet.Arcade.Sdk" || properties.get("RepoRoot")?.text) return;
            let ancestor = root;
            for (; ;) {
                const global = byPath.get(`${ancestor ? ancestor + "/" : ""}global.json`);
                if (global) {
                    try {
                        const json: unknown = JSON.parse(global.text);
                        if (typeof json !== "object" || json === null || !("msbuild-sdks" in json)) return;
                        const sdks = json["msbuild-sdks"];
                        if (typeof sdks !== "object" || sdks === null || !("Microsoft.DotNet.Arcade.Sdk" in sdks) || typeof sdks["Microsoft.DotNet.Arcade.Sdk"] !== "string") return;
                        // Arcade RepoLayout.props default, conditional on an empty RepoRoot:
                        // https://github.com/dotnet/dotnet/blob/d1920aa3fa8523a7b8d04d6e442faccb0b0bb68e/src/arcade/src/Microsoft.DotNet.Arcade.Sdk/tools/RepoLayout.props#L9
                        properties.set("RepoRoot", { text: relative(root, ancestor) + "/", sources: [source, makeSource(global, "/msbuild-sdks/Microsoft.DotNet.Arcade.Sdk", sourceLine(global, global.text.indexOf("Microsoft.DotNet.Arcade.Sdk")))] });
                    } catch { diagnostic(global, diagnostics, "invalid-manifest", "Invalid SDK version manifest"); }
                    return;
                }
                if (!ancestor) return;
                ancestor = directory(ancestor);
            }
        };
        applySdk(sdk, makeSource(project, "/sdk", 1));
        const references: { input: SourceInput; event: Event; builtin: ReadonlyMap<string, Value>; }[] = [];
        const visit = (input: SourceInput): void => {
            if (active.has(input.path)) { diagnostic(input, diagnostics, "dynamic-manifest", "MSBuild import cycle is not evaluated"); return; }
            active.add(input.path);
            const builtin = new Map<string, Value>([
                ["MSBuildProjectDirectory", { text: ".", sources: [makeSource(project, "/build-property/MSBuildProjectDirectory", 1)] }],
                ["MSBuildProjectName", { text: project.path.split("/").at(-1)?.replace(/\.[^.]+$/u, "") ?? "", sources: [makeSource(project, "/build-property/MSBuildProjectName", 1)] }],
                ["MSBuildThisFileDirectory", { text: relative(root, directory(input.path)) + "/", sources: [makeSource(input, "/build-property/MSBuildThisFileDirectory", 1)] }],
            ]);
            for (const event of getEvents(input)) {
                let value = expanded(event.value, properties, builtin, root);
                if (!value && event.kind === "import") {
                    const lookup = event.value.match(/^\$\(\[MSBuild\]::GetPathOfFileAbove\(([^,()]+),\s*(.*?)\)\)$/u);
                    if (lookup) {
                        const filename = (lookup[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
                        const start = expanded((lookup[2] ?? "").trim().replace(/^['"]|['"]$/gu, ""), properties, builtin, root);
                        let ancestor = start ? joinPath(root, start.text) : undefined;
                        if (/^[\w.-]+$/u.test(filename)) while (ancestor !== undefined) {
                            const found = byPath.get(`${ancestor ? ancestor + "/" : ""}${filename}`);
                            if (found) { value = { text: relative(root, found.path), sources: [...(start?.sources ?? []), makeSource(found, "/ancestor-import", 1)] }; break; }
                            if (!ancestor) break;
                            ancestor = directory(ancestor);
                        }
                    }
                }
                const source = makeSource(input, `/${event.kind}/${event.name}`, event.line);
                const condition = literalCondition(event.condition, properties, builtin, root);
                switch (event.kind) {
                    case "property": {
                        if (condition === false) break;
                        if (condition === undefined || !value) properties.delete(event.name);
                        else properties.set(event.name, { text: value.text, sources: [...value.sources, source] });
                        break;
                    }
                    case "import": {
                        if (condition !== true || !value || !value.text) break;
                        if (event.sdk) { applySdk(event.sdk, source); break; }
                        const path = event.value.includes("$(") ? joinPath(root, value.text) : joinPath(directory(input.path), value.text);
                        const imported = path === undefined ? undefined : byPath.get(path); if (imported) visit(imported);
                        break;
                    }
                    case "reference": { references.push({ input, event, builtin }); break; }
                    case "deferred": { diagnostic(input, diagnostics, "dynamic-manifest", "Task-time ProjectReference needs target execution", event.line); break; }
                }
            }
            active.delete(input.path);
        };
        let ancestor = root;
        for (; ;) { const props = byPath.get(`${ancestor ? ancestor + "/" : ""}Directory.Build.props`); if (props) { visit(props); break; } if (!ancestor) break; ancestor = directory(ancestor); }
        visit(project);
        ancestor = root;
        for (; ;) { const targets = byPath.get(`${ancestor ? ancestor + "/" : ""}Directory.Build.targets`); if (targets) { visit(targets); break; } if (!ancestor) break; ancestor = directory(ancestor); }
        for (const { input, event, builtin } of references) {
            const value = expanded(event.value, properties, builtin, root), source = makeSource(input, `/${event.kind}/${event.name}`, event.line);
            if (!value) { diagnostic(input, diagnostics, "dynamic-manifest", `ProjectReference contains unresolved or computed properties: ${event.value}`, event.line); continue; }
            for (const target of value.text.split(";").filter(Boolean)) {
                const path = joinPath(root, target);
                if (path !== undefined) dependencies.push({ name: event.value, path, scope: event.condition ? "conditional" : "ProjectReference", line: event.line, condition: event.condition, source, evidence: value.sources });
            }
        }
        return dependencies;
    };
}
