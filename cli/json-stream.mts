import { closeSync, openSync, readSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

/** Decode one top-level array record at a time, never a whole document string. */
export function parseJsonObjectChunks(chunks: Iterable<Uint8Array>): Record<string, unknown> {
    const input = chunks[Symbol.iterator](), decoder = new StringDecoder('utf8');
    let text = '', position = 0, ended = false;
    const available = (): boolean => {
        while (position >= text.length && !ended) {
            const next = input.next();
            text = next.done ? decoder.end() : decoder.write(Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength));
            ended = Boolean(next.done); position = 0;
        }
        return position < text.length;
    };
    const whitespace = (char: string): boolean => char === ' ' || char === '\n' || char === '\r' || char === '\t';
    const peek = (): string => { while (available() && whitespace(text[position] ?? '')) position++; return available() ? text[position] ?? '' : ''; };
    const expect = (char: string): void => { if (peek() !== char) throw new SyntaxError(`Expected ${char} in JSON object`); position++; };
    const valueText = (): string => {
        const first = peek(); if (!first) throw new SyntaxError('Unexpected end of JSON input');
        const compound = first === '{' || first === '[', string = first === '"', parts: string[] = [];
        let depth = 0, quoted = false, escaped = false;
        while (available()) {
            const start = position;
            for (; position < text.length; position++) {
                const char = text[position] ?? '';
                if (quoted) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === '"') {
                        quoted = false;
                        if (string && depth === 0) { parts.push(text.slice(start, ++position)); return parts.join(''); }
                    }
                } else {
                    if (!compound && !string && (whitespace(char) || char === ',' || char === ']' || char === '}')) { parts.push(text.slice(start, position)); return parts.join(''); }
                    if (char === '"') quoted = true;
                    else if (char === '{' || char === '[') depth++;
                    else if (char === '}' || char === ']') {
                        depth--;
                        if (compound && depth <= 0) { parts.push(text.slice(start, ++position)); return parts.join(''); }
                    }
                }
            }
            parts.push(text.slice(start, position));
        }
        return parts.join('');
    };
    const value = (): unknown => JSON.parse(valueText());
    const array = (): unknown[] => {
        expect('['); const items: unknown[] = [];
        if (peek() === ']') { position++; return items; }
        for (; ;) {
            items.push(value());
            if (peek() === ']') { position++; return items; }
            expect(',');
        }
    };
    try {
        expect('{'); const result: Record<string, unknown> = {};
        if (peek() !== '}') for (; ;) {
            const key = value();
            if (typeof key !== 'string') throw new SyntaxError('Expected a JSON object key');
            if (Object.hasOwn(result, key)) throw new SyntaxError(`Duplicate JSON object key: ${key}`);
            expect(':');
            const item = peek() === '[' ? array() : value();
            Object.defineProperty(result, key, { value: item, enumerable: true, writable: true, configurable: true });
            if (peek() === '}') break;
            expect(',');
        }
        expect('}'); if (peek()) throw new SyntaxError('Unexpected trailing JSON input');
        return result;
    } finally { input.return?.(); }
}

export function readJsonObject(path: string): Record<string, unknown> {
    function* chunks(): Generator<Uint8Array> {
        const file = openSync(path, 'r'), buffer = Buffer.allocUnsafe(64 * 1024);
        try { for (; ;) { const size = readSync(file, buffer, 0, buffer.length, null); if (!size) return; yield buffer.subarray(0, size); } }
        finally { closeSync(file); }
    }
    return parseJsonObjectChunks(chunks());
}
