/** Conservative TOML validation for configuration editing; unsupported syntax fails before writes. */
export function validateToml(text: string): readonly string[] {
    let position = 0;
    const tables = new Set<string>();
    const values = new Set<string>();
    let section: string[] = [];
    const fail = (): never => { throw new Error(`Cannot safely edit TOML near character ${position}: malformed or unsupported configuration`); };
    const whitespace = (multiline = false): void => {
        while (position < text.length) {
            const c = text[position];
            if (c === ' ' || c === '\t' || (multiline && (c === '\r' || c === '\n'))) position++;
            else if (c === '#') { while (position < text.length && text[position] !== '\n') position++; }
            else break;
        }
    };
    const quoted = (): string => {
        const quote = text[position++];
        let result = '';
        while (position < text.length) {
            const c = text[position++];
            if (c === quote) return result;
            if (c === '\n' || c === '\r' || c === undefined || c.charCodeAt(0) < 32) fail();
            if (c === '\\' && quote === '"') {
                const escape = text[position++];
                if (escape === 'u' || escape === 'U') {
                    const length = escape === 'u' ? 4 : 8;
                    const digits = text.slice(position, position + length);
                    if (!new RegExp(`^[0-9A-Fa-f]{${length}}$`, 'u').test(digits)) fail();
                    const point = Number.parseInt(digits, 16);
                    if (point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) fail();
                    result += String.fromCodePoint(point); position += length;
                } else {
                    const escapes: Readonly<Record<string, string>> = { b: '\b', t: '\t', n: '\n', f: '\f', r: '\r', '"': '"', '\\': '\\' };
                    if (escape === undefined) return fail();
                    const decoded = escapes[escape];
                    if (decoded === undefined) return fail();
                    result += decoded;
                }
            } else result += c;
        }
        return fail();
    };
    const key = (): string[] => {
        const parts: string[] = [];
        while (true) {
            whitespace();
            if (text[position] === '"' || text[position] === "'") parts.push(quoted());
            else {
                const token = /^[A-Za-z0-9_-]+/u.exec(text.slice(position))?.[0];
                if (!token) return fail();
                parts.push(token); position += token.length;
            }
            whitespace();
            if (text[position] !== '.') return parts;
            position++;
        }
    };
    const value = (): void => {
        whitespace();
        const c = text[position];
        if (c === '"' || c === "'") { quoted(); return; }
        if (c === '[') {
            position++; whitespace(true);
            while (text[position] !== ']') {
                value(); whitespace(true);
                if (text[position] === ']') break;
                if (text[position++] !== ',') fail();
                whitespace(true);
            }
            position++; return;
        }
        if (c === '{') {
            const keys = new Set<string>();
            position++; whitespace();
            while (text[position] !== '}') {
                const name = JSON.stringify(key());
                if (keys.has(name) || text[position++] !== '=') fail();
                keys.add(name); value(); whitespace();
                if (text[position] === '}') break;
                if (text[position++] !== ',') fail();
                whitespace();
                if (text[position] === '}') fail();
            }
            position++; return;
        }
        const token = /^[^\s,#\]}]+/u.exec(text.slice(position))?.[0];
        if (!token || !/^(?:true|false|[+-]?(?:inf|nan)|[+-]?(?:0|[1-9](?:_?\d)*)(?:\.(?:\d(?:_?\d)*))?(?:[eE][+-]?\d(?:_?\d)*)?|0x[\da-fA-F](?:_?[\da-fA-F])*|0o[0-7](?:_?[0-7])*|0b[01](?:_?[01])*)$/u.test(token)) return fail();
        position += token.length;
    };
    while (position < text.length) {
        whitespace(true);
        if (position === text.length) break;
        if (text[position] === '[') {
            position++; section = key();
            if (text[position++] !== ']') fail();
            const name = JSON.stringify(section);
            if (tables.has(name) || values.has(name)) fail();
            for (let i = 1; i < section.length; i++) if (values.has(JSON.stringify(section.slice(0, i)))) fail();
            tables.add(name);
        } else {
            const parts = [...section, ...key()];
            const name = JSON.stringify(parts);
            if (values.has(name) || tables.has(name) || [...values, ...tables].some(existing => existing.startsWith(name.slice(0, -1) + ',')) || text[position++] !== '=') fail();
            for (let i = 1; i < parts.length; i++) if (values.has(JSON.stringify(parts.slice(0, i)))) fail();
            values.add(name); value();
        }
        whitespace();
        if (position < text.length && text[position] !== '\r' && text[position] !== '\n') fail();
    }
    return [...tables, ...values];
}
