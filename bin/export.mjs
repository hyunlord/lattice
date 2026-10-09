import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheDirectory, readGraph, readSnapshots } from './storage.mjs';

const packageRoot = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const marker = '.lattice-export.json';
const within = (parent, child) => child === parent || child.startsWith(`${parent}${sep}`);
function physicalPath(path) {
  let ancestor = path;
  while (!existsSync(ancestor)) {
    if (lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Export path contains a broken symbolic link');
    ancestor = dirname(ancestor);
  }
  return resolve(realpathSync(ancestor), relative(ancestor, path));
}
function destination(options) {
  const cache = physicalPath(cacheDirectory(options.root, options.cacheDir));
  const root = realpathSync(options.root);
  const requested = resolve(options.output ?? (within(root, cache) ? join(root, '.lattice/site') : `${cache}-site`));
  if (lstatSync(requested, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Export directory must not be a symbolic link');
  const output = physicalPath(requested);
  const protectedPaths = [cache, physicalPath(join(root, '.lattice/cache')), join(root, '.git'), ...['bin', 'dist', 'src', 'viewer', 'node_modules'].map(path => join(packageRoot, path))];
  if (within(output, root) || within(output, packageRoot) || protectedPaths.some(path => within(output, path) || within(path, output))) throw new Error('Choose a dedicated export directory outside source, package and cache directories');
  const status = lstatSync(output, { throwIfNoEntry: false });
  if (status && !status.isDirectory()) throw new Error('Export destination must be a directory');
  if (status && readdirSync(output).length && !options.force) {
    const ownership = join(output, marker);
    let owned = false;
    if (lstatSync(ownership, { throwIfNoEntry: false })?.isFile()) {
      try { const value = JSON.parse(readFileSync(ownership, 'utf8')); owned = value?.schemaVersion === 1 && value?.generator === 'lattice'; }
      catch (error) { if (!(error instanceof SyntaxError)) throw error; }
    }
    if (!owned) throw new Error('Export destination is nonempty and not owned by Lattice; choose another directory or explicitly use --force');
  }
  return output;
}

export function exportSite(options) {
  if (options.json) throw new Error('--json is supported by diff');
  const cache = cacheDirectory(options.root, options.cacheDir);
  const graphPath = join(cache, 'graph.json');
  if (!existsSync(graphPath)) throw new Error('Run lattice build before export');
  readGraph(graphPath);
  const snapshots = readSnapshots(cache);
  const output = destination(options);
  mkdirSync(dirname(output), { recursive: true });
  const staging = mkdtempSync(join(dirname(output), `.${basename(output)}-lattice-`));
  const backup = `${staging}.previous`;
  let backedUp = false;
  try {
    for (const file of ['index.html', 'app.js', 'styles.css']) copyFileSync(join(packageRoot, 'viewer', file), join(staging, file));
    for (const file of ['graph.json', 'presentation.json']) copyFileSync(join(cache, file), join(staging, file));
    writeFileSync(join(staging, 'snapshots.json'), JSON.stringify(snapshots, null, 2) + '\n');
    for (const snapshot of snapshots) {
      mkdirSync(join(staging, 'snapshots'), { recursive: true });
      copyFileSync(join(cache, snapshot.artifactPath), join(staging, snapshot.artifactPath));
    }
    writeFileSync(join(staging, '.nojekyll'), '');
    writeFileSync(join(staging, marker), JSON.stringify({ schemaVersion: 1, generator: 'lattice' }, null, 2) + '\n');
    if (existsSync(output)) { renameSync(output, backup); backedUp = true; }
    try { renameSync(staging, output); }
    catch (error) { if (backedUp) { renameSync(backup, output); backedUp = false; } throw error; }
    if (backedUp) rmSync(backup, { recursive: true });
  } finally { rmSync(staging, { recursive: true, force: true }); }
  console.log(`Exported static map to ${output}`);
  return output;
}
