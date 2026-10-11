import type { Source } from "../core/model.js";
import type { SourceInput } from "./types.js";
import { makeSource } from "./types.js";
export type BuildManifestDiagnostic = { readonly code: "dynamic-manifest" | "invalid-manifest" | "unresolved-package"; readonly path: string; readonly line: number; readonly message: string; readonly source: Source; };
export type ManifestDependency = { readonly name: string; readonly path?: string; readonly scope: string; readonly alias?: string; readonly optional?: boolean; readonly line: number; readonly source?: Source; readonly evidence?: readonly Source[]; readonly condition?: string; };
/** Mutable parser accumulator; exposed graph nodes remain immutable. */
export type ManifestPackage = { input: SourceInput; name: string; system: string; isTestAssembly?: boolean; workspaceManifest?: string; root: string; sourceRoots: string[]; description: string; entryTargets: string[]; importNames: string[]; dependencies: ManifestDependency[]; aliases: string[]; };
export function directory(path: string): string { return path.split("/").slice(0, -1).join("/"); }
export function joinPath(root: string, path: string): string | undefined {
    if (/^(?:\/|[A-Za-z]:)/u.test(path)) return undefined;
    const parts: string[] = [];
    for (const part of `${root}/${path.replaceAll("\\", "/")}`.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { if (!parts.length) return undefined; parts.pop(); } else parts.push(part);
    }
    return parts.join("/");
}
export function inside(path: string, root: string): boolean { return !root || path === root || path.startsWith(root + "/"); }
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> { return value !== null && typeof value === "object" && !Array.isArray(value); }
export function object(value: unknown): Readonly<Record<string, unknown>> | undefined { return isRecord(value) ? value : undefined; }
export function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
export function string(value: unknown): string { return typeof value === "string" ? value : ""; }
export function sourceLine(input: SourceInput, offset: number): number { return input.text.slice(0, offset).split("\n").length; }
export function diagnostic(input: SourceInput, diagnostics: BuildManifestDiagnostic[], code: BuildManifestDiagnostic["code"], message: string, line = 1): void { diagnostics.push({ code, path: input.path, line, message, source: makeSource(input, "/build-manifest", line) }); }
export function basePackage(input: SourceInput, system: string, name: string): ManifestPackage {
    const root = directory(input.path);
    return { input, name: name || root.split("/").at(-1) || system, system, root, sourceRoots: [root], description: "", entryTargets: [], importNames: name ? [name] : [], dependencies: [], aliases: [] };
}
export function jsonObject(input: SourceInput, diagnostics: BuildManifestDiagnostic[]): Readonly<Record<string, unknown>> | undefined {
    try { const value: unknown = JSON.parse(input.text); const result = object(value); if (result) return result; diagnostic(input, diagnostics, "invalid-manifest", "Manifest must contain an object"); }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; diagnostic(input, diagnostics, "invalid-manifest", "Manifest JSON cannot be parsed"); }
    return undefined;
}
export function globMatches(path: string, glob: string): boolean {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/gu, "\\$&").replace(/\*\*/gu, "\u0000").replace(/\*/gu, "[^/]*").replace(/\?/gu, "[^/]").replace(/\u0000/gu, ".*");
    return new RegExp(`^${escaped}/?$`, "u").test(path);
}
