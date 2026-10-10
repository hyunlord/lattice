import { entryPoints, javascriptEvidence } from "./code-evidence.js";
import { descriptiveProse } from "./description-prose.js";
import type { JsonObject } from "../core/canonical.js";
import type { CodeToken } from "./code-tokens.js";

/** Lexical visibility, not a compiler claim about reachable public API. */
export function publicDeclaration(tokens: readonly CodeToken[], index: number, language: string): boolean {
    const name = tokens[index]?.value ?? "";
    const prefix: string[] = [];
    for (let cursor = index - 1; cursor >= 0; cursor--) {
        const token = tokens[cursor];
        if (!token || ["{", "}", ";"].includes(token.value) || token.line < (tokens[index]?.line ?? 0) - 2) break;
        if (token.line < (tokens[index]?.line ?? 0) && !["public", "private", "internal", "protected", "pub", "export", "open", "static", "async", "abstract", "sealed", "final"].includes(token.value)) break;
        prefix.unshift(token.value);
    }
    switch (language) {
        case "go": return /^[A-Z]/u.test(name);
        case "python": case "gdscript": return !name.startsWith("_");
        case "rust": return prefix.includes("pub") && prefix[prefix.indexOf("pub") + 1] !== "(";
        case "csharp": case "java": return prefix.includes("public");
        case "swift": return prefix.includes("public") || prefix.includes("open");
        case "kotlin": return !prefix.some(value => ["private", "internal", "protected"].includes(value));
        case "typescript": case "javascript": return prefix.includes("export") && !prefix.includes("private");
        default: return false;
    }
}

function sentence(value: string): string {
    const clean = value.replace(/\{@(?:code|literal)\s+([^}]+)\}/gu, "$1").replace(/<see\s+cref=["']([^"']+)["']\s*\/>/gu, "$1").replace(/\{@(?:link|linkplain)\s+([^}]+)\}/gu, (_match, target: string) => target.trim().replace(/^\S+\s+(.+)$/u, "$1")).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
    return (/^.*?[.!?](?:\s|$)/u.exec(clean)?.[0] ?? clean).trim().slice(0, 320);
}

