import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { arch, cpus, platform, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const [sourceArgument, lensArgument] = process.argv.slice(2);
if (!sourceArgument || !lensArgument) throw new Error('Usage: node tools/measure-build.mjs <repository> <lens.json>');
const source = resolve(sourceArgument), lens = resolve(lensArgument);
const cli = fileURLToPath(new URL('../bin/lattice.mjs', import.meta.url));
const build = root => execFileSync(process.execPath, [cli, 'build', '--root', root, '--lens', lens], { stdio: 'pipe' });
build(source);
const graph = JSON.parse(readFileSync(join(source, '.lattice/cache/graph.json'), 'utf8'));
const root = mkdtempSync(join(tmpdir(), 'lattice-measure-build-'));
try {
  for (const input of graph.inputs) {
    const destination = join(root, input.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(source, input.path), destination);
  }
  execFileSync('git', ['init', '--quiet', root]);
  const samples = [];
  for (let iteration = 0; iteration < 4; iteration++) {
    const start = performance.now();
    build(root);
    const durationMs = Math.round((performance.now() - start) * 100) / 100;
    const stats = JSON.parse(readFileSync(join(root, '.lattice/cache/build.json'), 'utf8'));
    const built = JSON.parse(readFileSync(join(root, '.lattice/cache/graph.json'), 'utf8'));
    if (built.hash !== graph.hash) throw new Error('Copied input graph differs from source; discard this measurement');
    samples.push({ durationMs, parsed: stats.parsed, reused: stats.reused, bytes: stats.bytes });
  }
  console.log(JSON.stringify({ mode: 'copied-selected-inputs-full-cli', sourceCommit: graph.repository.commit ?? null, sourceDirty: graph.repository.dirty, graphHash: graph.hash, lensHash: graph.lensDigest, files: graph.inputs.length, node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, samples }, null, 2));
} finally { rmSync(root, { recursive: true, force: true }); }
