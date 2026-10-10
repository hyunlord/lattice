import { bracketMatches, destination, inlineEnd } from "./markdown-inline.js";

/** Remove image syntax, including linked images, without moving source lines. */
export function maskMarkdownImages(text: string): string {
    const brackets = bracketMatches(text);
    const spans: { start: number; end: number; }[] = [];
    const endOfLink = (close: number): number => {
        if (text[close + 1] === "(") {
            const target = destination(text, close + 2);
            return target ? inlineEnd(text, target.end) ?? close + 1 : close + 1;
        }
        if (text[close + 1] === "[") return (brackets.get(close + 1) ?? close) + 1;
        return close + 1;
    };
    for (const [open, close] of brackets) {
        if (text[open - 1] !== "!" || text[open - 2] === "\\") continue;
        spans.push({ start: open - 1, end: endOfLink(close) });
    }
    // String indices are UTF-16 offsets, so preserve code units while masking.
    const masked = text.split("");
    for (const span of spans) for (let index = span.start; index < span.end; index++) if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
    const imagesRemoved = masked.join("");
    for (const [open, close] of brackets) {
        if (text[open - 1] === "!" || !spans.some(span => span.start > open && span.end <= close) || imagesRemoved.slice(open + 1, close).trim()) continue;
        for (let index = open; index < endOfLink(close); index++) if (masked[index] !== "\n" && masked[index] !== "\r") masked[index] = " ";
    }
    return masked.join("");
}
