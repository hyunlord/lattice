import type { CodeToken } from "./code-tokens.js";

export function commonjsImports(tokens: readonly CodeToken[], add: (specifier: string, line: number, form: string) => void): void {
    const parts = tokens.filter(token => token.kind !== "newline");
    const syntax = (index: number): string => parts[index]?.kind === "string" ? "" : parts[index]?.value ?? "";
    const loader = (index: number): boolean => parts[index]?.kind === "word" && syntax(index) === "require" && syntax(index - 1) !== ".";
    // A local binding anywhere makes scope resolution uncertain; do not guess which loader a call uses.
    const shadowed = parts.some((_, index) => loader(index) && (syntax(index - 1) === "function" || !["(", "."].includes(syntax(index + 1))));
    for (const [index, token] of parts.entries()) {
        if (!loader(index) || syntax(index + 1) !== "(" || ["function", "new"].includes(syntax(index - 1))) continue;
        const argument = parts[index + 2];
        const literal = argument?.kind === "string" && syntax(index + 3) === ")";
        add(literal ? argument.value : "require(<dynamic>)", token.line, shadowed ? "shadowed-require" : literal ? "require" : "dynamic-require");
    }
}
