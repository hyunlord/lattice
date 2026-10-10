import type { JsonObject } from "../core/canonical.js";
import type { ModuleImport } from "./code.js";
import { nativeTokens } from "./native-tokens.js";
import { makeSource } from "./types.js";
import type { SourceInput } from "./types.js";

export function csharpImports(input: SourceInput): { readonly imports: readonly ModuleImport[]; readonly attributes: JsonObject; } {
    const tokens = nativeTokens(input.text.replace(/\r\n|\r/gu, "\n"), false);
    const imports: ModuleImport[] = [], namespaces: string[] = [], types: string[] = [];
    const scopes: { depth: number; name: string; }[] = [{ depth: 0, name: "" }];
    let depth = 0;
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) continue;
        if (token.value === "{") { depth++; continue; }
        if (token.value === "}") { if (scopes.at(-1)?.depth === depth) scopes.pop(); depth--; continue; }
        const scope = scopes.at(-1);
        if (depth !== scope?.depth) continue;
        if (token.value === "namespace") {
            let cursor = index + 1, name = "";
            while (tokens[cursor]?.kind === "word" || tokens[cursor]?.value === ".") name += tokens[cursor++]?.value ?? "";
            if (!name || !["{", ";"].includes(tokens[cursor]?.value ?? "")) continue;
            name = [scope.name, name].filter(Boolean).join(".");
            namespaces.push(name);
            if (tokens[cursor]?.value === "{") depth++;
            scopes.push({ depth, name }); index = cursor;
        } else if (token.value === "using") {
            let cursor = index + 1;
            let form = tokens[cursor]?.value === "static" ? "type" : "namespace";
            if (form === "type") cursor++;
            if (tokens[cursor + 1]?.value === "=") { form = "alias"; cursor += 2; }
            let target = "";
            while (tokens[cursor]?.kind === "word" || [".", ":"].includes(tokens[cursor]?.value ?? "")) target += tokens[cursor++]?.value ?? "";
            if (tokens[cursor]?.value !== ";" || !/^(?:global::)?[\p{L}_][\p{L}\p{N}_]*(?:\.[\p{L}_][\p{L}\p{N}_]*)*$/u.test(target)) continue;
            imports.push({ specifier: target, form, scope: scope.name, source: makeSource(input, `/imports/${imports.length}`, token.line) });
            index = cursor;
        } else if (["class", "struct", "interface", "enum", "record"].includes(token.value)) {
            const name = token.value === "record" && ["class", "struct"].includes(tokens[index + 1]?.value ?? "") ? tokens[index + 2] : tokens[index + 1];
            if (name?.kind === "word") types.push([scope.name, name.value].filter(Boolean).join("."));
        }
    }
    return { imports, attributes: { namespaces: [...new Set(namespaces)], declaredTypes: [...new Set(types)] } };
}
