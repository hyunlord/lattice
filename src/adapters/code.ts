import { descriptionAttributes } from "./code-descriptions.js";
import type { NodeDraft, Source } from "../core/model.js";
import type { JsonObject } from "../core/canonical.js";
import { makeSource, validateSourceInput } from "./types.js";
import type { SourceInput } from "./types.js";
import { codeTokens } from "./code-tokens.js";
import type { CodeToken } from "./code-tokens.js";

import { codeDeclarations } from "./code-declarations.js";
import { languageImports } from "./language-imports.js";
import { csharpImports } from "./csharp-imports.js";
import { rustImports } from "./rust-imports.js";

export type ModuleImport = { readonly specifier: string; readonly member?: string; readonly scope?: string; readonly form?: string; readonly source: Source; };
export type CodeModule = { readonly node: NodeDraft; readonly language: string; readonly imports: readonly ModuleImport[]; };
const languages: Readonly<Record<string, string>> = {
    ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    py: "python", pyi: "python", cs: "csharp", go: "go", rs: "rust", java: "java",
    c: "c", h: "c", cpp: "cpp", hpp: "cpp", rb: "ruby", swift: "swift", kt: "kotlin", kts: "kotlin", gd: "gdscript", sh: "shell",
};
export function codeLanguage(path: string): string | undefined {
    if (path.split("/").at(-1) === "go.mod") return "gomod";
    return languages[path.split(".").at(-1)?.toLowerCase() ?? ""];
}
function javascriptImports(tokens: readonly CodeToken[], add: (specifier: string, line: number) => void): void {
    let depth = 0;
    for (const [index, token] of tokens.entries()) {
        if (token.kind === "symbol") {
            if (token.value === "{") depth++;
            else if (token.value === "}") depth--;
        }
        if (token.kind !== "word" || (token.value !== "import" && token.value !== "export")) continue;
        let cursor = index + 1, before = index - 1;
        while (tokens[cursor]?.kind === "newline") cursor++;
        while (tokens[before]?.kind === "newline") before--;
        if (token.value === "import" && tokens[cursor]?.value === "(" && tokens[before]?.value !== ".") {
            cursor++;
            while (tokens[cursor]?.kind === "newline") cursor++;
            const literal = tokens[cursor++];
            while (tokens[cursor]?.kind === "newline") cursor++;
            if (literal?.kind === "string" && [")", ","].includes(tokens[cursor]?.value ?? "")) add(literal.value, token.line);
            continue;
        }
        if (depth !== 0) continue;
        const previous = tokens[index - 1];
        if (previous && previous.kind !== "newline" && ![";", "}"].includes(previous.value)) continue;
        const next = tokens.slice(index + 1).find(item => item.kind !== "newline");
        if (next?.kind === "string" && token.value === "import") { add(next.value, token.line); continue; }
        if (!next || next.value === "(" || next.value === ".") continue;
        if (token.value === "export" && !["*", "{", "type"].includes(next.value)) continue;
        for (let position = index + 1; position < tokens.length; position++) {
            const part = tokens[position];
            if (!part || [";", "=", "(", ":"].includes(part.value)) break;
            if (part.kind === "word" && part.value === "from") {
                const target = tokens.slice(position + 1).find(item => item.kind !== "newline");
                if (target?.kind === "string") add(target.value, token.line);
                break;
            }
            if (part.kind === "string") break;
        }
    }
}
function pythonImports(tokens: readonly CodeToken[], add: (specifier: string, line: number, member?: string) => void): void {
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token?.kind !== "word" || (token.value !== "import" && token.value !== "from")) continue;
        const previous = tokens[index - 1];
        if (previous && previous.kind !== "newline" && ![";", ":"].includes(previous.value)) continue;
        let cursor = index + 1;
        let prefix = "";
        if (token.value === "from") {
            while (cursor < tokens.length) {
                const part = tokens[cursor];
                if (!part || part.kind === "newline" || part.value === "import") break;
                if (part.kind !== "word" && part.value !== ".") break;
                prefix += part.value;
                cursor++;
            }
            if (tokens[cursor]?.value !== "import" || !prefix) continue;
            cursor++;
        }
        let grouped = false;
        while (cursor < tokens.length) {
            const part = tokens[cursor];
            if (!part || part.value === ";" || (part.kind === "newline" && !grouped)) break;
            if (part.value === "(") { grouped = true; cursor++; continue; }
            if (part.value === ")") break;
            if (part.value === "," || part.kind === "newline" || part.value === "\\") { cursor++; continue; }
            if (part.kind !== "word" && part.value !== "*") break;
            let name = part.value;
            cursor++;
            while (tokens[cursor]?.value === "." && tokens[cursor + 1]?.kind === "word") {
                name += `.${tokens[cursor + 1]?.value ?? ""}`;
                cursor += 2;
            }
            if (prefix) add(prefix, token.line, name);
            else add(name, token.line);
            if (tokens[cursor]?.value === "as") cursor += 2;
        }
        index = Math.max(index, cursor - 1);
    }
}
export function extractCode(input: SourceInput): CodeModule {
    validateSourceInput(input);
    const language = codeLanguage(input.path) ?? "unknown";
    let imports: ModuleImport[] = [];
    let attributes: JsonObject = {};
    const add = (specifier: string, line: number, member?: string): void => {
        imports.push({ specifier, ...(member === undefined ? {} : { member }), source: makeSource(input, `/imports/${imports.length}`, line) });
    };
    if (language === "python") pythonImports(codeTokens(input.text.replace(/\r\n|\r/gu, "\n"), true), add);
    else if (language === "typescript" || language === "javascript") javascriptImports(codeTokens(input.text.replace(/\r\n|\r/gu, "\n"), false), add);
    else if (language === "csharp" || language === "rust") {
        const native = language === "csharp" ? csharpImports(input) : rustImports(input);
        imports = [...native.imports]; attributes = native.attributes;
    }
    else if (["go", "java", "kotlin", "swift", "gdscript", "gomod"].includes(language)) {
        const native = languageImports(input, language); imports = [...native.imports]; attributes = native.attributes;
    }
    const definitions = codeDeclarations(input, language);
    attributes = { ...attributes, definitions, ...descriptionAttributes(input.text, language, definitions) };
    return {
        language, imports,
        node: { id: `module:${input.path}`, kind: "module", name: input.path, attributes: { ...attributes, language, extraction: ["typescript", "javascript", "python", "csharp", "rust", "go", "java", "kotlin", "swift", "gdscript"].includes(language) ? "static-imports" : "file-only", imports: imports.map(item => item.specifier) }, sources: [makeSource(input, "", 1, input.text.split(/\r\n|\r|\n/u).length)] },
    };
}
