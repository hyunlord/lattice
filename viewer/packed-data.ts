import { object } from './data.js';
import { packedHash } from './packed-hash.js';
export type PackedSelection = { readonly [field: string]: true | PackedSelection; };
const CAP = 262144;
function safe(path: string): void { if (!/^[A-Za-z0-9._/-]+$/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid packed artifact path'); }
function bucket(path: string): string { let value = 0; for (const char of path) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); }
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** Cache lifetime belongs to one viewer generation; failures are never cached. */
export function createPackedLoader(base = './', suffix = '') {
    const requests = new Map<string, Promise<unknown>>();
    let metadata: Promise<Record<string, unknown> | undefined> | undefined;
    const bounded = async (response: Response): Promise<Uint8Array<ArrayBuffer>> => {
        if (!response.body) throw new Error('Empty packed response');
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
        try { for (; ;) { const item = await reader.read(); if (item.done) break; size += item.value.byteLength; if (size > CAP) throw new Error('Packed response exceeds byte limit'); chunks.push(item.value); } }
        finally { await reader.cancel(); reader.releaseLock(); }
        const result = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; } return result;
    };
    const read = (path: string, compressed = false): Promise<unknown> => {
        safe(path); const cached = requests.get(path); if (cached) return cached;
        const pending = (async () => {
            const response = await fetch(base + path + suffix);
            if (!response.ok) throw new Error(`Packed artifact HTTP ${response.status}: ${path}`);
            const bytes = await bounded(response);
            if (compressed) {
                if (!/^(?:packs\/[a-f0-9]{64}|transport\/(?:packs-\d+|files-[a-f0-9]{2}(?:-\d+)?))\.json.gz$/u.test(path)) throw new Error('Invalid pack path');
                const digest = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') : packedHash(bytes);
                if (path.startsWith('packs/') && path !== `packs/${digest}.json.gz`) throw new Error('Packed artifact hash mismatch');
                const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
                return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await bounded(new Response(stream))));
            }
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        })();
        requests.set(path, pending); void pending.catch(() => { if (requests.get(path) === pending) requests.delete(path); });
        if (requests.size > 32) { const first = requests.keys().next().value; if (first) requests.delete(first); }
        return pending;
    };
    const manifest = (): Promise<Record<string, unknown> | undefined> => {
        if (metadata) return metadata;
        const pending = (async () => {
            const response = await fetch(base + 'transport.json' + suffix);
            if (response.status === 404) return undefined;
            if (!response.ok) throw new Error(`Transport HTTP ${response.status}`);
            const value: unknown = JSON.parse(new TextDecoder().decode(await bounded(response)));
            if (!object(value) || value['transportVersion'] !== 2 || value['indexEncoding'] !== undefined && value['indexEncoding'] !== 'gzip' || value['packPageSize'] !== 256 || !integer(value['packCount']) || !integer(value['fileCount'])) throw new Error('Invalid transport manifest');
            return value;
        })();
        metadata = pending; void pending.catch(() => { metadata = undefined; }); return pending;
    };
    const reference = async (value: unknown[], active: ReadonlySet<string>) => {
        const [, data, key] = value;
        if (value.length !== 3 || !integer(data) || !integer(key)) throw new Error('Invalid packed reference');
        const identity = `${data}:${key}`; if (active.has(identity) || active.size > 256) throw new Error('Cyclic packed reference');
        const info = await manifest(); if (!info || typeof info['packCount'] !== 'number' || data >= info['packCount']) throw new Error('Missing packed reference');
        const zipped = info['indexEncoding'] === 'gzip';
        const catalog = await read(`transport/packs-${Math.floor(data / 256)}.json${zipped ? '.gz' : ''}`, zipped);
        const path: unknown = Array.isArray(catalog) ? catalog[data % 256] : undefined;
        if (typeof path !== 'string' || !/^packs\/[a-f0-9]{64}\.json\.gz$/u.test(path)) throw new Error('Missing or invalid pack');
        const pack = await read(path, true); if (!Array.isArray(pack) || key >= pack.length) throw new Error('Missing packed record');
        return { value: pack[key], active: new Set([...active, identity]) };
    };
    const decode = async (value: unknown, active: ReadonlySet<string> = new Set()): Promise<unknown> => {
        if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
        if (!Array.isArray(value)) throw new Error('Invalid packed record');
        const [tag, data] = value;
        switch (tag) {
            case 'r': {
                const record = await reference(value, active); return decode(record.value, record.active);
            }
            case 'a': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed array');
                const result: unknown[] = []; for (const item of data) result.push(await decode(item, active)); return result;
            }
            case 'o': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed object');
                const result: Record<string, unknown> = {};
                for (const entry of data) {
                    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid packed object field');
                    const field = await decode(entry[0], active);
                    if (typeof field !== 'string' || Object.hasOwn(result, field)) throw new Error('Invalid packed object field');
                    Object.defineProperty(result, field, { value: await decode(entry[1], active), enumerable: true, configurable: true, writable: true });
                }
                return result;
            }
            case 'c': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed array chunks');
                const result: unknown[] = []; for (const ref of data) { const part = await decode(ref, active); if (!Array.isArray(part)) throw new Error('Invalid packed array chunk'); for (const item of part) result.push(item); } return result;
            }
            case 'm': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed object chunks');
                const result: Record<string, unknown> = {}; for (const ref of data) { const part = await decode(ref, active); if (!object(part)) throw new Error('Invalid packed object chunk'); for (const [key, item] of Object.entries(part)) { if (Object.hasOwn(result, key)) throw new Error('Duplicate packed field'); Object.defineProperty(result, key, { value: item, enumerable: true, configurable: true, writable: true }); } } return result;
            }
            case 's': {
                if (value.length !== 2) throw new Error('Invalid packed JSON string');
                return JSON.stringify(await decode(data, active));
            }
            case 'j': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed fragments');
                const pieces: string[] = [];
                for (const ref of data) { const piece = await decode(ref, active); if (typeof piece !== 'string') throw new Error('Invalid packed fragment'); pieces.push(piece); }
                return decode(JSON.parse(pieces.join('')), active);
            }
            default: throw new Error('Unknown packed record version');
        }
    };
    const projectPlain = (value: unknown, selection: PackedSelection): unknown => {
        if (!object(value)) throw new Error('Selected packed value must be an object');
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(selection)) if (Object.hasOwn(value, key)) Object.defineProperty(result, key, { value: selection[key] === true ? value[key] : projectPlain(value[key], selection[key] as PackedSelection), enumerable: true });
        return result;
    };
    const project = async (value: unknown, selection: PackedSelection, active: ReadonlySet<string> = new Set()): Promise<{ value: Record<string, unknown>; keys: Set<string>; }> => {
        if (!Array.isArray(value)) throw new Error('Selected packed value must be an object');
        const [tag, data] = value;
        if (tag === 'r') { const record = await reference(value, active); return project(record.value, selection, record.active); }
        if (tag === 'j') {
            if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed fragments');
            const pieces: string[] = [];
            for (const ref of data) { const piece = await decode(ref, active); if (typeof piece !== 'string') throw new Error('Invalid packed fragment'); pieces.push(piece); }
            return project(JSON.parse(pieces.join('')), selection, active);
        }
        if (value.length !== 2 || !Array.isArray(data) || tag !== 'o' && tag !== 'm') throw new Error('Selected packed value must be an object');
        const result: Record<string, unknown> = {}, keys = new Set<string>();
        if (tag === 'm') {
            for (const ref of data) {
                const part = await project(ref, selection, active);
                for (const key of part.keys) { if (keys.has(key)) throw new Error('Duplicate packed field'); keys.add(key); }
                for (const [key, item] of Object.entries(part.value)) Object.defineProperty(result, key, { value: item, enumerable: true });
            }
        } else {
            for (const entry of data) {
                if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid packed object field');
                const field = await decode(entry[0], active);
                if (typeof field !== 'string' || keys.has(field)) throw new Error('Invalid packed object field'); keys.add(field);
                if (!Object.hasOwn(selection, field)) continue;
                const child = selection[field];
                const item = child === true ? await decode(entry[1], active) : (await project(entry[1], child as PackedSelection, active)).value;
                Object.defineProperty(result, field, { value: item, enumerable: true });
            }
        }
        return { value: result, keys };
    };
    const json = async (path: string, selection?: PackedSelection): Promise<unknown> => {
        safe(path);
        const info = await manifest();
        if (!info) { const response = await fetch(base + path + suffix); if (!response.ok) throw new Error(`Artifact HTTP ${response.status}: ${path}`); const value: unknown = await response.json(); return selection ? projectPlain(value, selection) : value; }
        const direct = /^records\/(\d+)\/(\d+)\/[A-Za-z0-9_-]+\.json$/u.exec(path);
        if (direct) { const value = ['r', Number(direct[1]), Number(direct[2])]; return selection ? (await project(value, selection)).value : decode(value); }
        const zipped = info['indexEncoding'] === 'gzip';
        const index = await read(`transport/files-${bucket(path)}.json${zipped ? '.gz' : ''}`, zipped);
        let rows: unknown;
        if (object(index)) {
            rows = index['files'];
            if (Object.keys(index).length !== 1 || !Array.isArray(rows)) throw new Error('Invalid inline file index');
            let previous: string | undefined;
            for (const row of rows) {
                if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || previous !== undefined && previous >= row[0] || !Array.isArray(row[1]) || row[1].length !== 3 || row[1][0] !== 'r' || !integer(row[1][1]) || !integer(row[1][2])) throw new Error('Invalid inline file row');
                safe(row[0]); previous = row[0];
            }
        }
        else {
            if (!Array.isArray(index)) throw new Error('Invalid packed file index');
            const range: unknown = index.find((item: unknown) => object(item) && typeof item['first'] === 'string' && typeof item['last'] === 'string' && item['first'] <= path && path <= item['last']);
            if (!object(range) || typeof range['path'] !== 'string' || !/^transport\/files-[a-f0-9]{2}-\d+\.json(?:\.gz)?$/u.test(range['path'])) throw new Error(`Artifact HTTP 404: ${path}`);
            rows = await read(range['path'], range['path'].endsWith('.gz'));
        }
        if (!Array.isArray(rows)) throw new Error('Invalid packed file page');
        const row: unknown = rows.find((item: unknown) => Array.isArray(item) && item[0] === path);
        if (!Array.isArray(row) || row.length !== 2) throw new Error(`Artifact HTTP 404: ${path}`);
        return selection ? (await project(row[1], selection)).value : decode(row[1]);
    };
    const text = async (path: string): Promise<string> => {
        safe(path);
        if (await manifest()) return JSON.stringify(await json(path));
        const response = await fetch(base + path + suffix);
        if (!response.ok) throw new Error(`Artifact HTTP ${response.status}: ${path}`);
        return response.text();
    };
    return { json, text };
}
const loaders = new Map<string, ReturnType<typeof createPackedLoader>>();
export function packedLoader(suffix = '') { let loader = loaders.get(suffix); if (!loader) { loader = createPackedLoader('./', suffix); loaders.set(suffix, loader); if (loaders.size > 4) { const oldest = loaders.keys().next().value; if (oldest !== undefined) loaders.delete(oldest); } } return loader; }
