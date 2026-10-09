import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyExternalCache(cli, repository) {
  mkdirSync(repository, { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const source = join(repository, 'records.json');
  writeFileSync(source, '[{"id":"a"}]'); git(['add', '.']); git(['commit', '--quiet', '-m', 'Record initial state']);
  const base = git(['rev-parse', 'HEAD']);
  writeFileSync(source, '[{"id":"a"},{"id":"b"}]'); git(['add', '.']); git(['commit', '--quiet', '-m', 'Add a record']);
  const status = git(['status', '--porcelain', '--untracked-files=all']);
  const cache = `${repository}-cache`;
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository, '--cache-dir', cache], { encoding: 'utf8' });
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  chmodSync(source, 0o444); chmodSync(repository, 0o555);
  let child;
  try {
    run(['build']); run(['check']);
    assert.equal(read(join(cache, 'build.json')).parsed, 0);
    assert.equal(read(join(cache, 'build.json')).reused, 1);
    const diff = JSON.parse(run(['diff', base, '--json']));
    assert.deepEqual(diff.nodes.added.map(node => node.id), ['b']);
    assert.equal(read(join(cache, 'snapshots.json')).length, 2);
    run(['export']);
    const graph = read(join(cache, 'graph.json'));
    assert.equal(read(join(`${cache}-site`, 'graph.json')).hash, graph.hash);
    assert.equal(read(join(`${cache}-site`, 'snapshots.json')).length, 2);
    child = spawn(process.execPath, [cli, 'serve', '--root', repository, '--cache-dir', cache, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const deadline = Date.now() + 15000;
    let address;
    while (!(address = /http:\/\/127\.0\.0\.1:[0-9]+\//u.exec(stdout)?.[0])) {
      assert.ok(Date.now() < deadline && child.exitCode === null, `External serve failed: ${stderr}`);
      await delay(50);
    }
    const response = await fetch(new URL('graph.json', address));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).hash, graph.hash);
    child.kill('SIGTERM');
    assert.deepEqual(await Promise.race([exited, delay(5000).then(() => { throw new Error('External serve shutdown timed out'); })]), { code: 0, signal: null });
    assert.equal(existsSync(join(repository, '.lattice')), false);
    assert.equal(git(['status', '--porcelain', '--untracked-files=all']), status);
    assert.equal(readFileSync(source, 'utf8'), '[{"id":"a"},{"id":"b"}]');
    assert.equal(existsSync(join(cache, 'writer.lock')), false);
    console.log('Installed external cache: read-only source build/check, warm extraction, historical diff/snapshots, default external export, live serve and unchanged source passed.');
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    chmodSync(repository, 0o755); chmodSync(source, 0o644);
  }
  const internal = join(repository, 'generated-cache');
  const runInternal = args => execFileSync(process.execPath, [cli, ...args, '--root', repository, '--cache-dir', internal], { encoding: 'utf8' });
  runInternal(['build']);
  const beforeExport = read(join(internal, 'graph.json'));
  runInternal(['export']); runInternal(['build']);
  const afterExport = read(join(internal, 'graph.json'));
  assert.equal(afterExport.hash, beforeExport.hash);
  assert.equal(afterExport.repository.dirty, false);
  assert.deepEqual(afterExport.nodes.map(node => node.id).sort(), ['a', 'b', 'file:records.json']);
  assert.equal(read(join(repository, '.lattice/site/graph.json')).hash, beforeExport.hash);
  console.log('Installed internal custom cache: default export is not re-ingested and graph identity remains stable.');
}
