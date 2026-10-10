import { markdownDescription } from "./markdown-description.js";
import { label, plain, maskCode, bracketMatches, destination, inlineEnd } from "./markdown-inline.js";
import type { Edge, NodeDraft, Source } from "../core/model.js";
import { DataInputError, makeSource, validateSourceInput } from "./types.js";
import type { SourceInput } from "./types.js";

export type DocumentLink = { readonly sourceId: string; readonly target: string; readonly source: Source; };
export type MarkdownDocument = {
    readonly nodes: readonly NodeDraft[];
    readonly edges: readonly Edge[];
    readonly links: readonly DocumentLink[];
};
type Heading = { readonly text: string; readonly level: number; readonly line: number; readonly endLine: number; };
export function extractMarkdown(input: SourceInput): MarkdownDocument {
    validateSourceInput(input);
    const lines = input.text.replace(/^\ufeff/u, "").split(/\r\n|\r|\n/u);
    const visible: string[] = [];
    let fenceCharacter = "";
    let fenceLength = 0;
    let commentOpen = false;
    let paragraphOpen = false;
    for (const rawLine of lines) {
        let line = rawLine;
        if (fenceLength === 0) {
            const codeMasked = maskCode(rawLine);
            let offset = 0;
            let visibleLine = "";
            while (offset < rawLine.length) {
                if (commentOpen) {
                    const closing = rawLine.indexOf("-->", offset);
                    const end = closing < 0 ? rawLine.length : closing + 3;
                    visibleLine += " ".repeat(end - offset);
                    offset = end;
                    if (closing >= 0) commentOpen = false;
                } else {
                    const opening = codeMasked.indexOf("<!--", offset);
                    if (opening < 0) {
                        visibleLine += rawLine.slice(offset);
                        break;
                    }
                    visibleLine += rawLine.slice(offset, opening);
                    offset = opening;
                    commentOpen = true;
                }
            }
            line = visibleLine;
        }
        const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
        const marker = fence?.[1];
        if (fenceLength > 0) {
            visible.push("");
            if (marker?.[0] === fenceCharacter && marker.length >= fenceLength && (fence?.[2] ?? "").trim() === "") fenceLength = 0;
        } else if (marker !== undefined && !(marker[0] === "`" && (fence?.[2] ?? "").includes("`"))) {
            fenceCharacter = marker[0] ?? "";
            fenceLength = marker.length;
            visible.push("");
        } else {
            const indented = /^(?: {4}|\t)/u.test(line);
            const visibleParagraph = paragraphOpen || (!indented && /<p(?:\s[^>]*)?>/iu.test(line));
            visible.push(indented && !paragraphOpen ? "" : line);
            if (visibleParagraph) paragraphOpen = !/<\/p\s*>/iu.test(line);
        }
    }
    const definitions = new Map<string, string>();
    const definitionLines = new Set<number>();
    for (let index = 0; index < visible.length; index++) {
        const line = visible[index] ?? "";
        const match = /^ {0,3}\[([^\]]+)\]:[ \t]*/u.exec(line);
        if (match === null) continue;
        const target = destination(line, match[0].length);
        if (target === undefined || target.target === "") continue;
        const remainder = line.slice(target.end);
        if (remainder.trim() !== "" && (!/^\s/u.test(remainder) || inlineEnd(`${remainder})`, 0) !== remainder.length + 1)) continue;
        const key = label(match[1] ?? "");
        if (!definitions.has(key)) definitions.set(key, target.target);
        definitionLines.add(index);
    }
    const headings: Heading[] = [];
    for (let index = 0; index < visible.length; index++) {
        if (definitionLines.has(index)) continue;
        const line = visible[index] ?? "";
        const atx = /^ {0,3}(#{1,6})(?:[ \t]+(.*)|[ \t]*)$/u.exec(line);
        if (atx !== null) {
            headings.push({ text: plain((atx[2] ?? "").replace(/(?:^|[ \t]+)#+[ \t]*$/u, "")), level: (atx[1] ?? "").length, line: index + 1, endLine: index + 1 });
        } else if (line.trim() !== "" && !/^ {0,3}(?:[-*+]\s|>)/u.test(line) && /^ {0,3}(?:=+|-+)[ \t]*$/u.test(visible[index + 1] ?? "")) {
            headings.push({ text: plain(line), level: (visible[index + 1] ?? "").trim().startsWith("=") ? 1 : 2, line: index + 1, endLine: index + 2 });
            index++;
        }
        if (headings.length >= 100000) throw new DataInputError(input.path, index + 1, "document exceeds the 100000 node limit");
    }
    const documentId = `document:${input.path}`;
    const title = headings.find(heading => heading.level === 1)?.text ?? input.path;
    const metadata: Record<string, string> = { title };
    const explicitStatus = visible.find(line => /^\s*(?:\*\*)?Status(?:\*\*)?\s*:/iu.test(line));
    if (explicitStatus !== undefined) metadata["status"] = plain(explicitStatus.replace(/^\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*/iu, ""));
    for (let index = 0; index < headings.length; index++) {
        const heading = headings[index];
        if (heading === undefined) continue;
        const key = heading.text.toLowerCase();
        if (key !== "status" && key !== "decision") continue;
        const next = headings[index + 1];
        const body = visible.slice(heading.endLine, next === undefined ? visible.length : next.line - 1).filter((_, offset) => !definitionLines.has(heading.endLine + offset)).join("\n").trim();
        if (body !== "") metadata[key] = body;
    }
    const documentDescription = markdownDescription(visible, 0, headings.find(heading => heading.level > 1)?.line ?? visible.length, /(?:^|\/)readme(?:\.[^/]*)?$/iu.test(input.path) ? input.path.split("/").at(-2) : undefined);
    const nodes: NodeDraft[] = [{ id: documentId, kind: "document", name: title, attributes: { ...metadata, ...(documentDescription ? { sourceDescription: documentDescription } : {}) }, sources: [makeSource(input, "", 1, lines.length)] }];
    const edges: Edge[] = [];
    const usedAnchors = new Set<string>();
    const suffixes = new Map<string, number>();
    const stack: { readonly level: number; readonly id: string; }[] = [];
    const headingIds: string[] = [];
    for (const [index, heading] of headings.entries()) {
        const base = heading.text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/gu, "-") || "section";
        let anchor = base;
        let suffix = suffixes.get(base) ?? 0;
        while (usedAnchors.has(anchor)) anchor = `${base}-${++suffix}`;
        suffixes.set(base, suffix);
        usedAnchors.add(anchor);
        const id = `${documentId}#${anchor}`;
        headingIds.push(id);
        const pointer = `/headings/${index}`;
        const source = makeSource(input, pointer, heading.line, heading.endLine);
        while (stack.length > 0 && (stack[stack.length - 1]?.level ?? 0) >= heading.level) stack.pop();
        const parentId = stack[stack.length - 1]?.id ?? documentId;
        const description = markdownDescription(visible, heading.endLine, (headings[index + 1]?.line ?? (visible.length + 1)) - 1);
        nodes.push({ id, kind: "heading", name: heading.text, attributes: { level: heading.level, anchor, text: heading.text, ...(description ? { sourceDescription: description } : {}) }, sources: [source] });
        edges.push({ id: `contains:${JSON.stringify([parentId, id])}`, kind: "contains", source: parentId, target: id, directed: true, field: pointer, sources: [source] });
        stack.push({ level: heading.level, id });
    }
    const links: DocumentLink[] = [];
    let headingIndex = -1;
    const linkLines: string[] = [];
    const headingLines = new Set(headings.flatMap(heading => [heading.line - 1, heading.endLine - 1]));
    let paragraph: string[] = [];
    const flush = (): void => {
        if (paragraph.length > 0) {
            for (const line of maskCode(paragraph.join("\n")).split("\n")) linkLines.push(line);
        }
        paragraph = [];
    };
    for (const [index, line] of visible.entries()) {
        if (line.trim() === "" || headingLines.has(index) || definitionLines.has(index)) {
            flush();
            linkLines.push(maskCode(line));
        } else paragraph.push(line);
    }
    flush();
    for (const [lineIndex, text] of linkLines.entries()) {
        while ((headings[headingIndex + 1]?.line ?? Infinity) <= lineIndex + 1) headingIndex++;
        if (definitionLines.has(lineIndex)) continue;
        const brackets = bracketMatches(text);
        for (let offset = 0; offset < text.length; offset++) {
            if (text[offset] === "\\") { offset++; continue; }
            if (text[offset] !== "[") continue;
            const close = (brackets.get(offset) ?? -1);
            if (close < 0) break;
            const linkLabel = close - offset <= 1000 ? text.slice(offset + 1, close) : "";
            let target: string | undefined;
            let end = close + 1;
            if (text[end] === "(") {
                const parsed = destination(text, end + 1);
                const final = parsed === undefined ? undefined : inlineEnd(text, parsed.end);
                if (parsed !== undefined && final !== undefined) { target = parsed.target; end = final; }
            } else if (text[end] === "[") {
                const referenceClose = (brackets.get(end) ?? -1);
                if (referenceClose >= 0) {
                    if (referenceClose - end <= 1000) target = definitions.get(label(text.slice(end + 1, referenceClose) || linkLabel));
                    end = referenceClose + 1;
                }
            } else target = definitions.get(label(linkLabel));
            if (target !== undefined) {
                if (links.length >= 100000) throw new DataInputError(input.path, lineIndex + 1, "document exceeds the 100000 link limit");
                links.push({ sourceId: headingIds[headingIndex] ?? documentId, target, source: makeSource(input, `/links/${links.length}`, lineIndex + 1, lineIndex + 1) });
                offset = end - 1;
            }
        }
    }
    return { nodes, edges, links };
}
