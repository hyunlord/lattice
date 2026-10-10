import type { JsonObject } from "../core/canonical.js";
import type { CodeToken } from "./code-tokens.js";
import { publicDeclaration, publicTypeDocumentation } from "./code-descriptions.js";
import { codeTokens } from "./code-tokens.js";
import { nativeTokens } from "./native-tokens.js";
import type { SourceInput } from "./types.js";

export function declarationTokens(text: string, language: string): readonly CodeToken[] {
    const normalized = text.replace(/\r\n|\r/gu, "\n");
    return (["python", "gdscript"].includes(language) ? codeTokens(normalized, true) : ["javascript", "typescript"].includes(language) ? codeTokens(normalized, false) : nativeTokens(normalized, language === "rust", { language })).filter(token => token.kind !== "string" && token.kind !== "newline");
}
function close(tokens: readonly CodeToken[], start: number, opening: string, ending: string): number {
    let depth = 0;
    for (let index = start; index < tokens.length; index++) {
        if (tokens[index]?.value === opening) depth++;
        else if (tokens[index]?.value === ending && --depth === 0) return index;
    }
    return start;
}
export function codeDeclarations(input: SourceInput, language: string): readonly JsonObject[] {
    const supported = ["csharp", "rust", "go", "java", "kotlin", "swift", "gdscript", "javascript", "typescript", "python"];
    if (!supported.includes(language)) return [];
    const tokens = declarationTokens(input.text, language), lines = input.text.split(/\r\n|\r|\n/u), declarations: JsonObject[] = [];
    const occurrences = new Map<string, number>();
    for (const token of tokens) if (token.kind === "word") occurrences.set(token.value, (occurrences.get(token.value) ?? 0) + 1);
    const typeWords = ["class", "class_name", "struct", "interface", "enum", "trait", "protocol", "record", "union", "typealias"];
    let functionEnd = -1;
    const typeOwners: { readonly name: string; readonly end: number; }[] = [];
    for (let index = 0; index < tokens.length; index++) {
        if (index <= functionEnd) continue;
        while (typeOwners.length && index > (typeOwners.at(-1)?.end ?? -1)) typeOwners.pop();
        const token = tokens[index];
        if (!token || token.kind !== "word") continue;
        if (language === "go" && token.value === "type" && tokens[index + 1]?.value === "(") {
            const groupEnd = close(tokens, index + 1, "(", ")");
            if (groupEnd <= index + 1) continue;
            let cursor = index + 2;
            while (cursor < groupEnd) {
                const name = tokens[cursor];
                if (name?.kind !== "word") { cursor++; continue; }
                const nameIndex = cursor++;
                while (cursor < groupEnd) {
                    const current = tokens[cursor], previous = tokens[cursor - 1];
                    if (current?.value === ";") break;
                    if (cursor > nameIndex + 1 && (current?.line ?? 0) > (previous?.line ?? 0) && !["=", ",", "|"].includes(previous?.value ?? "")) break;
                    const closing = current?.value === "{" ? "}" : current?.value === "[" ? "]" : current?.value === "(" ? ")" : undefined;
                    if (closing) {
                        const boundary = close(tokens, cursor, current?.value ?? "", closing);
                        if (boundary > cursor && boundary < groupEnd) { cursor = boundary + 1; continue; }
                    }
                    cursor++;
                }
                declarations.push({ name: name.value, kind: "type", line: name.line, endLine: tokens[cursor - 1]?.line ?? name.line, public: publicDeclaration(tokens, nameIndex, language), uses: Math.max(0, (occurrences.get(name.value) ?? 1) - 1) });
                if (tokens[cursor]?.value === ";") cursor++;
            }
            index = groupEnd;
            continue;
        }
        let nameIndex = index + 1, kind = "";
        if (typeWords.includes(token.value) || (language === "kotlin" && token.value === "object")) {
            kind = "type";
            if (["record", "enum"].includes(token.value) && ["class", "struct"].includes(tokens[nameIndex]?.value ?? "")) nameIndex++;
        } else if (token.value === "type" && ["go", "typescript", "rust"].includes(language)) kind = "type";
        else if (["fn", "fun", "func", "def", "function"].includes(token.value)) {
            kind = "function";
            if (language === "go" && tokens[nameIndex]?.value === "(") nameIndex = close(tokens, nameIndex, "(", ")") + 1;
            if (tokens[nameIndex]?.value === "*") nameIndex++;
            if (language === "kotlin") {
                let cursor = nameIndex;
                while (cursor < tokens.length && !["(", "{", ";", "="].includes(tokens[cursor]?.value ?? "")) cursor++;
                if (tokens[cursor]?.value === "(" && tokens[cursor - 1]?.kind === "word") nameIndex = cursor - 1;
            }
        } else if (["csharp", "java"].includes(language) && tokens[index + 1]?.value === "(" && tokens[index - 1]?.kind === "word" && !["new", "return", "throw", "await"].includes(tokens[index - 1]?.value ?? "")) {
            kind = "function"; nameIndex = index;
        }
        const name = tokens[nameIndex];
        if (!kind || name?.kind !== "word" || ["if", "for", "while", "switch", "catch", "using", "lock"].includes(name.value)) continue;
        let end = nameIndex;
        if (["python", "gdscript"].includes(language)) {
            const indent = /^\s*/u.exec(lines[token.line - 1] ?? "")?.[0].length ?? 0;
            let lastLine = token.line;
            for (let line = token.line; line < lines.length; line++) {
                const source = lines[line] ?? "";
                if (!source.trim() || source.trim().startsWith("#")) continue;
                if ((/^\s*/u.exec(source)?.[0].length ?? 0) <= indent) break;
                lastLine = line + 1;
            }
            while ((tokens[end + 1]?.line ?? Infinity) <= lastLine) end++;
        } else {
            let cursor = nameIndex + 1;
            if (kind === "function") {
                while (cursor < tokens.length && !["(", ";", "{"].includes(tokens[cursor]?.value ?? "")) cursor++;
                if (tokens[cursor]?.value !== "(") continue;
                cursor = close(tokens, cursor, "(", ")") + 1;
            }
            while (cursor < tokens.length && !["{", ";", "="].includes(tokens[cursor]?.value ?? "") && (tokens[cursor]?.line ?? 0) <= token.line + 8) {
                if ((tokens[cursor]?.line ?? 0) > token.line && [...typeWords, "fn", "fun", "func", "def", "function"].includes(tokens[cursor]?.value ?? "")) break;
                cursor++;
            }
            if (tokens[cursor]?.value === "{") end = close(tokens, cursor, "{", "}");
            else if ([";", "="].includes(tokens[cursor]?.value ?? "")) end = cursor;
            else end = nameIndex;
            if (kind === "function" && tokens[cursor]?.value === ";" && !["csharp", "java", "typescript", "rust"].includes(language)) continue;
        }
        declarations.push({ name: name.value, kind, ...(language === "java" && kind === "type" ? { qualifiedName: [...typeOwners.map(owner => owner.name), name.value].join(".") } : {}), line: token.line, endLine: tokens[end]?.line ?? token.line, public: publicDeclaration(tokens, nameIndex, language), uses: Math.max(0, (occurrences.get(name.value) ?? 1) - 1) });
        if (language === "java" && kind === "type") typeOwners.push({ name: name.value, end });
        if (kind === "function") functionEnd = end;
        index = nameIndex;
    }
    return publicTypeDocumentation(lines, language, declarations);
}
