import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyServe(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const source = join(repository, 'records.json');
  writeFileSync(source, '[{"id":"service:a","name":"API"}]');
  writeFileSync(join(repository, '.lattice/lens.json'), JSON.stringify({ schemaVersion: 1, name: 'Live map', kinds: [{ id: 'service', label: 'Services', files: ['records.json'] }] }));
  const child = spawn(process.execPath, [cli, 'serve', '--root', repository, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  const until = async probe => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const value = await probe();
      if (value) return value;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited: ${stderr}`);
      await delay(50);
    }
    throw new Error(`Serve scenario timed out: ${stdout}\n${stderr}`);
  };
  const abort = new AbortController();
  try {
    const base = await until(() => /http:\/\/127\.0\.0\.1:[0-9]+\//u.exec(stdout)?.[0]);
    const json = async path => { const response = await fetch(new URL(path, base)); assert.equal(response.status, 200); return response.json(); };
    const first = await json('__lattice/status');
    assert.equal(first.builds, 1);
    const html = await (await fetch(base)).text();
    assert.match(html, /lattice-generation/u);
    const stable = await until(async () => { const state = await json('__lattice/status'); return state.checks >= first.checks + 2 && state; });
    assert.equal(stable.builds, first.builds);
    const graph = await json(`graph.json?generation=${first.generation}`);
    const stream = await fetch(new URL('__lattice/events', base), { signal: abort.signal });
    assert.match(stream.headers.get('content-type'), /text\/event-stream/u);
    const reader = stream.body.getReader();
    let events = '';
    const consume = (async () => {
      try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; events += new TextDecoder().decode(chunk.value); } }
      catch (error) { if (!abort.signal.aborted) throw error; }
    })();
    await until(() => events.includes('event: status'));
    writeFileSync(source, '[{"id":"service:a","name":"Changed API"}]');
    const edited = await until(async () => { const state = await json('__lattice/status'); return state.builds > first.builds && state; });
    assert.equal((await json(`graph.json?generation=${edited.generation}`)).nodes[0].name, 'Changed API');
    assert.equal((await json(`graph.json?generation=${first.generation}`)).hash, graph.hash);
    await until(() => events.includes(`"generation":"${edited.generation}"`));
    writeFileSync(source, '{');
    const failed = await until(async () => { const state = await json('__lattice/status'); return state.error && state; });
    assert.equal(failed.generation, edited.generation);
    assert.equal((await fetch(new URL('graph.json', base))).status, 503);
    assert.equal((await json(`graph.json?generation=${edited.generation}`)).nodes[0].name, 'Changed API');
    await until(() => events.includes('"error":"'));
    writeFileSync(source, '[{"id":"service:a","name":"Recovered API"}]');
    const recovered = await until(async () => { const state = await json('__lattice/status'); return !state.error && state.builds > edited.builds && state; });
    assert.equal((await json(`graph.json?generation=${recovered.generation}`)).nodes[0].name, 'Recovered API');
    abort.abort(); await consume;
    child.kill('SIGTERM');
    const result = await Promise.race([exited, delay(5000).then(() => { throw new Error('Serve shutdown timed out'); })]);
    assert.deepEqual(result, { code: 0, signal: null });
    const restart = spawn(process.execPath, [cli, 'serve', '--root', repository, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const interrupted = new Promise(resolve => restart.once('exit', (code, signal) => resolve({ code, signal })));
    try {
      await Promise.race([new Promise(resolve => restart.stdout.on('data', chunk => { if (String(chunk).includes('Lattice serving')) resolve(); })), delay(5000).then(() => { throw new Error('Serve restart timed out'); })]);
      restart.kill('SIGINT');
      assert.deepEqual(await Promise.race([interrupted, delay(5000).then(() => { throw new Error('SIGINT shutdown timed out'); })]), { code: 0, signal: null });
    } finally { if (restart.exitCode === null && restart.signalCode === null) { restart.kill('SIGKILL'); await interrupted; } }
    console.log('Installed serve: loopback ephemeral port, unchanged polling, coherent generations, SSE update, visible error status/recovery and clean shutdown passed.');
  } finally {
    abort.abort();
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
  }
}
