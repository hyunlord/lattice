import type { JsonObject } from "../core/canonical.js";
import type { ModuleImport } from "./code.js";
import { nativeTokens } from "./native-tokens.js";
import { makeSource } from "./types.js";
import type { SourceInput } from "./types.js";

function usePaths(values: readonly string[]): readonly string[] {
    let cursor = 0;
    const paths: string[] = [];
    function tree(prefix: readonly string[]): void {
        const parts = [...prefix];
        while (cursor < values.length) {
            const value = values[cursor];
            if (value === "{") {
                cursor++;
                while (cursor < values.length && values[cursor] !== "}") {
                    tree(parts);
                    if (values[cursor] === ",") cursor++;
                    else break;
                }
                if (values[cursor] === "}") cursor++;
                return;
            }
            if ([",", "}", "as"].includes(value ?? "")) break;
            if (value !== ":") parts.push(value ?? "");
            cursor++;
        }
        if (values[cursor] === "as") cursor += 2;
        if (parts.at(-1) === "self" && parts.length > 1) parts.pop();
        if (parts.length) paths.push(parts.join("::"));
    }
    tree([]);
    return paths;
}
export function rustImports(input: SourceInput): { readonly imports: readonly ModuleImport[]; readonly attributes: JsonObject; } {
    const tokens = nativeTokens(input.text.replace(/\r\n|\r/gu, "\n"), true);
    const imports: ModuleImport[] = [], inlineModules: string[] = [], declaredModules: string[] = [], declaredItems: string[] = [];
    const scopes: { depth: number; name: string; }[] = [{ depth: 0, name: "" }];
    let depth = 0, grouping = 0, customPath = false;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) continue;
        if (["(", "["].includes(token.value)) { grouping++; continue; }
        if ([")", "]"].includes(token.value)) { grouping--; continue; }
        if (grouping > 0) {
            if (depth === scopes.at(-1)?.depth && token.value === "path" && tokens[index - 1]?.value === "[" && tokens[index - 2]?.value === "#") customPath = true;
            continue;
        }
        if (token.value === "{") { depth++; continue; }
        if (token.value === "}") { if (scopes.at(-1)?.depth === depth) scopes.pop(); depth--; continue; }
        const scope = scopes.at(-1);
        if (depth !== scope?.depth) continue;
        if (token.value === "mod" && tokens[index + 1]?.kind === "word") {
            const name = tokens[index + 1]?.value ?? "";
            const end = tokens[index + 2]?.value;
            if (end === "{") {
                const nested = [scope.name, name].filter(Boolean).join("::");
                inlineModules.push(nested); declaredModules.push(nested); scopes.push({ depth: ++depth, name: nested }); index += 2; customPath = false;
            } else if (end === ";") {
                if (!customPath) declaredModules.push([scope.name, name].filter(Boolean).join("::"));
                imports.push({ specifier: name, form: customPath ? "mod-path" : "mod", scope: scope.name, source: makeSource(input, `/imports/${imports.length}`, token.line) }); index += 2; customPath = false;
            }
        } else if (["struct", "enum", "trait", "fn", "const", "static", "type", "union"].includes(token.value) && tokens[index + 1]?.kind === "word") {
            declaredItems.push([scope.name, tokens[index + 1]?.value ?? ""].filter(Boolean).join("::"));
        } else if (token.value === "use") {
            let cursor = index + 1;
            while (cursor < tokens.length && tokens[cursor]?.value !== ";") cursor++;
            const paths = usePaths(tokens.slice(index + 1, cursor).map(item => item.value));
            for (const specifier of paths) imports.push({ specifier, form: "use", scope: scope.name, source: makeSource(input, `/imports/${imports.length}`, token.line) });
            index = cursor;
        }
    }
    return { imports, attributes: { inlineModules, declaredModules, declaredItems } };
}
