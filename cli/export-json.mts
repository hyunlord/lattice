import { closeSync, openSync, writeSync } from 'node:fs';

// Serialize containers incrementally so a large graph never becomes one V8 string.
export function writeJson(value: unknown, write: (text: string) => void): void {
    let pending = '';
    const emit = (text: string) => { pending += text; if (pending.length >= 65536) { write(pending); pending = ''; } };
    const visit = (item: unknown): void => {
        if (Array.isArray(item)) {
            emit('[');
            for (let index = 0; index < item.length; index++) { if (index) emit(','); visit(item[index] ?? null); }
            emit(']');
        } else if (item !== null && typeof item === 'object') {
            emit('{'); let separator = '';
            for (const key of Object.keys(item)) {
                const child: unknown = (item as Record<string, unknown>)[key];
                if (child === undefined) continue;
                emit(`${separator}${JSON.stringify(key)}:`); visit(child); separator = ',';
            }
            emit('}');
        } else emit(JSON.stringify(item) ?? 'null');
    };
    visit(value); if (pending) write(pending);
}
export function writeJsonFile(path: string, produce: (write: (text: string) => void) => void): void {
    const descriptor = openSync(path, 'w'); let pending = '';
    const flush = () => { const bytes = Buffer.from(pending); let offset = 0; while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset, bytes.length - offset); pending = ''; };
    try { produce(text => { pending += text; if (pending.length >= 65536) flush(); }); if (pending) flush(); }
    finally { closeSync(descriptor); }
}
