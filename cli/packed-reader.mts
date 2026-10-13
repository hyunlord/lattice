import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { object } from './types.mjs';
const CAP = 262144;
function bucket(path: string) { let value = 0; for (const char of path) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); }
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
/** Offline counterpart of the browser version dispatch, including compressed-byte verification. */
export function readPackedArtifact(directory: string, path: string): unknown {
    if (!/^[A-Za-z0-9._/-]+$/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid packed artifact path');
    const cache = new Map<string, unknown>();
    const read = (name: string) => {
        if (!/^[A-Za-z0-9._/-]+$/u.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid packed artifact path');
        if (cache.has(name)) return cache.get(name);
        const bytes = readFileSync(join(directory, name));
        if (bytes.length > CAP) throw new Error('Packed artifact exceeds byte limit');
        let text: string;
        if (name.endsWith('.gz')) {
            if (name.startsWith('packs/') && name !== `packs/${createHash('sha256').update(bytes).digest('hex')}.json.gz`) throw new Error('Packed artifact hash mismatch');
            text = gunzipSync(bytes, { maxOutputLength: CAP }).toString('utf8');
        } else text = bytes.toString('utf8');
        const value: unknown = JSON.parse(text); cache.set(name, value);
        if (cache.size > 32) { const first = cache.keys().next().value; if (first) cache.delete(first); } return value;
    };
    if (!existsSync(join(directory, 'transport.json'))) return JSON.parse(readFileSync(join(directory, path), 'utf8'));
    const manifest = read('transport.json');
    if (!object(manifest) || manifest['transportVersion'] !== 2 || manifest['indexEncoding'] !== undefined && manifest['indexEncoding'] !== 'gzip' || manifest['packPageSize'] !== 256 || !integer(manifest['packCount'])) throw new Error('Invalid transport manifest');
    const packCount = manifest['packCount'], extension = manifest['indexEncoding'] === 'gzip' ? '.gz' : '';
    const decode = (value: unknown, active: ReadonlySet<string> = new Set()): unknown => {
        if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return value;
        if (!Array.isArray(value)) throw new Error('Invalid packed record');
        const [tag, data, key] = value;
        switch (tag) {
            case 'r': {
                if (value.length !== 3 || !integer(data) || !integer(key) || data >= packCount) throw new Error('Invalid packed reference');
                const identity = `${data}:${key}`; if (active.has(identity) || active.size > 256) throw new Error('Cyclic packed reference');
                const paths = read(`transport/packs-${Math.floor(data / 256)}.json${extension}`), path: unknown = Array.isArray(paths) ? paths[data % 256] : undefined;
                if (typeof path !== 'string' || !/^packs\/[a-f0-9]{64}\.json.gz$/u.test(path)) throw new Error('Missing pack');
                const pack = read(path); if (!Array.isArray(pack) || key >= pack.length) throw new Error('Missing packed record');
                return decode(pack[key], new Set([...active, identity]));
            }
            case 'a': if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed array'); return data.map(item => decode(item, active));
            case 'o': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed object');
                const result: Record<string, unknown> = {};
                for (const entry of data) {
                    if (!Array.isArray(entry) || entry.length !== 2) throw new Error('Invalid packed field');
                    const field = decode(entry[0], active);
                    if (typeof field !== 'string' || Object.hasOwn(result, field)) throw new Error('Invalid packed field');
                    Object.defineProperty(result, field, { value: decode(entry[1], active), enumerable: true, configurable: true, writable: true });
                } return result;
            }
            case 'c': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed array chunks');
                const result: unknown[] = []; for (const ref of data) { const part = decode(ref, active); if (!Array.isArray(part)) throw new Error('Invalid packed array chunk'); for (const item of part) result.push(item); } return result;
            }
            case 'm': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed object chunks');
                const result: Record<string, unknown> = {}; for (const ref of data) { const part = decode(ref, active); if (!object(part)) throw new Error('Invalid packed object chunk'); for (const [key, item] of Object.entries(part)) { if (Object.hasOwn(result, key)) throw new Error('Duplicate packed field'); Object.defineProperty(result, key, { value: item, enumerable: true, configurable: true, writable: true }); } } return result;
            }
            case 's': if (value.length !== 2) throw new Error('Invalid packed JSON string'); return JSON.stringify(decode(data, active));
            case 'j': {
                if (value.length !== 2 || !Array.isArray(data)) throw new Error('Invalid packed fragments');
                const pieces = data.map(item => { const value = decode(item, active); if (typeof value !== 'string') throw new Error('Invalid packed fragment'); return value; });
                return decode(JSON.parse(pieces.join('')), active);
            }
            default: throw new Error('Unknown packed record version');
        }
    };
    const direct = /^records\/(\d+)\/(\d+)\/[A-Za-z0-9_-]+\.json$/u.exec(path);
    if (direct) return decode(['r', Number(direct[1]), Number(direct[2])]);
    const index = read(`transport/files-${bucket(path)}.json${extension}`);
    let rows: unknown;
    if (object(index)) {
        rows = index['files'];
        if (Object.keys(index).length !== 1 || !Array.isArray(rows)) throw new Error('Invalid inline file index');
        let previous: string | undefined;
        for (const row of rows) {
            if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || previous !== undefined && previous >= row[0] || !/^[A-Za-z0-9._/-]+$/u.test(row[0]) || row[0].split('/').some((part: string) => !part || part === '.' || part === '..') || !Array.isArray(row[1]) || row[1].length !== 3 || row[1][0] !== 'r' || !integer(row[1][1]) || !integer(row[1][2])) throw new Error('Invalid inline file row');
            previous = row[0];
        }
    }
    else {
        if (!Array.isArray(index)) throw new Error('Invalid packed file index');
        const range: unknown = index.find((item: unknown) => object(item) && typeof item['first'] === 'string' && typeof item['last'] === 'string' && item['first'] <= path && path <= item['last']);
        if (!object(range) || typeof range['path'] !== 'string' || !/^transport\/files-[a-f0-9]{2}-\d+\.json(?:\.gz)?$/u.test(range['path'])) throw new Error(`Packed artifact missing: ${path}`);
        rows = read(range['path']);
    }
    if (!Array.isArray(rows)) throw new Error('Invalid packed file page');
    const row: unknown = rows.find((item: unknown) => Array.isArray(item) && item[0] === path);
    if (!Array.isArray(row) || row.length !== 2) throw new Error(`Packed artifact missing: ${path}`);
    return decode(row[1]);
}
