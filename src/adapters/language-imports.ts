import type { JsonObject } from "../core/canonical.js";
import type { ModuleImport } from "./code.js";
import { codeTokens } from "./code-tokens.js";
import { nativeTokens } from "./native-tokens.js";
import { makeSource } from "./types.js";
import type { SourceInput } from "./types.js";

export function languageImports(input: SourceInput, language: string): { readonly imports: readonly ModuleImport[]; readonly attributes: JsonObject; } {
    const text = input.text.replace(/\r\n|\r/gu, "\n");
    const tokens = language === "gdscript" ? codeTokens(text, true) : nativeTokens(text, false, { language, literals: true });
    const imports: ModuleImport[] = [];
    let attributes: JsonObject = {};
    const add = (specifier: string, line: number, form = "import"): void => { imports.push({ specifier, form, source: makeSource(input, `/imports/${imports.length}`, line) }); };
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token?.kind !== "word") continue;
        if (language === "gomod" && token.value === "module") {
            attributes = { ...attributes, goModule: tokens.slice(index + 1).filter(part => part.line === token.line).map(part => part.value).join("") }; break;
        }
        if (token.value === "package" && ["java", "kotlin", "go"].includes(language)) {
            let cursor = index + 1, name = "";
            while ((language === "java" || tokens[cursor]?.line === token.line) && (tokens[cursor]?.kind === "word" || tokens[cursor]?.value === ".")) name += tokens[cursor++]?.value ?? "";
            attributes = { ...attributes, package: name };
        }
        if (language === "gdscript") {
            if (token.value === "class_name" && tokens[index + 1]?.kind === "word") attributes = { ...attributes, globalClass: tokens[index + 1]?.value ?? "" };
            const next = tokens[index + 1];
            if (token.value === "extends" && next && ["string", "word"].includes(next.kind)) add(next.value, token.line, next.kind === "string" ? "script-path" : "script-class");
            if (["preload", "load"].includes(token.value) && next?.value === "(" && tokens[index + 2]?.kind === "string") add(tokens[index + 2]?.value ?? "", token.line, "script-path");
            continue;
        }
        if (token.value !== "import") continue;
        let cursor = index + 1;
        if (language === "go") {
            if (tokens[cursor]?.value === "(") {
                while (++cursor < tokens.length && tokens[cursor]?.value !== ")") if (tokens[cursor]?.kind === "string") add(tokens[cursor]?.value ?? "", tokens[cursor]?.line ?? token.line);
            } else {
                while (tokens[cursor]?.line === token.line && tokens[cursor]?.kind !== "string") cursor++;
                if (tokens[cursor]?.kind === "string") add(tokens[cursor]?.value ?? "", token.line);
            }
        } else if (["java", "kotlin", "swift"].includes(language)) {
            if (["static", "class", "struct", "enum", "protocol", "typealias", "func", "var", "let"].includes(tokens[cursor]?.value ?? "")) cursor++;
            let name = "";
            while ((language === "java" || tokens[cursor]?.line === token.line) && (tokens[cursor]?.kind === "word" || [".", "*"].includes(tokens[cursor]?.value ?? ""))) {
                if (tokens[cursor]?.value === "as") break;
                name += tokens[cursor++]?.value ?? "";
            }
            if (name) add(name, token.line);
        }
    }
    return { imports, attributes };
}
