import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyExport(cli, repository) {
  mkdirSync(repository, { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  writeFileSync(join(repository, 'records.json'), '[{"id":"service:a","name":"API"}]');
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const attempt = args => spawnSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const output = join(repository, '.lattice/site');
  const contents = () => Object.fromEntries(readdirSync(output).sort().map(file => [file, readFileSync(join(output, file), 'utf8')]));
  run(['build']);
  run(['export']);
  const first = contents();
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
