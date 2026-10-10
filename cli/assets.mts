import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { Node } from '../dist/core/model.js';
import { mediaReference } from '../dist/query/media-model.js';
import type { MediaConfig, MediaEntry, MediaManifest } from '../dist/query/media-model.js';

export type MediaFile = { readonly path: string; readonly bytes: Buffer; readonly mimeType: string; };
export type MediaAssets = { readonly manifest: MediaManifest; readonly files: readonly MediaFile[]; };
const formats: Readonly<Record<string, string>> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif' };
const contained = (root: string, path: string): boolean => { const local = relative(root, path); return local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local); };

export function resolveMediaAssets(root: string, nodes: readonly Pick<Node, 'id' | 'attributes'>[], config: MediaConfig = {}): MediaAssets {
    const repository = realpathSync(root);
    const manifest: Record<string, MediaEntry> = Object.create(null);
    const files = new Map<string, MediaFile>();
    for (const node of nodes) {
        const reference = mediaReference(node, config);
        if (!reference) continue;
        const missing = (reason: string): void => { manifest[node.id] = { status: 'missing', sourcePath: reference.path, reason }; };
        if (isAbsolute(reference.path) || /^[a-z][a-z0-9+.-]*:/iu.test(reference.path) || reference.path.includes('\\')) { missing('Image must be a repository-relative path'); continue; }
        const requested = resolve(repository, reference.path);
        if (!contained(repository, requested)) { missing('Image path is outside the repository'); continue; }
        const extension = extname(requested).toLowerCase(), mimeType = formats[extension];
        if (!mimeType) { missing('Unsupported image format'); continue; }
        try {
            const physical = realpathSync(requested);
            if (!contained(repository, physical)) { missing('Image symlink points outside the repository'); continue; }
            if (!statSync(physical).isFile()) { missing('Image path is not a file'); continue; }
            const bytes = readFileSync(physical), sourceHash = createHash('sha256').update(bytes).digest('hex');
            const path = `media/${sourceHash}${extension}`;
            files.set(path, { path, bytes, mimeType });
            manifest[node.id] = { status: 'available', url: path, sourcePath: reference.path, sourceHash, ...(reference.frame ? { frame: reference.frame } : {}), ...(reference.alt ? { alt: reference.alt } : {}) };
        } catch (error) {
            if (!(error instanceof Error)) throw error;
            const code: unknown = Reflect.get(error, 'code');
            if (code === 'ENOENT' || code === 'ENOTDIR') missing('Image file not found');
            else if (code === 'EACCES' || code === 'EPERM') missing('Image file is not readable');
            else throw error;
        }
    }
    return { manifest, files: [...files.values()] };
}

export function mediaFingerprint(root: string, config: MediaConfig = {}, nodes: readonly Pick<Node, 'id' | 'attributes'>[] = []): string {
    const byId = new Map(nodes.map(node => [node.id, node]));
    for (const id of Object.keys(config.nodes ?? {})) if (!byId.has(id)) byId.set(id, { id, attributes: {} });
    const resolved = resolveMediaAssets(root, [...byId.values()].sort((left, right) => left.id.localeCompare(right.id)), config);
    return createHash('sha256').update(JSON.stringify(resolved.manifest)).digest('hex');
}