/** Script documentation only; imports and declarations remain explicitly unsupported. */
function scriptDescription(text: string): JsonObject | undefined {
    const lines = text.split(/\r\n|\r|\n/u);
    for (let index = 0; index < Math.min(lines.length, 120); index++) {
        const raw = (lines[index] ?? "").trim();
        if (!raw || raw.startsWith("#!")) continue;
        if (!raw.startsWith("#")) return undefined;
        const content = raw.replace(/^#+\s?/u, "");
        if (!content || /^(?:frozen_string_literal|encoding|coding|warn_indent|typed|shellcheck)\s*[:=]/u.test(content)) continue;
        const start = index;
        const parts = [content];
        while (index + 1 < lines.length && /^\s*#\s*\S/u.test(lines[index + 1] ?? "")) {
            index++;
            parts.push((lines[index] ?? "").trim().replace(/^#+\s?/u, ""));
        }
        const body = parts.join(" ");
        if (!descriptiveProse(body)) continue;
        const summary = sentence(body);
        if (summary.split(/\s+/u).length >= 3) return { text: summary, kind: "module-doc", line: start + 1, endLine: index + 1 };
    }
    return undefined;
}

/** Only header documentation is eligible; comments inside implementation are not purpose statements. */
export function sourceDescription(text: string, language: string): JsonObject | undefined {
    if (language === "shell" || language === "ruby") return scriptDescription(text);
    if (!["python", "gdscript", "go", "rust", "csharp", "java", "kotlin", "swift", "typescript", "javascript"].includes(language)) return undefined;
    const lines = text.split(/\r\n|\r|\n/u);
    let cursor = 0;
    while (cursor < Math.min(lines.length, 120)) {
        const line = (lines[cursor] ?? "").trim();
        if (!line || line.startsWith("#!") || /^#.*coding[:=]/u.test(line)) { cursor++; continue; }
        if (!["python", "gdscript"].includes(language) && line.startsWith("#")) { cursor++; continue; }
        const start = cursor;
        const parts: string[] = [];
        if (language === "python" && /^(?:[ru])?(?:"""|''')/iu.test(line)) {
            const marker = line.includes('"""') ? '"""' : "'''";
            let part = line.slice(line.indexOf(marker) + 3);
            while (true) {
                const ending = part.indexOf(marker);
                parts.push(ending < 0 ? part : part.slice(0, ending));
                if (ending >= 0 || ++cursor >= lines.length) break;
                part = lines[cursor] ?? "";
            }
        } else if (line.startsWith("/*")) {
            let part = line.replace(/^\/\*+!?/u, "");
            while (true) {
                const ending = part.indexOf("*/");
                parts.push((ending < 0 ? part : part.slice(0, ending)).replace(/^\s*\* ?/u, ""));
                if (ending >= 0 || ++cursor >= lines.length) break;
                part = lines[cursor] ?? "";
            }
        } else if (/^(?:\/\/|#)/u.test(line)) {
            while (cursor < lines.length && /^(?:\/\/|#)/u.test((lines[cursor] ?? "").trim())) {
                parts.push((lines[cursor] ?? "").trim().replace(/^(?:\/{2,3}!?|#{1,2})\s?/u, ""));
                cursor++;
            }
            cursor--;
        } else if (/^(?:package |namespace )[^;{}]+;?$/u.test(line)) { cursor++; continue; }
        else return undefined;
        cursor++;
        const next = lines.slice(cursor).find(value => value.trim() && !(language === "java" && /^\s*@\w+(?:\.\w+)*(?:\([^)]*\))?\s*$/u.test(value)))?.trim() ?? "";
        const directive = (part: string): boolean => /^(?:eslint-(?:disable|enable)|@ts-(?:check|nocheck|ignore|expect-error)|prettier-ignore|biome-ignore|ruff:|pylint:|nolint\b|go:|ReSharper\s+(?:disable|restore)|noinspection\b)/iu.test(part.trim()) || (/^(?:import |from |using )/u.test(next) && /^(?:types?\s+only|type-only(?:\s+imports?)?|imports?\s+only)[!.\s]*$/iu.test(part.trim()));
        const prose = parts.map((part, index) => ({ part, index })).filter(({ part, index }) => !directive(part) && !/^\s*[-=]{3,}\s*$/u.test(part) && !/^\s*[-=]{3,}\s*$/u.test(parts[index + 1] ?? ""));
        const content = prose.map(value => value.part).join(" ");
        if (!descriptiveProse(content)) continue;
        const summary = sentence(content);
        const filteredDirective = parts.some(directive);
        const substantive = prose.filter(value => value.part.trim());
        const firstLine = filteredDirective ? start + (substantive[0]?.index ?? 0) + 1 : start + 1;
        const lastLine = filteredDirective ? start + (substantive[substantive.length - 1]?.index ?? 0) + 1 : cursor;
        const moduleDoc = (language === "python" && /^(?:[ru])?(?:"""|''')/iu.test(line)) || line.startsWith("//!") || line.startsWith("/*!") || /@(?:module|fileoverview|file)\b/u.test(content) || /^(?:package |namespace |import |from |using |use |extern )/u.test(next);
        if (summary && /[\p{L}]/u.test(summary)) return { text: summary, kind: moduleDoc ? "module-doc" : "declaration-doc", line: firstLine, endLine: lastLine };
    }
    return undefined;
}

export function descriptionAttributes(text: string, language: string, definitions: readonly JsonObject[]): JsonObject {
    const description = sourceDescription(text, language);
    const counts = new Map<string, number>();
    for (const value of definitions) {
        const name = String(value["name"] ?? "");
        counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const seen = new Set<string>();
    const names = definitions.filter(value => {
        const name = String(value["name"] ?? "");
        if (value["public"] !== true || seen.has(name)) return false;
        seen.add(name); return true;
    }).map(value => ({ name: String(value["name"] ?? ""), uses: Math.max(0, Number(value["uses"] ?? 0) - (counts.get(String(value["name"] ?? "")) ?? 1) + 1), line: value["line"] ?? 1 }));
    const evidence = ["javascript", "typescript"].includes(language) ? javascriptEvidence(text) : { exports: [], verificationNames: [] };
    for (const value of evidence.exports) {
        const name = String(value["name"] ?? "");
        if (!seen.has(name)) { seen.add(name); names.push({ name, uses: Number(value["uses"] ?? 0), line: value["line"] ?? 1 }); }
    }
    names.sort((a, b) => Number(b.uses) - Number(a.uses) || String(a.name).localeCompare(String(b.name)));
    return { ...(description ? { sourceDescription: description } : {}), publicNames: names.slice(0, 3), entryPoints: entryPoints(text, language, definitions), verificationNames: evidence.verificationNames };
}


/** Public type prose is attributed to its declaration, never promoted to module documentation. */
export function publicTypeDocumentation(lines: readonly string[], language: string, definitions: readonly JsonObject[]): readonly JsonObject[] {
    const selected = new Set(definitions.filter(value => value["kind"] === "type" && value["public"] === true)
        .sort((a, b) => Number(b["uses"] ?? 0) - Number(a["uses"] ?? 0) || String(a["name"]).localeCompare(String(b["name"]))).slice(0, 3));
    return definitions.map(definition => {
        if (!selected.has(definition)) return definition;
        const escapedName = String(definition["name"] ?? "").replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const modifiers = "(?:(?:public|export|default|internal|protected|private|abstract|final|sealed|static|partial|open|data|value|inline|pub)\\s+)*";
        const typePrefix = language === "go" ? "(?:type\\s+)?" : `${modifiers}(?:class|struct|interface|enum|trait|protocol|record|union|typealias|type|object)(?:\\s+(?:class|struct))?\\s+`;
        const declarationLine = lines[Number(definition["line"] ?? 1) - 1] ?? "";
        if (!new RegExp(`^\\s*${typePrefix}${escapedName}\\b`, "u").test(declarationLine)) return definition;

        let cursor = Number(definition["line"] ?? 1) - 2;
        const lower = Math.max(0, cursor - 255);
        while (cursor >= lower && ((language === "java" && /^\s*@\w+(?:\.\w+)*(?:\([^)]*\))?\s*$/u.test(lines[cursor] ?? "")) || (language === "csharp" && /^\s*\[[^\]]+\]\s*$/u.test(lines[cursor] ?? "")))) cursor--;
        const end = cursor;
        const last = (lines[cursor] ?? "").trim();
        const parts: string[] = [];
        if (last.endsWith("*/")) {
            while (cursor >= lower) {
                const line = (lines[cursor] ?? "").trim();
                parts.unshift(line);
                if (line.startsWith("/**") || (language === "go" && line.startsWith("/*"))) break;
                if (line.includes("/*")) return definition;
                cursor--;
            }
            if (cursor < lower) return definition;
        } else {
            const marker = language === "go" ? /^\s*\/\//u : /^\s*\/\/\//u;
            while (cursor >= lower && marker.test(lines[cursor] ?? "")) { parts.unshift(lines[cursor] ?? ""); cursor--; }
            cursor++;
            if (!parts.length || (cursor === lower && marker.test(lines[cursor - 1] ?? ""))) return definition;
        }
        const body = parts.map(part => part.trim().replace(/^\/\*+|\*\/$/gu, "").replace(/^(?:\/{2,3}|\*)\s?/u, "")).join(" ");
        if (!descriptiveProse(body)) return definition;
        const text = sentence(body);
        if (!text || /^@|^<inheritdoc\b/iu.test(text)) return definition;
        return { ...definition, declarationDescription: { text, kind: "type-doc", line: cursor + 1, endLine: end + 1 } };
    });
}
