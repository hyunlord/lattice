import type { CodeToken } from "./code-tokens.js";

/** Lexical evidence only: literal bodies and comments never become declarations. */
export function nativeTokens(text: string, rust: boolean): readonly CodeToken[] {
    const tokens: CodeToken[] = [];
    let index = 0, line = 1;
    const skip = (end: number): void => { line += text.slice(index, end).split("\n").length - 1; index = end; };
    while (index < text.length) {
        const rest = text.slice(index), character = text[index] ?? "";
        if (/\s/u.test(character)) { skip(index + 1); continue; }
        if (rest.startsWith("//")) { const end = text.indexOf("\n", index); skip(end < 0 ? text.length : end); continue; }
        if (rest.startsWith("/*")) {
            let depth = 1, cursor = index + 2;
            while (cursor < text.length && depth) {
                if (rust && text.startsWith("/*", cursor)) { depth++; cursor += 2; }
                else if (text.startsWith("*/", cursor)) { depth--; cursor += 2; }
                else cursor++;
            }
            skip(cursor); continue;
        }
        const rawRust = rust ? /^(?:br|cr|r)(#*)"/u.exec(rest) : null;
        const rawCsharp = !rust ? /^\$*("{3,})/u.exec(rest) : null;
        if (rawRust || rawCsharp) {
            const opening = (rawRust ?? rawCsharp)?.[0] ?? "";
            const marker = rawRust ? `"${rawRust[1] ?? ""}` : rawCsharp?.[1] ?? '"""';
            const end = text.indexOf(marker, index + opening.length);
            skip(end < 0 ? text.length : end + marker.length); continue;
        }
        const verbatim = !rust ? /^(?:\$?@|@\$)"/u.exec(rest)?.[0] : undefined;
        const quote = verbatim ? '"' : character;
        const lifetime = rust && character === "'" && /^'[\p{L}_][\p{L}\p{N}_]*(?!')/u.test(rest) && !/^'[\p{L}_][\p{L}\p{N}_]*'/u.test(rest);
        if (verbatim || quote === '"' || (quote === "'" && !lifetime)) {
            let cursor = index + (verbatim?.length ?? 1);
            while (cursor < text.length) {
                if (text[cursor] === quote) {
                    if (verbatim && text[cursor + 1] === quote) cursor += 2;
                    else { cursor++; break; }
                } else if (!verbatim && text[cursor] === "\\") cursor += 2;
                else cursor++;
            }
            skip(Math.min(cursor, text.length)); continue;
        }
        const word = /^(?:r#|@)?[\p{L}_][\p{L}\p{N}_]*/u.exec(rest)?.[0];
        if (word) { tokens.push({ kind: "word", value: word.replace(/^(?:r#|@)/u, ""), line }); index += word.length; }
        else { tokens.push({ kind: "symbol", value: character, line }); index++; }
    }
    return tokens;
}
