import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyJson(cli, repository) {
  mkdirSync(repository, { recursive: true });
  repository = realpathSync(repository);
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  const source = join(repository, 'records.json');
  writeFileSync(source, '[{"id":"a","name":"First"}]');
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Initial record']);
  const run = (command, args = [], status = 0) => {
    const result = spawnSync(process.execPath, [cli, command, ...args, '--root', repository, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr + result.stdout);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    if (command !== 'diff') {
      assert.equal(output.command, command);
      if (output.result) assert.ok(output.result.durationMs >= 0);
    }
    return output;
  };
  const initialized = run('init', ['--no-global']);
  assert.equal(initialized.result.globalConfigurationChanged, false);
  assert.equal(initialized.result.lensPath, join(repository, '.lattice/lens.yaml'));
  const leadingJson = spawnSync(process.execPath, [cli, '--json', 'build', '--root', repository], { encoding: 'utf8' });
  assert.equal(leadingJson.status, 0, leadingJson.stderr);
  assert.equal(JSON.parse(leadingJson.stdout).command, 'build');
  const built = run('build');
  assert.ok(built.ok); assert.ok(built.result.graph.hash); assert.ok(built.result.extraction.files > 0);
  assert.ok(Array.isArray(built.result.diagnostics));
  const checked = run('check');
  assert.equal(checked.result.graph.hash, built.result.graph.hash); assert.deepEqual(checked.result.gates, []);
  const exported = run('export', [join(repository, '.lattice/site')]);
  assert.equal(JSON.parse(readFileSync(join(exported.result.outputPath, 'graph.json'), 'utf8')).hash, exported.result.hash);
  const difference = run('diff', ['HEAD']);
  assert.ok(difference.before); assert.ok(difference.after); assert.equal('result' in difference, false);
  const lensPath = join(repository, 'test-lens.json');
  const lens = { schemaVersion: 1, name: 'JSON checks', kinds: [{ id: 'record', label: 'Record', files: ['records.json'] }], findings: [{ id: 'count', query: { kinds: ['record'] }, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } } }, template: '{count}', gate: { metric: 'count', comparator: 'eq', threshold: 2 } }] };
  writeFileSync(lensPath, JSON.stringify(lens));
  const failed = run('check', ['--lens', lensPath], 1);
  assert.equal(failed.ok, false); assert.equal(failed.result.gates[0].status, 'fail');
  lens.findings[0].metrics.count = { op: 'get', from: 'vars', path: ['targets', 0, 'absent'] };
  writeFileSync(lensPath, JSON.stringify(lens));
  assert.equal(run('check', ['--lens', lensPath], 1).result.gates[0].status, 'unknown');
  assert.match(run('build', ['--invalid-option'], 2).error.message, /Unknown argument/u);
  assert.match(run('not-a-command', [], 2).error.message, /Unknown command/u);
  assert.match(run('serve', ['--port', 'invalid'], 2).error.message, /Port/u);
  writeFileSync(source, '{');
  assert.equal(run('serve', ['--port', '0'], 2).event, 'error');
  writeFileSync(source, '[{"id":"a","name":"First"}]');
  const child = spawn(process.execPath, [cli, 'serve', '--root', repository, '--port', '0', '--json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  const events = () => stdout.split('\n').slice(0, -1).map(line => JSON.parse(line));
  const until = async probe => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const value = await probe(); if (value) return value;
      assert.equal(child.exitCode, null, stderr + stdout);
      await delay(50);
    }
    throw new Error(`JSON serve timed out: ${stdout}\n${stderr}`);
  };
  try {
    const ready = await until(() => events().find(event => event.event === 'ready'));
    assert.equal(events()[0].event, 'ready');
    assert.equal((await (await fetch(new URL('graph.json', ready.url))).json()).hash, ready.hash);
    writeFileSync(source, '[{"id":"a","name":"Edited"}]');
    const rebuilt = await until(() => events().find(event => event.event === 'rebuilt'));
    assert.notEqual(rebuilt.hash, ready.hash); assert.ok(Array.isArray(rebuilt.diagnostics));
    writeFileSync(source, '{');
    await until(() => events().find(event => event.event === 'error'));
    assert.equal((await fetch(new URL('graph.json', ready.url))).status, 503);
    writeFileSync(source, '[{"id":"a","name":"Recovered"}]');
    const recovered = await until(() => events().find(event => event.event === 'recovered'));
    assert.notEqual(recovered.hash, rebuilt.hash);
    assert.equal((await (await fetch(new URL('graph.json', ready.url))).json()).hash, recovered.hash);
    child.kill('SIGTERM');
    assert.deepEqual(await Promise.race([exited, delay(5000).then(() => { throw new Error('JSON serve shutdown timed out'); })]), { code: 0, signal: null });
    assert.equal(events().at(-1).event, 'stopped'); assert.equal(stderr, '');
    for (const event of events()) { assert.equal(event.schemaVersion, 1); assert.equal(event.command, 'serve'); }
  } finally { if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } }
  console.log('Installed JSON CLI: six commands, gate fail/unknown, structured errors, live rebuild/error/recovery and shutdown passed.');
}
