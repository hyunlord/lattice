import type { SourceInput } from "./types.js";
import { diagnostic } from "./manifest-types.js";
import type { BuildManifestDiagnostic } from "./manifest-types.js";
export type TomlEntry = { readonly section: string; readonly key: string; readonly value: unknown; readonly line: number; };
function parts(text: string, delimiter: string): string[] {
    const result: string[] = []; let start = 0, depth = 0, quote = "", escape = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i] ?? "";
        if (escape) { escape = false; continue; }
        if (quote) { if (char === "\\" && quote === '"') escape = true; else if (char === quote) quote = ""; continue; }
        if (char === '"' || char === "'") quote = char;
        else if (char === "[" || char === "{") depth++;
        else if (char === "]" || char === "}") depth--;
        else if (char === delimiter && depth === 0) { result.push(text.slice(start, i).trim()); start = i + 1; }
    }
    result.push(text.slice(start).trim()); return result.filter(Boolean);
}
export function tomlValue(text: string): unknown {
    const value = text.trim();
    if ((value.startsWith('"""') && value.endsWith('"""')) || (value.startsWith("'''") && value.endsWith("'''"))) return value.slice(3, -3).trim();
    if (value.startsWith('"') && value.endsWith('"')) { try { const parsed: unknown = JSON.parse(value); return parsed; } catch (error) { if (!(error instanceof SyntaxError)) throw error; return undefined; } }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
    if (value.startsWith("[") && value.endsWith("]")) return parts(value.slice(1, -1), ",").map(tomlValue);
    if (value.startsWith("{") && value.endsWith("}")) return Object.fromEntries(parts(value.slice(1, -1), ",").flatMap(item => {
        const match = /^([^=]+)=(.*)$/su.exec(item); return match ? [[match[1]?.trim().replace(/^['"]|['"]$/gu, "") ?? "", tomlValue(match[2] ?? "")]] : [];
    }));
    if (value === "true") return true; if (value === "false") return false;
    if (/^[+-]?\d+(?:\.\d+)?$/u.test(value)) return Number(value);
    return undefined;
}
function stripComment(line: string): string {
    let quote = "", escape = false;
    for (let i = 0; i < line.length; i++) { const c = line[i]; if (escape) { escape = false; continue; } if (quote) { if (c === "\\" && quote === '"') escape = true; else if (c === quote) quote = ""; } else if (c === '"' || c === "'") quote = c; else if (c === "#") return line.slice(0, i); }
    return line;
}
export function tomlEntries(input: SourceInput, diagnostics: BuildManifestDiagnostic[]): TomlEntry[] {
    const entries: TomlEntry[] = [], lines = input.text.split("\n"); let section = "", arraySection = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = stripComment(lines[i] ?? "").trim(); if (!line) continue;
        const heading = /^\[(\[?)(.+?)\]\]?$/u.exec(line);
        if (heading) { section = (heading[2] ?? "").replaceAll('"', "").replaceAll("'", ""); if (heading[1]) section += `#${arraySection++}`; continue; }
        const assignment = /^([^=]+)=(.*)$/u.exec(line); if (!assignment) continue;
        const firstLine = i + 1; let raw = (assignment[2] ?? "").trim();
        while (tomlValue(raw) === undefined && i + 1 < lines.length && /^(?:\[|\{|"""|''')/u.test(raw)) { i++; raw += "\n" + stripComment(lines[i] ?? ""); }
        const value = tomlValue(raw), key = (assignment[1] ?? "").trim().replace(/^['"]|['"]$/gu, "");
        if (value === undefined) diagnostic(input, diagnostics, "dynamic-manifest", `Unsupported manifest value: ${section}.${key}`, firstLine);
        else entries.push({ section, key, value, line: firstLine });
    }
    return entries;
}
export function tomlGet(entries: readonly TomlEntry[], section: string, key: string): unknown { return entries.find(entry => entry.section === section && entry.key === key)?.value; }
