import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyInputScope(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  const save = (path, text) => writeFileSync(join(repository, path), text);
  const run = () => execFileSync(process.execPath, [cli, 'build', '--root', repository], { encoding: 'utf8' });
  const graph = () => JSON.parse(readFileSync(join(repository, '.lattice/cache/graph.json'), 'utf8'));
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  save('.gitignore', '.lattice/cache/\n');
  save('included.json', '{"id":"included","operation":"send"}\n');
  save('other.json', '{"id":"other"}\n');
  save('private.json', '{ malformed JSON\n');
  save('Handler.cs', 'class Handler { bool Dispatch(string operation) { switch (operation) { case "send": return true; default: return false; } } }\n');
  save('.lattice/Hidden.cs', 'not selected support\n');
  const lens = {
    schemaVersion: 1, name: 'Input scope', include: ['included.json', 'private.json', '**/*.cs'], exclude: ['private.json', 'Handler.cs'],
    kinds: [{ id: 'record', label: 'Records', files: ['*.json'] }],
    codeLinks: [{ id: 'dispatch', query: { kinds: ['record'] }, values: { op: 'get', from: 'node', path: ['operation'] }, language: 'csharp', files: ['**/*.cs'], selectors: [{ kind: 'switch-case', within: 'Dispatch', expression: 'operation' }] }],
  };
  const saveLens = () => save('.lattice/lens.json', JSON.stringify(lens));
  saveLens();
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Scope the repository inputs']);
  save('private.json', '{ excluded edit one\n');
  run();
  const before = graph();
  assert.deepEqual(before.nodes.map(node => node.id), ['included']);
  assert.ok(!before.inputs.some(input => ['private.json', 'other.json', 'Handler.cs', '.lattice/Hidden.cs'].includes(input.path)));
  assert.equal(before.repository.dirty, true);
  save('private.json', '{ excluded edit two\n');
  save('Handler.cs', 'excluded code edit\n');
  run();
  assert.equal(graph().hash, before.hash, 'Excluded edits do not change the graph with dirty state fixed');
  lens.include.push('other.json'); saveLens(); run();
  assert.deepEqual(graph().nodes.map(node => node.id).sort(), ['included', 'other']);
  assert.notEqual(graph().hash, before.hash, 'Lens scope changes refresh cached inputs');
  lens.include = []; saveLens(); run();
  assert.equal(graph().nodes.length, 0);
  assert.ok(!graph().inputs.some(input => input.path.endsWith('.cs')));
  delete lens.include; saveLens(); run();
  assert.deepEqual(graph().nodes.map(node => node.id).sort(), ['included', 'other']);
  save('.lattice/lens.json', JSON.stringify({ ...lens, include: 'included.json' }, null, 2));
  const invalid = spawnSync(process.execPath, [cli, 'build', '--root', repository], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /\.lattice\/lens\.json:\d+: \/include: Expected an array of string patterns/u);
  save('.lattice/invalid.yaml', 'schemaVersion: 1\nname: Invalid scope\nkinds: []\nexclude:\n  - 42\n');
  const invalidEntry = spawnSync(process.execPath, [cli, 'build', '--root', repository, '--lens', '.lattice/invalid.yaml'], { encoding: 'utf8' });
  assert.equal(invalidEntry.status, 2);
  assert.match(invalidEntry.stderr, /\.lattice\/invalid\.yaml:5: \/exclude\/0: Expected an array of string patterns/u);
  console.log('Installed input scope: include/exclude, malformed excluded data, code support scope, built-in skips, unchanged excluded edits and lens refresh passed.');
}
