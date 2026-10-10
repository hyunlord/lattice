import type { JsonObject } from "../core/canonical.js";
import { codeTokens } from "./code-tokens.js";
import type { CodeToken } from "./code-tokens.js";

type Binding = { readonly name: string; readonly kind: string; };
function namedBindings(tokens: readonly CodeToken[]): readonly { readonly imported: string; readonly local: string; }[] {
    const result: { imported: string; local: string; }[] = [];
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (token?.kind !== "word" || ["type", "as"].includes(token.value)) continue;
        const alias = tokens[index + 1]?.value === "as" ? tokens[index + 2] : undefined;
        result.push({ imported: token.value, local: alias?.value ?? token.value });
        if (alias) index += 2;
    }
    return result;
}

/** Literal registrations are admitted only through a recognized imported test binding. */
export function javascriptEvidence(text: string): { readonly exports: readonly JsonObject[]; readonly verificationNames: readonly JsonObject[]; } {
    const tokens = codeTokens(text, false).filter(token => token.kind !== "newline");
    const bindings = new Map<string, Binding>(), exports: JsonObject[] = [], verificationNames: JsonObject[] = [];
    const occurrences = new Map<string, number>();
    for (const token of tokens) if (token.kind === "word") occurrences.set(token.value, (occurrences.get(token.value) ?? 0) + 1);
    const declaredBindings = new Set<string>();
    let depth = 0;
    const addExport = (name: string, local: string, line: number): void => { exports.push({ name, line, uses: Math.max(0, (occurrences.get(local) ?? 1) - 1) }); };
    for (let index = 0; index < tokens.length; index++) {
        const token = tokens[index];
        if (!token) continue;
        if (token.kind === "symbol" && token.value === "}") depth--;
        if (depth === 0 && token.kind === "word") {
            const declared = tokens[index + 1];
            if (["const", "let", "var", "function", "class"].includes(token.value) && declared?.kind === "word") declaredBindings.add(declared.value);
            if (token.value === "import") {
                let end = index + 1;
                while (end < tokens.length && tokens[end]?.kind !== "string" && tokens[end]?.value !== ";") end++;
                const module = tokens[end]?.value ?? "", segment = tokens.slice(index + 1, end);
                const defaultBinding = segment[0]?.kind === "word" && segment[0].value !== "type" ? segment[0].value : undefined;
                if (defaultBinding && ["ava", "node:test"].includes(module)) bindings.set(defaultBinding, { name: defaultBinding, kind: "test-registration" });
                const open = segment.findIndex(value => value.value === "{"), close = segment.findIndex(value => value.value === "}");
                for (const entry of namedBindings(open < 0 ? [] : segment.slice(open + 1, close))) {
                    if (["node:test", "vitest", "@jest/globals"].includes(module) && ["test", "it"].includes(entry.imported)) bindings.set(entry.local, { name: entry.imported, kind: "test-registration" });
                    if (module === "tsd" && /^expect(?:Type|Error|Assignable|NotAssignable|NotType|Deprecated|NotDeprecated|Never)$/u.test(entry.imported)) bindings.set(entry.local, { name: entry.imported, kind: "type-assertion" });
                }
            }
            if (token.value === "export") {
                const next = tokens[index + 1], name = tokens[index + 2];
                if (next && ["const", "let", "var"].includes(next.value) && name?.kind === "word") addExport(name.value, name.value, name.line);
                if (next?.value === "default" && name?.kind === "word" && declaredBindings.has(name.value) && (!tokens[index + 3] || tokens[index + 3]?.value === ";")) addExport(name.value, name.value, name.line);
                if (next?.value === "{") {
                    const end = tokens.findIndex((value, position) => position > index && value.value === "}");
                    for (const entry of namedBindings(tokens.slice(index + 2, end))) addExport(entry.local === "default" ? entry.imported : entry.local, entry.imported, token.line);
                }
            }
            const binding = bindings.get(token.value);
            if (binding) {
                let cursor = index + 1;
                while (tokens[cursor]?.value === "." && tokens[cursor + 1]?.kind === "word") cursor += 2;
                if (tokens[cursor]?.value === "<") {
                    let nesting = 1;
                    while (++cursor < tokens.length && nesting) { if (tokens[cursor]?.value === "<") nesting++; if (tokens[cursor]?.value === ">") nesting--; }
                }
                const argument = tokens[cursor + 1];
                if (tokens[cursor]?.value === "(" && (binding.kind === "type-assertion" || argument?.kind === "string")) verificationNames.push({ name: binding.kind === "type-assertion" ? binding.name : argument?.value ?? "", line: token.line, kind: binding.kind });
            }
        }
        if (token.kind === "symbol" && token.value === "{") depth++;
    }
    return { exports, verificationNames: verificationNames.slice(0, 3) };
}

export function entryPoints(text: string, language: string, definitions: readonly JsonObject[]): readonly JsonObject[] {
    if ((language === "go" && /^\s*package\s+main\b/mu.test(text)) || language === "rust") return definitions.filter(value => value["kind"] === "function" && value["name"] === "main").map(value => ({ name: "main", line: value["line"] ?? 1 }));
    return [];
}
