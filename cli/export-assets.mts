import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Copy the packaged compressed viewer; development retains the original ESM modules. */
export function writeViewerAssets(staging: string): void {
    const viewer = fileURLToPath(new URL('../viewer/', import.meta.url));
    for (const name of readdirSync(viewer).filter(name => name.endsWith('.css') || name === 'asset-bootstrap.js')) copyFileSync(join(viewer, name), join(staging, name));
    writeFileSync(join(staging, 'index.html'), readFileSync(join(viewer, 'index.html'), 'utf8').replace('type="module" src="./app.js"', 'defer src="./asset-bootstrap.js"'));
    const archives = join(staging, 'asset-archives'); mkdirSync(archives, { recursive: true });
    for (const name of readdirSync(join(viewer, 'asset-archives'))) copyFileSync(join(viewer, 'asset-archives', name), join(archives, name));
}
