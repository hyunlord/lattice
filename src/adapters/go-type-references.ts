import type { CodeToken } from './code-tokens.js';
import type { JsonObject } from '../core/canonical.js';
import { nativeTokens } from './native-tokens.js';

type Parsed = { readonly end: number; readonly uses: readonly CodeToken[]; };
/** A deliberately partial type grammar: unsupported or shadowed declarations contribute no evidence. */
export function goTypeEvidence(text: string): JsonObject {
    const tokens = nativeTokens(text, false, { language: 'go', literals: true });
    const value = (index: number): string => tokens[index]?.kind === 'string' ? '' : tokens[index]?.value ?? '';
    const matching = (start: number): number => {
        const ends: Readonly<Record<string, string>> = { '(': ')', '[': ']', '{': '}' };
        const stack: string[] = [];
        for (let index = start; index < tokens.length; index++) {
            if (tokens[index]?.kind !== 'symbol') continue;
            const current = value(index), ending = ends[current];
            if (ending) stack.push(ending);
            else if (current === stack.at(-1)) { stack.pop(); if (!stack.length) return index; }
        }
        return tokens.length;
    };
    const split = (start: number, end: number, fields = false): readonly (readonly [number, number])[] => {
        const parts: [number, number][] = [];
        let begin = start;
        for (let cursor = start; cursor < end; cursor++) {
            if (tokens[cursor]?.kind === 'symbol' && ['(', '[', '{'].includes(value(cursor))) cursor = matching(cursor);
            const separator = tokens[cursor]?.kind === 'symbol' && (fields ? value(cursor) === ';' : value(cursor) === ',');
            const nextLine = fields && cursor + 1 < end && (tokens[cursor + 1]?.line ?? 0) > (tokens[cursor]?.line ?? 0) && (tokens[cursor]?.kind === 'word' || tokens[cursor]?.kind === 'string' || [')', ']', '}'].includes(value(cursor)));
            if (separator || nextLine) { parts.push([begin, separator ? cursor : cursor + 1]); begin = cursor + 1; }
        }
        if (begin < end) parts.push([begin, end]);
        return parts.filter(([a, b]) => a < b);
    };
    const parameters = (start: number, end: number): readonly CodeToken[] | undefined => {
        const parts = split(start, end);
        const named = parts.some(([a, b]) => tokens[a]?.kind === 'word' && a + 1 < b && value(a + 1) !== '.' && (value(a + 1) !== '[' || value(a + 2) === ']'));
        const uses: CodeToken[] = [];
        for (const [a, b] of parts) {
            if (named && a + 1 === b && tokens[a]?.kind === 'word') continue;
            const from = named ? a + 1 : a;
            if (named && tokens[a]?.kind !== 'word') return undefined;
            const parsed = type(from, b);
            if (!parsed || parsed.end !== b) return undefined;
            uses.push(...parsed.uses);
        }
        return uses;
    };
    const signature = (start: number, limit: number): Parsed | undefined => {
        if (value(start) !== '(') return undefined;
        const end = matching(start);
        if (end >= limit) return undefined;
        const params = parameters(start + 1, end);
        if (!params) return undefined;
        const next = end + 1;
        if (value(next) === '(') {
            const resultEnd = matching(next), results = parameters(next + 1, resultEnd);
            return results && resultEnd < limit ? { end: resultEnd + 1, uses: [...params, ...results] } : undefined;
        }
        if (next < limit && !['{', ';', '}'].includes(value(next)) && tokens[next]?.line === tokens[end]?.line) {
            const result = type(next, limit);
            return result ? { end: result.end, uses: [...params, ...result.uses] } : undefined;
        }
        return { end: next, uses: params };
    };
    const type = (start: number, limit: number): Parsed | undefined => {
        if (start >= limit) return undefined;
        const token = tokens[start];
        if (!token) return undefined;
        if (value(start) === '*') return type(start + 1, limit);
        if (value(start) === '.' && value(start + 1) === '.' && value(start + 2) === '.') return type(start + 3, limit);
        if (value(start) === '[') {
            const end = matching(start);
            if (end !== start + 1) return undefined;
            return type(end + 1, limit);
        }
        if (value(start) === 'func') return signature(start + 1, limit);
        if (value(start) === 'struct' && value(start + 1) === '{') {
            const end = matching(start + 1), uses: CodeToken[] = [];
            if (end >= limit) return undefined;
            for (const [a, b] of split(start + 2, end, true)) {
                let from = a;
                if (tokens[from]?.kind === 'word' && from + 1 < b && value(from + 1) !== '.' && (value(from + 1) !== '[' || value(from + 2) === ']')) {
                    while (value(from + 1) === ',' && tokens[from + 2]?.kind === 'word') from += 2;
                    from++;
                }
                const last = tokens[b - 1]?.kind === 'string' ? b - 1 : b;
                const field = type(from, last);
                if (field?.end === last) uses.push(...field.uses);
            }
            return { end: end + 1, uses };
        }
        if (token.kind !== 'word' || ['interface', 'map', 'chan'].includes(token.value)) return undefined;
        if (value(start + 1) === '.') return tokens[start + 2]?.kind === 'word' && value(start + 3) !== '[' ? { end: start + 3, uses: [] } : undefined;
        if (value(start + 1) === '[') return undefined;
        return { end: start + 1, uses: [token] };
    };
    // Import aliases have file scope. Dot imports make unqualified ownership unknowable.
    const aliases = new Set<string>();
    let dotImport = false;
    for (let index = 0; index < tokens.length; index++) if (tokens[index]?.kind === 'word' && value(index) === 'import') {
        const end = value(index + 1) === '(' ? matching(index + 1) : tokens.findIndex((token, position) => position > index && token.kind === 'string');
        for (let cursor = index + 1; cursor <= end; cursor++) if (tokens[cursor]?.kind === 'string') {
            const previous = tokens[cursor - 1];
            if (previous?.value === '.') dotImport = true;
            const alias = previous?.kind === 'word' && previous.value !== 'import' ? previous.value : tokens[cursor]?.value.split('/').at(-1);
            if (alias) aliases.add(alias);
        }
        index = Math.max(index, end);
    }
    const uses: CodeToken[] = [];
    const declarations: JsonObject[] = [];
    for (let index = 0; index < tokens.length; index++) {
        if (tokens[index]?.kind === 'symbol' && ['{', '(', '['].includes(value(index))) { index = matching(index); continue; }
        if (tokens[index]?.kind !== 'word') continue;
        if (value(index) === 'type' && value(index + 1) === '(') {
            const end = matching(index + 1);
            for (const [start] of split(index + 2, end, true)) {
                const name = tokens[start];
                if (name?.kind === 'word') declarations.push({ name: name.value, line: name.line });
            }
            index = end; continue;
        }
        if (value(index) === 'type' && tokens[index + 1]?.kind === 'word') {
            const name = tokens[index + 1];
            if (name) declarations.push({ name: name.value, line: name.line });
            if (value(index + 2) === '[') continue;
            const start = value(index + 2) === '=' ? index + 3 : index + 2;
            const parsed = type(start, tokens.length);
            if (parsed) { uses.push(...parsed.uses); index = parsed.end - 1; }
        } else if (value(index) === 'func') {
            let cursor = index + 1;
            let receiver: readonly CodeToken[] = [];
            if (value(cursor) === '(') {
                const end = matching(cursor), parsed = parameters(cursor + 1, end);
                if (!parsed) continue;
                receiver = parsed; cursor = end + 1;
            }
            if (tokens[cursor]?.kind !== 'word' || value(cursor + 1) !== '(') continue;
            const parsed = signature(cursor + 1, tokens.length);
            if (parsed) { uses.push(...receiver, ...parsed.uses); index = parsed.end - 1; }
        }
    }
    const unique = new Map<string, JsonObject>();
    for (const token of uses) if (!aliases.has(token.value)) unique.set(`${token.line}:${token.value}`, { name: token.value, line: token.line });
    return { declaredTypeReferences: dotImport ? [] : [...unique.values()], packageTypeDeclarations: declarations };
}
