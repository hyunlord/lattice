import { packedHash } from './packed-hash.js';

const assetLimit = 256 * 1024;
type AssetPack = { readonly path: string; readonly hash: string; readonly encoded: number; readonly decoded: number; readonly modules: readonly string[]; };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const moduleName = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]+\.js$/u.test(value);
const size = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= assetLimit;
async function bounded(stream: ReadableStream<Uint8Array> | null): Promise<Uint8Array<ArrayBuffer>> {
    if (!stream) throw new Error('Empty viewer asset response');
    const reader = stream.getReader(), chunks: Uint8Array[] = []; let length = 0;
    try {
        while (true) {
            const next = await reader.read(); if (next.done) break;
            length += next.value.length;
            if (length > assetLimit) { await reader.cancel(); throw new Error('Viewer asset exceeds 256KiB'); }
            chunks.push(next.value);
        }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
}
async function fetchAsset(path: string): Promise<Uint8Array<ArrayBuffer>> {
    const url = new URL(`./asset-archives/${path}`, document.baseURI);
    const generation = document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content; if (generation) url.searchParams.set('generation', generation);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Viewer asset HTTP ${response.status}: ${path}`);
    return bounded(response.body);
}
function manifest(value: unknown): { readonly version: 1 | 2; readonly entry: string; readonly packs: readonly AssetPack[]; } {
    if (!record(value) || (value['version'] !== 1 && value['version'] !== 2) || !moduleName(value['entry']) || !Array.isArray(value['packs']) || !value['packs'].length) throw new Error('Invalid viewer asset manifest');
    const version = value['version'];
    const names = new Set<string>(), paths = new Map<string, string>();
    const packs = value['packs'].map((pack: unknown): AssetPack => {
        if (!record(pack) || typeof pack['hash'] !== 'string' || !/^[a-f0-9]{64}$/u.test(pack['hash']) || pack['path'] !== `${pack['hash']}.gz` || !size(pack['encoded']) || !size(pack['decoded'])) throw new Error('Invalid viewer asset pack');
        const path = `${pack['hash']}.gz`, lengths = `${pack['encoded']}:${pack['decoded']}`;
        if (paths.has(path) && (version === 1 || paths.get(path) !== lengths)) throw new Error('Duplicate or inconsistent viewer asset pack');
        paths.set(path, lengths);
        const modules = version === 1 ? pack['modules'] : [];
        if (!Array.isArray(modules) || (version === 1 && !modules.length) || !modules.every(moduleName)) throw new Error('Invalid viewer asset modules');
        for (const name of modules) { if (names.has(name)) throw new Error('Duplicate viewer module'); names.add(name); }
        return { path, hash: pack['hash'], encoded: pack['encoded'], decoded: pack['decoded'], modules };
    });
    if (version === 1 && !names.has(value['entry'])) throw new Error('Missing viewer entry module');
    return { version, entry: value['entry'], packs };
}
async function readPack(pack: AssetPack): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = await fetchAsset(pack.path);
    if (bytes.length !== pack.encoded) throw new Error('Viewer asset integrity mismatch');
    const digest = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') : packedHash(bytes);
    if (digest !== pack.hash) throw new Error('Viewer asset integrity mismatch');
    const decoded = await bounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
    if (decoded.length !== pack.decoded) throw new Error('Viewer asset decoded size mismatch');
    return decoded;
}
async function publishBundle(chunks: readonly Uint8Array<ArrayBuffer>[], entry: string): Promise<void> {
    const script = document.createElement('script'); script.dataset['latticeEntry'] = entry;
    const bootstrap = document.querySelector<HTMLScriptElement>('script[src$="asset-bootstrap.js"]'); if (bootstrap?.nonce) script.nonce = bootstrap.nonce;
    const url = URL.createObjectURL(new Blob([...chunks], { type: 'text/javascript' })); script.src = url;
    let detach = (): void => {};
    try {
        await new Promise<void>((resolve, reject) => {
            let started = false;
            const ready = (): void => { started = true; resolve(); };
            const failed = (event: Event): void => {
                started = true;
                reject(event instanceof CustomEvent && event.detail instanceof Error ? event.detail : new Error('Viewer bundle execution failed'));
            };
            const error = (): void => reject(new Error('Viewer bundle script was blocked or failed to load'));
            const loaded = (): void => { if (!started) reject(new Error('Viewer bundle did not start')); };
            const listeners: readonly (readonly [string, EventListener])[] = [['lattice-assets-ready', ready], ['lattice-assets-error', failed], ['error', error], ['load', loaded]];
            for (const [name, callback] of listeners) script.addEventListener(name, callback, { once: true });
            detach = (): void => { for (const [name, callback] of listeners) script.removeEventListener(name, callback); };
            document.head.append(script);
        });
    } finally { detach(); script.remove(); URL.revokeObjectURL(url); }
}
async function boot(): Promise<void> {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser needs gzip decompression');
    const generation = document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content;
    const plan = manifest(JSON.parse(new TextDecoder().decode(await fetchAsset('manifest.json'))));
    if (plan.version === 2) {
        const chunks = await Promise.all(plan.packs.map(readPack));
        if (document.querySelector<HTMLMetaElement>('meta[name="lattice-generation"]')?.content !== generation) throw new Error('Viewer generation changed while loading');
        await publishBundle(chunks, plan.entry); return;
    }
    if (!HTMLScriptElement.supports?.('importmap')) throw new Error('This browser needs native import maps');
    const groups = await Promise.all(plan.packs.map(async pack => {
        const decoded = await readPack(pack);
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
        if (!Array.isArray(value) || value.length !== pack.modules.length) throw new Error('Invalid viewer module archive');
        return value.map((item: unknown, index): readonly [string, string] => {
            if (!Array.isArray(item) || item.length !== 2 || item[0] !== pack.modules[index] || typeof item[0] !== 'string' || typeof item[1] !== 'string') throw new Error('Viewer module manifest mismatch');
            return [item[0], item[1]];
        });
    }));
    const imports: Record<string, string> = {};
    for (const [name, source] of groups.flat()) imports[`lattice-viewer/${name}`] = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const map = document.createElement('script'); map.type = 'importmap';
    const bootstrap = document.querySelector<HTMLScriptElement>('script[src$="asset-bootstrap.js"]'); if (bootstrap?.nonce) map.nonce = bootstrap.nonce;
    map.textContent = JSON.stringify({ imports });
    document.head.append(map);
    await import(`lattice-viewer/${plan.entry}`);
}
void boot().catch((error: unknown) => {
    const main = document.getElementById('main') ?? document.body; const message = document.createElement('p'); message.setAttribute('role', 'alert');
    message.textContent = `지도를 불러오지 못했습니다. ${error instanceof Error ? error.message : 'Viewer loading failed'}. CSP 사용 시 blob: 스크립트를 허용해야 하며 기본 모듈 형식에는 nonce가 있는 import map도 필요합니다.`;
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 불러오기'; retry.addEventListener('click', () => location.reload()); main.replaceChildren(message, retry);
});
