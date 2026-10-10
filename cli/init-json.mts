/** Locate JSON object members without reformatting unrelated configuration bytes. */
export function insertServer(text: string, server: unknown): string {
    const source = text || '{}';
    const objectEnds = new Map<string, { end: number; members: number; }>();
    let position = 0;
    const space = (): void => { while (/\s/u.test(source[position] ?? '') && position < source.length) position++; };
    const string = (): string => {
        const start = position++;
        while (position < source.length) {
            const c = source[position++];
            if (c === '\\') position++;
            if (c === '"') return JSON.parse(source.slice(start, position));
        }
        throw new Error('Invalid JSON string');
    };
    const value = (path: readonly string[]): void => {
        space();
        if (source[position] === '"') { string(); return; }
        if (source[position] === '{') {
            position++; space();
            const keys = new Set<string>();
            while (source[position] !== '}') {
                const key = string();
                if (keys.has(key)) throw new Error(`Duplicate JSON configuration key: ${key}`);
                keys.add(key); space(); position++; value([...path, key]); space();
                if (source[position] === ',') { position++; space(); } else break;
            }
            objectEnds.set(JSON.stringify(path), { end: position++, members: keys.size }); return;
        }
        if (source[position] === '[') {
            position++; space();
            while (source[position] !== ']') {
                value([...path, '[]']); space();
                if (source[position] === ',') { position++; space(); } else break;
            }
            position++; return;
        }
        while (position < source.length && !/[\s,\]}]/u.test(source[position] ?? '')) position++;
    };
    value([]);
    const servers = objectEnds.get('["mcpServers"]');
    const target = servers ?? objectEnds.get('[]');
    if (!target) throw new Error('MCP configuration must be an object');
    const addition = servers ? `"lattice": ${JSON.stringify(server)}` : `"mcpServers": {"lattice": ${JSON.stringify(server)}}`;
    return source.slice(0, target.end) + (target.members ? ',' : '') + addition + source.slice(target.end);
}
