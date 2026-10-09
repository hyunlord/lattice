import type { NodeDraft, Source } from "../core/model.js";

export type SourceInput = { readonly path: string; readonly text: string; readonly contentHash: string; };
export type ExtractedRecord = { readonly references?: boolean; readonly node: NodeDraft; readonly fields: Readonly<Record<string, Source>>; };
export class DataInputError extends Error {
    override readonly name = "DataInputError";
    constructor(readonly path: string, readonly line: number, readonly reason: string) {
        super(`${path}:${line}: ${reason}`);
    }
}
export function pointerToken(value: string): string {
    return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
export function makeSource(input: SourceInput, pointer: string, line: number, endLine?: number): Source {
    return { path: input.path, pointer, line, contentHash: input.contentHash, ...(endLine === undefined ? {} : { endLine }) };
}
export function validateSourceInput(input: SourceInput): void {
    if (input.path.length === 0 || input.path.startsWith("/") || /[\\\u0000-\u001f:]/u.test(input.path) || input.path.split("/").some(part => part === ".." || part === "." || part === "")) {
        throw new DataInputError(input.path, 1, "Expected a repository-relative POSIX path");
    }
    if (!/^[a-f0-9]{64}$/u.test(input.contentHash)) throw new DataInputError(input.path, 1, "Expected a SHA-256 content digest");
    let bytes = 0;
    for (const character of input.text) {
        const point = character.codePointAt(0) ?? 0;
        bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
        if (bytes > 10 * 1024 * 1024) throw new DataInputError(input.path, 1, "Text exceeds the 10 MiB input limit");
    }
}
