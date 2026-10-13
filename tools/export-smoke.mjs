import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPackedArtifact } from '../bin/packed-reader.mjs';

export function verifyExport(cli, repository) {
  mkdirSync(repository, { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  writeFileSync(join(repository, 'records.json'), '[{"id":"service:a","name":"API"}]');
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const attempt = args => spawnSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const output = join(repository, '.lattice/site');
  const contents = () => Object.fromEntries(readdirSync(output, { recursive: true }).filter(file => lstatSync(join(output, file)).isFile()).sort().map(file => [file, readFileSync(join(output, file), 'utf8')]));
  run(['build']);
  run(['export']);
  const first = contents();
  const manifest = JSON.parse(first['asset-archives/manifest.json']);
  const decodedPacks = manifest.packs.map(pack => {
    const bytes = readFileSync(join(output, 'asset-archives', pack.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), pack.hash);
    assert.equal(bytes.length, pack.encoded); assert.ok(bytes.length <= 262144);
    const decoded = gunzipSync(bytes); assert.equal(decoded.length, pack.decoded); assert.ok(decoded.length <= 262144);
    return decoded;
  });
  assert.ok(manifest.version === 1 || manifest.version === 2);
  if (manifest.version === 1) {
    const modules = Object.fromEntries(decodedPacks.flatMap(decoded => JSON.parse(decoded)));
    for (const name of ['structural-dependency-groups.js', 'evidence.js', 'source-groups.js']) assert.ok(modules[name]);
    assert.doesNotMatch(modules['source-groups.js'], /\.\.\/dist\//u);
    assert.match(modules['loop-map-model.js'], /lattice-viewer\/structural-dependency-groups\.js/u);
  } else {
    const bundle = Buffer.concat(decodedPacks).toString('utf8');
    for (const name of ['structural-dependency-groups', 'evidence', 'source-groups', 'loop-map-model']) assert.ok(bundle.includes(`define("${name}",`), `Missing compiled module ${name}`);
    assert.doesNotMatch(bundle, /\.\.\/dist\//u);
    assert.match(bundle, /\.\/structural-dependency-groups\.js/u);
    assert.match(bundle, /lattice-assets-ready/u);
  }
  assert.match(first['index.html'], /asset-bootstrap\.js/u);
  assert.equal(first['app.js'], undefined);
  const thin = readPackedArtifact(output, 'graph.json');
  const full = JSON.parse(readFileSync(join(repository, '.lattice/cache/graph.json'), 'utf8'));
  for (const kind of thin.evidence ? ['edges', 'facets', 'findings', 'views'] : []) for (const record of thin[kind]) {
    const id = thin.evidence.records[kind]?.[record.id];
    if (id) record.sources = thin.evidence.groups[id].pages.flatMap(path => readPackedArtifact(output, path));
  }
  delete thin.evidence;
  assert.deepEqual(thin, full);
  assert.equal(JSON.parse(first['.lattice-export.json']).generator, 'lattice');
  run(['export']);
  assert.deepEqual(contents(), first);
  writeFileSync(join(output, 'stale.txt'), 'Old generated asset');
  run(['export']);
  assert.deepEqual(contents(), first);

  const presentation = join(repository, '.lattice/cache/presentation.json');
  renameSync(presentation, `${presentation}.held`);
  try {
    assert.equal(attempt(['export']).status, 2);
    assert.deepEqual(contents(), first);
    assert.ok(readdirSync(join(repository, '.lattice')).every(file => !file.startsWith('.site-lattice-')));
  } finally { renameSync(`${presentation}.held`, presentation); }

  const foreign = join(repository, 'foreign-site');
  mkdirSync(foreign);
  writeFileSync(join(foreign, 'keep.txt'), 'User content');
  const refused = attempt(['export', foreign]);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /--force/u);
  assert.equal(readFileSync(join(foreign, 'keep.txt'), 'utf8'), 'User content');
  run(['export', foreign, '--force']);
  assert.equal(existsSync(join(foreign, 'keep.txt')), false);
  assert.equal(readFileSync(join(foreign, 'graph.json'), 'utf8'), first['graph.json']);
  console.log('Installed export: stable owned replacement, stale file pruning, generation failure preserves prior site, nonowned refusal and explicit force passed.');
}
