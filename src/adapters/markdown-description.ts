import type { JsonObject } from "../core/canonical.js";
import { plain } from "./markdown-inline.js";

/** visible lines already exclude fenced code and HTML comments. */
export function markdownDescription(lines: readonly string[], start: number, end: number): JsonObject | undefined {
    let htmlDepth = 0;
    for (let index = start; index < end; index++) {
        const raw = (lines[index] ?? "").trim();
        const wasHtml = htmlDepth > 0;
        for (const tag of raw.matchAll(/<(\/?)(div|kbd|table|details|section|aside|figure|p)(?:\s[^>]*)?>/giu)) htmlDepth = Math.max(0, htmlDepth + (tag[1] ? -1 : 1));
        if (wasHtml || htmlDepth > 0) continue;
        if (!raw || /^(?:#|[|>]|[-*+]\s|\d+[.)]\s|<|!\[|\[!\[|\[[^\]]+\]:)/u.test(raw) || /^[-=*]+$/u.test(raw)) continue;
        if (!raw.replace(/\[[^\]]*\]\([^)]*\)/gu, "").trim()) continue;
        const parts = [raw];
        let last = index;
        while (last + 1 < end && (lines[last + 1] ?? "").trim()) {
            const next = lines[last + 1] ?? "";
            if (/^\s*(?:#|[|>]|[-*+]\s|<)/u.test(next)) break;
            parts.push(next); last++;
        }
        index = last;
        const content = plain(parts.join(" ")).replace(/<[^>]*>/gu, " ").replace(/\s+/gu, " ").trim();
        if (!/[\p{L}]/u.test(content) || /copyright|spdx-license|licensed under|all rights reserved|permission is hereby granted/iu.test(content)) continue;
        const text = (/^.*?[.!?](?:\s|$)/u.exec(content)?.[0] ?? content).trim().slice(0, 320);
        return { text, kind: "readme", line: last - parts.length + 2, endLine: last + 1 };
    }
    return undefined;
}
