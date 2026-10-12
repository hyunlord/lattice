import { object } from './data.js';
import { packedHash } from './packed-hash.js';
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
                if (!/^packs\/[a-f0-9]{64}\.json.gz$/u.test(path)) throw new Error('Invalid pack path');
                const digest = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') : packedHash(bytes);
                if (path !== `packs/${digest}.json.gz`) throw new Error('Packed artifact hash mismatch');
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
            if (!object(value) || value['transportVersion'] !== 2 || value['packPageSize'] !== 256 || !integer(value['packCount']) || !integer(value['fileCount'])) throw new Error('Invalid transport manifest');
            return value;
        })();
        metadata = pending; void pending.catch(() => { metadata = undefined; }); return pending;
    };
    const decode = async (value: unknown, active: ReadonlySet<string> = new Set()): Promise<unknown> => {
        if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
        if (!Array.isArray(value)) throw new Error('Invalid packed record');
        const [tag, data, key] = value;
        switch (tag) {
            case 'r': {
                if (value.length !== 3 || !integer(data) || !integer(key)) throw new Error('Invalid packed reference');
                const identity = `${data}:${key}`; if (active.has(identity) || active.size > 256) throw new Error('Cyclic packed reference');
                const info = await manifest(); if (!info || typeof info['packCount'] !== 'number' || data >= info['packCount']) throw new Error('Missing packed reference');
                const catalog = await read(`transport/packs-${Math.floor(data / 256)}.json`);
                const path: unknown = Array.isArray(catalog) ? catalog[data % 256] : undefined;
                if (typeof path !== 'string') throw new Error('Missing pack');
                const pack = await read(path, true); if (!Array.isArray(pack) || key >= pack.length) throw new Error('Missing packed record');
                return decode(pack[key], new Set([...active, identity]));
            }
            case 'a': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed array');
                const result: unknown[] = []; for (const item of data) result.push(await decode(item, active)); return result;
            }
            case 'o': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed object');
                const result: Record<string, unknown> = {};
                for (const entry of data) {
                    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || Object.hasOwn(result, entry[0])) throw new Error('Invalid packed object field');
                    Object.defineProperty(result, entry[0], { value: await decode(entry[1], active), enumerable: true, configurable: true, writable: true });
                }
                return result;
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
    const json = async (path: string): Promise<unknown> => {
        safe(path);
        if (!await manifest()) { const response = await fetch(base + path + suffix); if (!response.ok) throw new Error(`Artifact HTTP ${response.status}: ${path}`); return response.json(); }
        const ranges = await read(`transport/files-${bucket(path)}.json`);
        if (!Array.isArray(ranges)) throw new Error('Invalid packed file index');
        const range: unknown = ranges.find((item: unknown) => object(item) && typeof item['first'] === 'string' && typeof item['last'] === 'string' && item['first'] <= path && path <= item['last']);
        if (!object(range) || typeof range['path'] !== 'string' || !/^transport\/files-[a-f0-9]{2}-\d+\.json$/u.test(range['path'])) throw new Error(`Artifact HTTP 404: ${path}`);
        const rows = await read(range['path']);
        if (!Array.isArray(rows)) throw new Error('Invalid packed file page');
        const row: unknown = rows.find((item: unknown) => Array.isArray(item) && item[0] === path);
        if (!Array.isArray(row) || row.length !== 2) throw new Error(`Artifact HTTP 404: ${path}`);
        return decode(row[1]);
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
