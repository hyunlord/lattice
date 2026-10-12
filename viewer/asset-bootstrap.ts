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
function manifest(value: unknown): { readonly entry: string; readonly packs: readonly AssetPack[]; } {
    if (!record(value) || value['version'] !== 1 || !moduleName(value['entry']) || !Array.isArray(value['packs']) || !value['packs'].length) throw new Error('Invalid viewer asset manifest');
    const names = new Set<string>(), paths = new Set<string>();
    const packs = value['packs'].map((pack: unknown): AssetPack => {
        if (!record(pack) || typeof pack['hash'] !== 'string' || !/^[a-f0-9]{64}$/u.test(pack['hash']) || pack['path'] !== `${pack['hash']}.gz` || !size(pack['encoded']) || !size(pack['decoded']) || !Array.isArray(pack['modules']) || !pack['modules'].length || !pack['modules'].every(moduleName)) throw new Error('Invalid viewer asset pack');
        const path = `${pack['hash']}.gz`; if (paths.has(path)) throw new Error('Duplicate viewer asset pack'); paths.add(path);
        for (const name of pack['modules']) { if (names.has(name)) throw new Error('Duplicate viewer module'); names.add(name); }
        return { path, hash: pack['hash'], encoded: pack['encoded'], decoded: pack['decoded'], modules: pack['modules'] };
    });
    if (!names.has(value['entry'])) throw new Error('Missing viewer entry module');
    return { entry: value['entry'], packs };
}
async function boot(): Promise<void> {
    if (!HTMLScriptElement.supports?.('importmap') || typeof DecompressionStream !== 'function') throw new Error('This browser needs native import maps and gzip decompression');
    const plan = manifest(JSON.parse(new TextDecoder().decode(await fetchAsset('manifest.json'))));
    const groups = await Promise.all(plan.packs.map(async pack => {
        const bytes = await fetchAsset(pack.path);
        if (bytes.length !== pack.encoded) throw new Error('Viewer asset integrity mismatch');
        const digest = globalThis.crypto?.subtle ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('') : packedHash(bytes);
        if (digest !== pack.hash) throw new Error('Viewer asset integrity mismatch');
        const decoded = await bounded(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')));
        if (decoded.length !== pack.decoded) throw new Error('Viewer asset decoded size mismatch');
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
    message.textContent = `지도를 불러오지 못했습니다. ${error instanceof Error ? error.message : 'Viewer loading failed'}. CSP 사용 시 nonce가 있는 import map과 blob: 모듈을 허용해야 합니다.`;
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 불러오기'; retry.addEventListener('click', () => location.reload()); main.replaceChildren(message, retry);
});
