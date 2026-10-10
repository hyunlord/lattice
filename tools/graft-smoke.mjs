import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyGraft(cli, repository) {
  mkdirSync(repository, { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  const save = (path, text) => writeFileSync(join(repository, path), text);
  const read = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const graph = () => read('.lattice/cache/graph.json');
  const hash = text => createHash('sha256').update(text).digest('hex');
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  git(['remote', 'add', 'origin', 'https://github.com/example/graft-fixture.git']);
  save('.gitignore', 'graft/\n.lattice/cache/\n.lattice/site/\n');
  const files = { 'main.ts': 'import { work } from "./worker.js";\nexport function run() { return work(); }\n', 'worker.ts': 'export function work() { return 1; }\n' };
  for (const [path, text] of Object.entries(files)) save(path, text);
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Record module sources']);
  const baseline = git(['rev-parse', 'HEAD']);
  run(['build']);
  assert.equal(graph().nodes.length, 4);
  assert.equal(graph().nodes.filter(node => node.kind === 'function').length, 2);
  assert.equal(graph().edges.length, 3);
  assert.equal(graph().edges.filter(edge => edge.kind === 'contains').length, 2);
  mkdirSync(join(repository, 'graft/.graph'), { recursive: true });
  const node = (id, path, name, kind, span) => ({ id, path, name, kind, span, signature: null, exported: true, origin: 'ast', body_hash: hash(files[path]), summary_state: 'pending', summary: null, crux: null });
  const wiring = {
    meta: { version: 1, nodeCount: 4, edgeCount: 4, languages: ['typescript'] },
    nodes: [node('main.ts', 'main.ts', 'main.ts', 'file', 'L1-L3'), node('main.ts#run', 'main.ts', 'run', 'function', 'L2-L2'), node('worker.ts', 'worker.ts', 'worker.ts', 'file', 'L1-L2'), node('worker.ts#work', 'worker.ts', 'work', 'function', 'L1-L1')],
    edges: [
      { source: 'main.ts', target: 'main.ts#run', relation: 'contains', confidence: 'extracted' },
      { source: 'worker.ts', target: 'worker.ts#work', relation: 'contains', confidence: 'extracted' },
      { source: 'main.ts#run', target: 'worker.ts#work', relation: 'calls', confidence: 'extracted' },
      { source: 'main.ts', target: 'worker.ts', relation: 'imports', confidence: 'extracted' },
    ],
  };
  const saveGraph = () => save('graft/.graph/wiring.json', JSON.stringify(wiring, null, 2));
  saveGraph(); run(['build']);
  const imported = graph();
  assert.equal(imported.repository.dirty, false);
  assert.equal(imported.nodes.length, 4);
  assert.equal(imported.edges.length, 4, 'Resolved imported and own module imports must not duplicate');
  const symbol = imported.nodes.find(value => value.id === 'graft:main.ts#run');
  assert.ok(symbol.sources.some(source => source.path === 'main.ts' && source.line === 2 && source.url?.includes(`/blob/${baseline}/main.ts#L2`)));
  assert.ok(symbol.sources.some(source => source.path === 'graft/.graph/wiring.json' && source.url === undefined));
  run(['build']); assert.equal(graph().hash, imported.hash);
  const change = JSON.parse(run(['diff', baseline, '--json']));
  assert.equal(change.nodes.added.filter(value => value.id.startsWith('graft:')).length, 2, 'Historical builds cannot borrow an ignored current graph');
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(read('.lattice/site/graph.json').hash, imported.hash);

  files['main.ts'] += '// changed source\n'; save('main.ts', files['main.ts']); run(['build']);
  assert.ok(!graph().nodes.some(value => value.id === 'graft:main.ts#run'));
  assert.ok(graph().nodes.some(value => value.id === 'graft:worker.ts#work'));
  assert.ok(graph().edges.some(value => value.kind === 'imports'), 'Stale imported file retains own module fallback');
  assert.ok(read('.lattice/cache/diagnostics.json').some(value => value.code.startsWith('graft-')));
  wiring.nodes[0].body_hash = hash(files['main.ts']); saveGraph(); run(['build']);
  assert.ok(graph().nodes.some(value => value.id === 'graft:main.ts#run'));
  const refreshed = graph().hash;
  wiring.nodes[1].signature = 'function run(): number'; saveGraph(); run(['build']);
  assert.notEqual(graph().hash, refreshed, 'An ignored graph-only edit is observed');
  for (const invalid of ['{', JSON.stringify({ ...wiring, meta: { ...wiring.meta, version: 2 } })]) {
    save('graft/.graph/wiring.json', invalid); run(['build']);
    assert.equal(graph().nodes.length, 4);
  assert.equal(graph().nodes.filter(node => node.kind === 'function').length, 2);
    assert.equal(graph().edges.length, 3);
  assert.equal(graph().edges.filter(edge => edge.kind === 'contains').length, 2);
    assert.ok(read('.lattice/cache/diagnostics.json').some(value => value.code === 'graft-invalid'));
  }
  rmSync(join(repository, 'graft'), { recursive: true }); run(['build']);
  assert.equal(graph().adapterVersions.graft, undefined);
  console.log('Installed Graft import: ignored graph, current source provenance, module deduplication, stale/malformed fallback, graph-only refresh, historical isolation and export passed.');
}
