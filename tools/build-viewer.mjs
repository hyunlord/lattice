import { chmodSync, copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
for (const file of readdirSync(join(root, 'build/viewer'))) {
  if (file.endsWith('.js')) copyFileSync(join(root, 'build/viewer', file), join(root, 'viewer', file));
}
for (const file of ['explore-model.js', 'views-model.js', 'history-model.js', 'picture-map-model.js', 'loop-map-model.js', 'structural-map-model.js', 'structural-frontier.js', 'structural-package-stages.js', 'loop-config.js', 'media-model.js']) {
  const destination = join(root, 'viewer', file);
  copyFileSync(join(root, 'dist/query', file), destination);
  if (file === 'loop-map-model.js') writeFileSync(destination, readFileSync(destination, 'utf8').replace('../adapters/markdown-inline.js', './markdown-inline.js'));
}
copyFileSync(join(root, 'dist/adapters/markdown-inline.js'), join(root, 'viewer/markdown-inline.js'));
chmodSync(join(root, 'bin/lattice.mjs'), 0o755);
