import { descriptiveProse } from "./description-prose.js";
import type { JsonObject } from "../core/canonical.js";
import { maskMarkdownImages } from "./markdown-images.js";
import { plain } from "./markdown-inline.js";

/** visible lines already exclude fenced code and HTML comments. */
export function markdownDescription(sourceLines: readonly string[], start: number, end: number): JsonObject | undefined {
    const lineOffset = start;
    const lines = maskMarkdownImages(sourceLines.slice(start, end + 1).join("\n")).split("\n");
    end -= start;
    start = 0;
    let htmlDepth = 0;
    let marketingDepth = 0;
    let notice = false;
    for (let index = start; index < end; index++) {
        if (index + 1 < lines.length && /^\s*(?:=+|-+)\s*$/u.test(lines[index + 1] ?? "")) { index++; continue; }
        const first = index;
        let raw = (lines[index] ?? "").trim();
        if (/^>\s*\[!/u.test(raw)) { notice = true; continue; }
        if (notice && raw.startsWith(">")) continue;
        if (!raw.startsWith(">")) notice = false;
        const htmlParagraph = /^<p(?:\s[^>]*)?>/iu.test(raw);
        const wasHtml = htmlDepth > 0;
        const wasMarketing = marketingDepth > 0;
        let marketingLine = wasMarketing;
        for (const tag of raw.matchAll(/<(\/?)(div|kbd|table|details|section|aside|figure|p)(?:\s[^>]*)?>/giu)) {
            htmlDepth = Math.max(0, htmlDepth + (tag[1] ? -1 : 1));
            if (!tag[1] && /\b(?:class|id)\s*=\s*["'][^"']*\b(?:sponsors?|sponsorship|marketing|promotion|promo|advertisement|merchandise)\b/iu.test(tag[0])) {
                marketingDepth = htmlDepth;
                marketingLine = true;
            }
            if (marketingDepth > htmlDepth) marketingDepth = 0;
        }
        if (marketingLine) continue;
        if ((wasHtml || htmlDepth > 0) && !htmlParagraph) continue;
        raw = raw.replace(/^>\s?/u, "");
        if (htmlParagraph) {
            while (!/<\/p\s*>/iu.test(raw) && index + 1 < end) {
                const next = lines[++index] ?? "";
                for (const tag of next.matchAll(/<(\/?)(div|kbd|table|details|section|aside|figure|p)(?:\s[^>]*)?>/giu)) htmlDepth = Math.max(0, htmlDepth + (tag[1] ? -1 : 1));
                raw += ` ${next}`;
            }
            raw = raw.replace(/<[^>]*>/gu, " ").trim();
        }
        if (!raw || /^(?:#|[|>]|[-*+]\s|\d+[.)]\s|<|!\[|\[!\[|\[[^\]]+\]:)/u.test(raw) || /^[-=*]+$/u.test(raw)) continue;
        if (!raw.replace(/\[[^\]]*\]\([^)]*\)/gu, "").trim()) continue;
        const parts = [raw];
        let last = index;
        while (!htmlParagraph && last + 1 < end && (lines[last + 1] ?? "").trim()) {
            const next = lines[last + 1] ?? "";
            if (/^\s*(?:#|[|>]|[-*+]\s|<)/u.test(next)) break;
            parts.push(next); last++;
        }
        index = last;
        const content = plain(parts.join(" ")).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
        if (!descriptiveProse(content)) continue;
        const text = (/^.*?[.!?](?:\s|$)/u.exec(content)?.[0] ?? content).trim().slice(0, 320);
        return { text, kind: "readme", line: lineOffset + first + 1, endLine: lineOffset + last + 1 };
    }
    return undefined;
}
