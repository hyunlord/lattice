import { extractJson } from "./json.js";
import { DataInputError } from "./types.js";
import type { SourceInput, ExtractedRecord } from "./types.js";

export function configDirectory(path: string): string { return path.split("/").slice(0, -1).join("/"); }
export function resolveConfigPath(directory: string, relative: string): string | undefined {
    if (relative.startsWith("/") || /[\\:\u0000-\u001f]/u.test(relative)) return undefined;
    const parts = directory ? directory.split("/") : [];
    for (const part of relative.split("/")) {
        if (!part || part === ".") continue;
        if (part === "..") { if (!parts.length) return undefined; parts.pop(); }
        else parts.push(part);
    }
    return parts.join("/");
}
export function isTypeScriptConfig(path: string): boolean { return /^tsconfig(?:\..+)?\.json$/u.test(path.split("/").at(-1) ?? ""); }

/** JSONC configuration syntax keeps original offsets and source hashes. Ordinary data stays strict JSON. */
export function extractTypeScriptConfig(input: SourceInput, pointer = ""): readonly ExtractedRecord[] {
    const characters = input.text.split("");
    const blank = (start: number, end: number): void => { for (let index = start; index < end; index++) if (!/[\r\n]/u.test(characters[index] ?? "")) characters[index] = " "; };
    let quoted = false;
    for (let index = 0; index < characters.length; index++) {
        const value = characters[index];
        if (quoted) { if (value === "\\") index++; else if (value === '"') quoted = false; continue; }
        if (value === '"') { quoted = true; continue; }
        if (value === "/" && characters[index + 1] === "/") {
            let end = index + 2; while (end < characters.length && !/[\r\n]/u.test(characters[end] ?? "")) end++;
            blank(index, end); index = end - 1;
        } else if (value === "/" && characters[index + 1] === "*") {
            let end = index + 2; while (end < characters.length && !(characters[end] === "*" && characters[end + 1] === "/")) end++;
            if (end === characters.length) throw new DataInputError(input.path, input.text.slice(0, index).split(/\r\n|\r|\n/u).length, "unterminated configuration comment");
            blank(index, end + 2); index = end + 1;
        }
    }
    quoted = false;
    for (let index = 0; index < characters.length; index++) {
        const value = characters[index];
        if (quoted) { if (value === "\\") index++; else if (value === '"') quoted = false; continue; }
        if (value === '"') quoted = true;
        else if (value === ",") {
            let next = index + 1; while (/\s/u.test(characters[next] ?? "")) next++;
            if (characters[next] === "}" || characters[next] === "]") characters[index] = " ";
        }
    }
    return extractJson({ ...input, text: characters.join("") }, pointer);
}

/** Discover only selected local bases; this never opens additional repository files. */
export function typeScriptConfigPaths(inputs: readonly SourceInput[]): ReadonlySet<string> {
    const selected = new Map(inputs.filter(input => input.path.endsWith(".json")).map(input => [input.path, input]));
    const paths = new Set([...selected.keys()].filter(isTypeScriptConfig));
    for (const path of paths) {
        const input = selected.get(path); if (!input) continue;
        let records: readonly ExtractedRecord[];
        try { records = extractTypeScriptConfig(input); } catch (error) { if (error instanceof DataInputError) continue; throw error; }
        const base = records[0]?.node.attributes["extends"];
        if (typeof base !== "string" || !base.startsWith(".")) continue;
        const resolved = resolveConfigPath(configDirectory(path), base.endsWith(".json") ? base : `${base}.json`);
        if (resolved !== undefined && selected.has(resolved)) paths.add(resolved);
    }
    return paths;
}
