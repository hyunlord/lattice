export type CodeToken = {
    readonly kind: "word" | "string" | "symbol" | "newline";
    readonly value: string;
    readonly line: number;
};

export function codeTokens(text: string, python: boolean): readonly CodeToken[] {
    const tokens: CodeToken[] = [];
    let offset = 0;
    let line = 1;
    const step = (): string => {
        const character = text[offset++] ?? "";
        if (character === "\n") line++;
        return character;
    };
    const quoted = (quote: string): string => {
        const triple = python && text.slice(offset, offset + 3) === quote.repeat(3);
        const marker = triple ? quote.repeat(3) : quote;
        offset += marker.length;
        let value = "";
        while (offset < text.length) {
            if (text.startsWith(marker, offset)) { offset += marker.length; return value; }
            const character = step();
            if (character === "\\") {
                const escaped = step();
                value += escaped === quote || escaped === "\\" ? escaped : `\\${escaped}`;
            } else value += character;
        }
        return value;
    };
    const template = (): void => {
        offset++;
        let expressionDepth = 0;
        while (offset < text.length) {
            const character = text[offset];
            if (character === "\\") { step(); step(); }
            else if (character === "`") {
                if (expressionDepth > 0) template();
                else { offset++; return; }
            } else if (expressionDepth > 0 && (character === '"' || character === "'")) quoted(character);
            else if (character === "$" && text[offset + 1] === "{") { offset += 2; expressionDepth++; }
            else if (expressionDepth > 0 && character === "{") { offset++; expressionDepth++; }
            else if (expressionDepth > 0 && character === "}") { offset++; expressionDepth--; }
            else step();
        }
    };
    while (offset < text.length) {
        const character = text[offset] ?? "";
        const startLine = line;
        if (character === "\n") { step(); tokens.push({ kind: "newline", value: "\n", line: startLine }); }
        else if (/\s/u.test(character)) step();
        else if (python && character === "\\" && /[\r\n]/u.test(text[offset + 1] ?? "")) {
            step();
            if (text[offset] === "\r") step();
            if (text[offset] === "\n") step();
        }
        else if ((python && character === "#") || (!python && text.startsWith("//", offset))) {
            while (offset < text.length && text[offset] !== "\n") step();
        } else if (!python && text.startsWith("/*", offset)) {
            offset += 2;
            while (offset < text.length && !text.startsWith("*/", offset)) step();
            offset = Math.min(offset + 2, text.length);
        } else if (!python && character === "/" && (!tokens.length || ["=", "(", "[", ",", ":", ";", "!", "?", "return", "\n", ">"].includes(tokens.at(-1)?.value ?? ""))) {
            offset++;
            let inClass = false;
            while (offset < text.length && text[offset] !== "\n") {
                const part = step();
                if (part === "\\") step();
                else if (part === "[") inClass = true;
                else if (part === "]") inClass = false;
                else if (part === "/" && !inClass) break;
            }
        } else if (character === '"' || character === "'") tokens.push({ kind: "string", value: quoted(character), line: startLine });
        else if (!python && character === "`") template();
        else if (/[\p{L}\p{N}_$]/u.test(character)) {
            const start = offset;
            while (offset < text.length && /[\p{L}\p{N}_$]/u.test(text[offset] ?? "")) offset++;
            tokens.push({ kind: "word", value: text.slice(start, offset), line });
        } else { step(); tokens.push({ kind: "symbol", value: character, line: startLine }); }
    }
    return tokens;
}
