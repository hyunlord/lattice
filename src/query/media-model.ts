import type { Node } from '../core/model.js';

export type MediaFrame = { readonly x: number; readonly y: number; readonly width: number; readonly height: number; };
export type MediaReference = { readonly path: string; readonly frame?: MediaFrame; readonly alt?: string; };
export type MediaConfig = { readonly field?: string; readonly nodes?: Readonly<Record<string, MediaReference | string>>; };
export type MediaEntry =
    | { readonly status: 'available'; readonly url: string; readonly sourcePath: string; readonly sourceHash: string; readonly frame?: MediaFrame; readonly alt?: string; }
    | { readonly status: 'missing'; readonly sourcePath: string; readonly reason: string; };
export type MediaManifest = Readonly<Record<string, MediaEntry>>;

export function parseMediaReference(value: unknown): MediaReference | undefined {
    if (typeof value === 'string') return value ? { path: value } : undefined;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const path: unknown = Reflect.get(value, 'path'), frame: unknown = Reflect.get(value, 'frame'), alt: unknown = Reflect.get(value, 'alt');
    if (typeof path !== 'string' || !path || (alt !== undefined && typeof alt !== 'string')) return undefined;
    let rectangle: MediaFrame | undefined;
    if (frame !== undefined) {
        if (!frame || typeof frame !== 'object' || Array.isArray(frame)) return undefined;
        const x: unknown = Reflect.get(frame, 'x'), y: unknown = Reflect.get(frame, 'y'), width: unknown = Reflect.get(frame, 'width'), height: unknown = Reflect.get(frame, 'height');
        if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number' || ![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) return undefined;
        rectangle = { x, y, width, height };
    }
    return { path, ...(rectangle ? { frame: rectangle } : {}), ...(typeof alt === 'string' ? { alt } : {}) };
}

export function mediaReference(node: Pick<Node, 'id' | 'attributes'>, config: MediaConfig): MediaReference | undefined {
    return parseMediaReference(config.nodes?.[node.id] ?? config.nodes?.[String(node.attributes['originalId'] ?? '')] ?? (config.field ? node.attributes[config.field] : undefined));
}

export function parseMediaConfig(value: unknown): MediaConfig {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const field: unknown = Reflect.get(value, 'field'), entries: unknown = Reflect.get(value, 'nodes');
    const nodes: Record<string, MediaReference> = Object.create(null);
    if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
        for (const [id, input] of Object.entries(entries)) { const reference = parseMediaReference(input); if (reference) nodes[id] = reference; }
    }
    return { ...(typeof field === 'string' && field ? { field } : {}), ...(Object.keys(nodes).length ? { nodes } : {}) };
}

export function parseMediaManifest(value: unknown): MediaManifest {
    const manifest: Record<string, MediaEntry> = Object.create(null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return manifest;
    for (const [id, entry] of Object.entries(value)) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const status: unknown = Reflect.get(entry, 'status'), sourcePath: unknown = Reflect.get(entry, 'sourcePath');
        if (typeof sourcePath !== 'string') continue;
        if (status === 'missing') {
            const reason: unknown = Reflect.get(entry, 'reason');
            if (typeof reason === 'string') manifest[id] = { status, sourcePath, reason };
        } else if (status === 'available') {
            const url: unknown = Reflect.get(entry, 'url'), sourceHash: unknown = Reflect.get(entry, 'sourceHash');
            const reference = parseMediaReference({ path: sourcePath, frame: Reflect.get(entry, 'frame'), alt: Reflect.get(entry, 'alt') });
            if (!reference || typeof url !== 'string' || typeof sourceHash !== 'string' || !/^[a-f0-9]{64}$/u.test(sourceHash) || !new RegExp(`^media/${sourceHash}\\.(?:png|jpe?g|webp|gif|svg|avif)$`, 'u').test(url)) continue;
            manifest[id] = { status, sourcePath, sourceHash, url, ...(reference.frame ? { frame: reference.frame } : {}), ...(reference.alt ? { alt: reference.alt } : {}) };
        }
    }
    return manifest;
}
