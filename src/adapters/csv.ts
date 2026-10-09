import type { Source } from "../core/model.js";
import { DataInputError, makeSource, pointerToken, validateSourceInput } from "./types.js";
import type { ExtractedRecord, SourceInput } from "./types.js";

type Cell = { readonly value: string; readonly line: number; readonly endLine: number; };
type Row = { readonly cells: readonly Cell[]; readonly line: number; readonly endLine: number; };

export function extractCsv(input: SourceInput): readonly ExtractedRecord[] {
    validateSourceInput(input);
    const text = input.text;
    let offset = text.startsWith("\ufeff") ? 1 : 0;
    let line = 1;

    function fail(reason: string): never {
        throw new DataInputError(input.path, line, reason);
    }

    function consumeNewline(): void {
        if (text[offset] === "\r" && text[offset + 1] === "\n") offset += 2;
        else offset += 1;
        line += 1;
    }

    function readCell(): Cell {
        const startLine = line;
        let value = "";
        if (text[offset] === '"') {
            offset += 1;
            let segment = offset;
            let closed = false;
            while (offset < text.length) {
                const character = text[offset];
                if (character === '"') {
                    value += text.slice(segment, offset);
                    offset += 1;
                    if (text[offset] === '"') {
                        value += '"';
                        offset += 1;
                        segment = offset;
                    } else {
                        closed = true;
                        break;
                    }
                } else if (character === "\n" || character === "\r") consumeNewline();
                else offset += 1;
            }
            if (!closed) fail("Unterminated quoted CSV field");
            const following = text[offset];
            if (following !== undefined && following !== "," && following !== "\n" && following !== "\r") {
                fail("Unexpected text after a quoted CSV field");
            }
        } else {
            const start = offset;
            while (offset < text.length && text[offset] !== "," && text[offset] !== "\n" && text[offset] !== "\r") {
                if (text[offset] === '"') fail("Quote inside an unquoted CSV field");
                offset += 1;
            }
            value = text.slice(start, offset);
        }
        return { value, line: startLine, endLine: line };
    }

    function readRow(): Row {
        const startLine = line;
        const cells: Cell[] = [];
        while (true) {
            cells.push(readCell());
            if (text[offset] === ",") offset += 1;
            else break;
        }
        const endLine = line;
        if (text[offset] === "\n" || text[offset] === "\r") consumeNewline();
        return { cells, line: startLine, endLine };
    }

    if (offset === text.length) fail("CSV requires a header row");
    const headerRow = readRow();
    const headers = headerRow.cells.map(cell => cell.value);
    const seen = new Set<string>();
    for (const header of headers) {
        if (header.trim().length === 0) throw new DataInputError(input.path, headerRow.line, "CSV headers cannot be empty");
        if (seen.has(header)) throw new DataInputError(input.path, headerRow.line, `Duplicate CSV header: ${header}`);
        if (header === "__proto__" || header === "constructor" || header === "prototype") {
            throw new DataInputError(input.path, headerRow.line, `Unsafe CSV header: ${header}`);
        }
        seen.add(header);
    }

    const records: ExtractedRecord[] = [];
    while (offset < text.length) {
        if (records.length >= 100_000) fail("CSV exceeds the 100,000 record limit");
        const row = readRow();
        if (row.cells.length !== headers.length) {
            throw new DataInputError(input.path, row.line, `Expected ${headers.length} CSV fields, received ${row.cells.length}`);
        }
        const pointer = `/${records.length}`;
        const attributes: Record<string, string> = {};
        const fields: Record<string, Source> = {};
        for (const [index, header] of headers.entries()) {
            const cell = row.cells[index];
            if (cell === undefined) throw new DataInputError(input.path, row.line, "Missing CSV field");
            const field = `/${pointerToken(header)}`;
            attributes[header] = cell.value;
            fields[field] = makeSource(input, `${pointer}${field}`, cell.line, cell.endLine);
        }
        const alias = attributes["id"];
        const id = alias !== undefined && alias.length > 0
            ? alias
            : `record:${encodeURIComponent(input.path)}#${encodeURIComponent(pointer)}`;
        const name = attributes["name"] ?? id;
        records.push({
            node: { id, kind: "record", name, attributes, sources: [makeSource(input, pointer, row.line, row.endLine)] },
            fields,
        });
    }
    return records;
}
