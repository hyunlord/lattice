export type CSharpToken = { readonly kind: "word" | "string" | "character" | "symbol" | "unsupported"; readonly value: string; readonly line: number; readonly endLine: number; };
export type CSharpLexed = { readonly tokens: readonly CSharpToken[]; readonly diagnostics: readonly string[]; readonly preprocessor: boolean; };

export function csharpTokens(text: string): CSharpLexed {
    const tokens: CSharpToken[] = [], diagnostics: string[] = [];
    let offset = 0, line = 1, preprocessor = false;
    const step = (): string => { const value = text[offset++] ?? ""; if (value === "\n") line++; return value; };
    const quoted = (quote: string, verbatim: boolean, interpolation: boolean): string => {
        step();
        let value = "", depth = 0;
        while (offset < text.length) {
            const part = step();
            if ((part === "\n" || part === "\r") && !verbatim) diagnostics.push(`Newline in regular string at line ${line}`);
            if (part === quote && depth === 0) {
                if (verbatim && text[offset] === quote) { step(); value += quote; continue; }
                return value;
            }
            if (interpolation && part === "{" && text[offset] === "{" && depth === 0) { value += part + step(); continue; }
            if (interpolation && part === "{") depth++;
            else if (interpolation && part === "}" && depth > 0) depth--;
            else if (depth > 0 && (part === '"' || part === "'")) { offset--; quoted(part, false, false); continue; }
            if (part === "\\" && !verbatim) {
                const escaped = step();
                const escapes: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t", "0": "\0", a: "\x07", b: "\b", f: "\f", v: "\v", "\\": "\\", '"': '"', "'": "'" };
                if (escapes[escaped] !== undefined) value += escapes[escaped];
                else if (escaped === "u" || escaped === "U") {
                    const count = escaped === "u" ? 4 : 8, hex = text.slice(offset, offset + count);
                    const point = Number.parseInt(hex, 16);
                    if (hex.length === count && /^[a-f0-9]+$/iu.test(hex) && point <= 0x10ffff) { value += String.fromCodePoint(point); offset += count; }
                    else diagnostics.push(`Unsupported string escape at line ${line}`);
                } else diagnostics.push(`Unsupported string escape at line ${line}`);
            } else value += part;
        }
        diagnostics.push(`Unterminated string at line ${line}`);
        return value;
    };
    while (offset < text.length) {
        const start = line, character = text[offset] ?? "";
        if (/\s/u.test(character)) { step(); continue; }
        if (text.startsWith("//", offset)) { while (offset < text.length && text[offset] !== "\n") step(); continue; }
        if (text.startsWith("/*", offset)) {
            step(); step();
            while (offset < text.length && !text.startsWith("*/", offset)) step();
            if (offset === text.length) diagnostics.push(`Unterminated comment at line ${start}`); else { step(); step(); }
            continue;
        }
        if (character === "#") {
            preprocessor = true;
            while (offset < text.length && text[offset] !== "\n") step();
            diagnostics.push(`Preprocessor directive at line ${start}`);
            continue;
        }
        let interpolation = false, verbatim = false;
        if (character === "$" || character === "@") {
            const prefix = /^(?:\$@|@\$|\$|@)(?=")/u.exec(text.slice(offset))?.[0];
            if (prefix) { interpolation = prefix.includes("$"); verbatim = prefix.includes("@"); offset += prefix.length; }
        }
        if (text.startsWith('"""', offset)) {
            let count = 0; while (text[offset + count] === '"') count++;
            offset += count;
            const marker = '"'.repeat(count);
            while (offset < text.length && !text.startsWith(marker, offset)) step();
            if (offset < text.length) offset += count;
            diagnostics.push(`Raw string syntax at line ${start}`);
            tokens.push({ kind: "unsupported", value: "raw-string", line: start, endLine: line });
            continue;
        }
        const quote = text[offset];
        if (quote === '"' || quote === "'") {
            const value = quoted(quote, verbatim, interpolation);
            tokens.push({ kind: interpolation ? "unsupported" : quote === '"' ? "string" : "character", value, line: start, endLine: line });
            continue;
        }
        if (/[\p{L}_]/u.test(text[offset] ?? "")) {
            let value = step(); while (/[\p{L}\p{N}_]/u.test(text[offset] ?? "")) value += step();
            tokens.push({ kind: "word", value, line: start, endLine: line });
        } else {
            const value = text.startsWith("=>", offset) ? step() + step() : step();
            tokens.push({ kind: "symbol", value, line: start, endLine: line });
        }
    }
    return { tokens, diagnostics, preprocessor };
}
