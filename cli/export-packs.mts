import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { object } from './types.mjs';
import { DigestIndex } from './export-digest-index.mjs';

type Ref = readonly ['r', number, number];
type Value = null | boolean | number | string | readonly Value[];
const CAP = 262144, TARGET = 240000, PACK_PAGE = 256;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
function bucket(path: string) { let value = 0; for (const char of path) value = (value * 31 + (char.codePointAt(0) ?? 0)) >>> 0; return (value % 256).toString(16).padStart(2, '0'); }
function safe(path: string) { if (!/^[A-Za-z0-9._/-]+$/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid packed artifact path'); }
/** A bounded record store shared by all views and snapshots in one atomic generation. */
export function createPackedExport(directory: string) {
    const packDirectory = join(directory, 'packs'), indexDirectory = join(directory, 'transport');
    const spool = join(directory, '.pack-index');
    mkdirSync(packDirectory, { recursive: true }); mkdirSync(indexDirectory, { recursive: true }); mkdirSync(spool);
    const identifiers = new Set<string>();
    const records = new DigestIndex(), paths = new Set<string>(), packPaths: string[] = [], packSizes: number[] = [];
    let pending: string[] = [], bytes = 2, finished = false;
    const flush = () => {
        if (!pending.length) return;
        const text = '[' + pending.join(',') + ']', data = gzipSync(text, { level: 9 });
        if (Buffer.byteLength(text) > CAP || data.length > CAP) throw new Error('Packed artifact exceeds byte limit');
        const path = `packs/${hash(data)}.json.gz`;
        writeFileSync(join(directory, path), data); packPaths.push(path); packSizes.push(pending.length); pending = []; bytes = 2;
    };
    const save = (value: Value): Ref => {
        const text = JSON.stringify(value), digest = createHash('sha256').update(text).digest(), previous = records.get(digest);
        if (previous !== undefined) return ['r', Math.floor(previous / CAP), previous % CAP];
        if (Buffer.byteLength(text) > TARGET) {
            const fragments: Value[] = [];
            for (let start = 0; start < text.length;) {
                let end = Math.min(start + 16000, text.length);
                if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1] ?? '')) end--;
                fragments.push(save(text.slice(start, end))); start = end;
            }
            const ref = save(['j', fragments]); records.set(digest, ref[1] * CAP + ref[2]); return ref;
        }
        const size = Buffer.byteLength(text) + (pending.length ? 1 : 0);
        if (bytes + size > TARGET) flush();
        const ref: Ref = ['r', packPaths.length, pending.length];
        pending.push(text); bytes += size; records.set(digest, ref[1] * CAP + ref[2]); return ref;
    };
    const encode = (value: unknown, shared = true, inlineKeys = false): Value => {
        if (typeof value === 'string' && identifiers.has(value)) return save(value);
        if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return value;
        if (Array.isArray(value)) {
            if (value.length <= 256) return ['a', value.map(item => encode(item, true, inlineKeys))];
            const parts: Value[] = [];
            for (let offset = 0; offset < value.length; offset += 256) parts.push(save(['a', value.slice(offset, offset + 256).map(item => encode(item, true, inlineKeys))]));
            return ['c', parts];
        }
        if (!object(value)) throw new Error('Packed artifacts must be JSON values');
        if (shared && typeof value['id'] === 'string' && (Object.hasOwn(value, 'sources') || Object.hasOwn(value, 'attributes'))) {
            const body: Record<string, unknown> = {}, fields: Value[] = [];
            for (const key in value) if (Object.hasOwn(value, key)) {
                if (key === 'sources' || key === 'attributes') { if (value[key] !== undefined) fields.push(save(['o', [[key, encode(value[key], true, inlineKeys)]]])); }
                else Object.defineProperty(body, key, { value: value[key], enumerable: true });
            }
            return save(['m', [save(encode(body, false, inlineKeys)), ...fields]]);
        }
        let entries: Value[] = []; const parts: Value[] = [];
        for (const key in value) if (Object.hasOwn(value, key) && value[key] !== undefined) {
            entries.push([!inlineKeys && identifiers.has(key) ? save(key) : key, encode(value[key], true, inlineKeys)]);
            if (entries.length === 256) { parts.push(save(['o', entries])); entries = []; }
        }
        if (parts.length && entries.length) parts.push(save(['o', entries]));
        const encoded: Value = parts.length ? ['m', parts] : ['o', entries];
        // Share immutable graph records and exact source records, preserving all provenance.
        return shared && (typeof value['id'] === 'string' || typeof value['path'] === 'string' && typeof value['contentHash'] === 'string') ? save(encoded) : encoded;
    };
    const json = (path: string, value: unknown, options: { readonly inlineKeys?: boolean; } = {}) => {
        safe(path); if (path.startsWith('records/')) throw new Error('Reserved packed record path'); if (finished) throw new Error('Packed export is closed'); const identity = createHash('sha256').update(path).digest('base64'); if (paths.has(identity)) return;
        paths.add(identity); const ref = save(encode(value, true, options.inlineKeys));
        appendFileSync(join(spool, bucket(path)), JSON.stringify([path, ref]) + '\n');
    };
    const bounded = (path: string, value: unknown) => {
        const text = JSON.stringify(value);
        if (Buffer.byteLength(text) > CAP) throw new Error('Packed index exceeds byte limit');
        const data = gzipSync(text, { level: 9 });
        if (data.length > CAP) throw new Error('Packed index exceeds byte limit');
        writeFileSync(join(indexDirectory, path + '.gz'), data);
    };
    return {
        json,
        identifiers(values: Iterable<{ readonly id: string; }>) {
            if (finished) throw new Error('Packed export is closed');
            for (const value of values) identifiers.add(value.id);
        },
        reference(value: unknown, label = 'value') {
            if (finished || !/^[A-Za-z0-9_-]+$/u.test(label)) throw new Error('Invalid direct packed reference');
            const [, pack, record] = save(encode(value));
            return `records/${pack}/${record}/${label}.json`;
        },
        write: (path: string, text: string) => json(path, JSON.parse(text)),
        finish() {
            if (finished) throw new Error('Packed export is closed'); flush();
            for (let index = 0; index < packPaths.length; index += PACK_PAGE) bounded(`packs-${index / PACK_PAGE}.json`, packPaths.slice(index, index + PACK_PAGE));
            for (let index = 0; index < 256; index++) {
                const key = index.toString(16).padStart(2, '0'); let lines: string[];
                try { lines = readFileSync(join(spool, key), 'utf8').trimEnd().split('\n'); }
                catch (error) { if (!object(error) || error['code'] !== 'ENOENT') throw error; lines = []; }
                const rows: [string, Ref][] = lines.filter(Boolean).map(line => JSON.parse(line)); rows.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
                let inlineSize = 12;
                for (const [index, row] of rows.entries()) { inlineSize += Buffer.byteLength(JSON.stringify(row)) + (index ? 1 : 0); if (inlineSize > TARGET) break; }
                if (rows.length && inlineSize <= TARGET) { bounded(`files-${key}.json`, { files: rows }); continue; }
                const ranges: { first: string; last: string; path: string; }[] = [];
                for (let start = 0; start < rows.length;) {
                    const part: [string, Ref][] = []; let size = 2;
                    while (start < rows.length) { const row = rows[start]; if (!row) break; const extra = Buffer.byteLength(JSON.stringify(row)) + 1; if (part.length && size + extra > TARGET) break; part.push(row); size += extra; start++; }
                    const first = part[0], last = part.at(-1); if (!first || !last) throw new Error('Empty packed lookup');
                    const path = `files-${key}-${ranges.length}.json`; bounded(path, part); ranges.push({ first: first[0], last: last[0], path: `transport/${path}.gz` });
                }
                bounded(`files-${key}.json`, ranges);
            }
            // Reference ordinals are immutable; validate persisted records and every direct reference before publication.
            const inspect = (value: unknown): void => {
                if (!Array.isArray(value)) return;
                if (value[0] === 'r') {
                    const [, pack, key] = value;
                    if (value.length !== 3 || typeof pack !== 'number' || !Number.isSafeInteger(pack) || pack < 0 || typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0 || key >= (packSizes[pack] ?? 0)) throw new Error('Invalid packed reference before publication');
                } else if (value[0] === 'o' && Array.isArray(value[1])) { for (const entry of value[1]) if (Array.isArray(entry)) { inspect(entry[0]); inspect(entry[1]); } }
                else if ((value[0] === 'a' || value[0] === 'j' || value[0] === 'c' || value[0] === 'm') && Array.isArray(value[1])) { for (const child of value[1]) inspect(child); }
                else if (value[0] === 's') inspect(value[1]);
            };
            for (const path of new Set(packPaths)) {
                const data = readFileSync(join(directory, path));
                if (path !== `packs/${hash(data)}.json.gz` || data.length > CAP) throw new Error('Packed artifact verification failed');
                const text = gunzipSync(data, { maxOutputLength: CAP }).toString('utf8');
                const entries: unknown = JSON.parse(text); if (!Array.isArray(entries)) throw new Error('Invalid packed artifact');
                for (const value of entries) inspect(value);
            }
            writeFileSync(join(directory, 'transport.json'), JSON.stringify({ transportVersion: 2, indexEncoding: 'gzip', packPageSize: PACK_PAGE, packCount: packPaths.length, fileCount: paths.size }));
            rmSync(spool, { recursive: true }); records.clear(); paths.clear(); identifiers.clear(); finished = true;
        }
    };
}
