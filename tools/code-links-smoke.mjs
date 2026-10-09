import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyCodeLinks(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  git(['init', '--quiet']); git(['config', 'user.email', 'fixture@example.invalid']); git(['config', 'user.name', 'Lattice fixture']);
  git(['remote', 'add', 'origin', 'https://github.com/example/dispatch-fixture.git']);
  const save = (path, text) => writeFileSync(join(repository, path), text);
  const json = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const check = () => spawnSync(process.execPath, [cli, 'check', '--root', repository], { encoding: 'utf8' });
  const graph = () => json('.lattice/cache/graph.json');
  const support = value => value.facets.find(facet => facet.key === 'codeSupport:dispatch').value;
  const handler = label => `class Handler { public bool Dispatch(string operation) { switch (operation) { case "${label}": return true; default: return false; } } }\n`;
  save('.gitignore', '.lattice/cache/\n.lattice/site/\n');
  save('services.json', '[{"id":"service:api","operation":"send"}]\n');
  save('Handler.cs', handler('send'));
  save('.lattice/lens.json', JSON.stringify({
    schemaVersion: 1, name: 'Dispatch coverage', kinds: [{ id: 'service', label: 'Service', files: ['services.json'] }],
    derived: [{ id: 'implementation', scope: 'node', value: { op: 'codeSupport', rule: 'dispatch' } }],
    codeLinks: [{ id: 'dispatch', query: { kinds: ['service'] }, values: { op: 'get', from: 'node', path: ['operation'] }, language: 'csharp', files: ['Handler.cs'], selectors: [{ kind: 'switch-case', within: 'Dispatch', expression: 'operation' }] }],
    findings: [{ id: 'unresolved', query: { kinds: ['service'], where: { op: 'ne', left: { op: 'get', from: 'vars', path: ['implementation', 'status'] }, right: 'supported' } }, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } } }, template: '{count} unresolved services', basis: 'source-support', gate: { metric: 'count', comparator: 'eq', threshold: 0 } }],
  }));
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Record a dispatch implementation']);
  const baseline = git(['rev-parse', 'HEAD']);
  assert.equal(check().status, 0);
  const before = graph();
  assert.equal(support(before).status, 'supported');
  assert.ok(before.inputs.some(input => input.path === 'Handler.cs'));
  assert.equal(before.nodes.length, 1, 'Support-only code sources must not become data records');
  assert.ok(support(before).values[0].evidence.some(source => source.path === 'Handler.cs' && source.line === 1));
  assert.ok(support(before).values[0].evidence.some(source => source.url === `https://github.com/example/dispatch-fixture/blob/${baseline}/Handler.cs#L1`));
  run(['build']); assert.equal(graph().hash, before.hash);

  // Only code changes: the unchanged record must immediately lose support.
  save('Handler.cs', handler('sent'));
  git(['add', 'Handler.cs']); git(['commit', '--quiet', '-m', 'Rename the dispatch operation']);
  assert.equal(check().status, 1);
  const after = graph();
  assert.equal(support(after).status, 'unsupported');
  assert.notEqual(after.repository.sourceFingerprint, before.repository.sourceFingerprint);
  rmSync(join(repository, '.lattice/cache/extractions'), { recursive: true, force: true });
  run(['build']); assert.equal(graph().hash, after.hash, 'Cold and warm support projections agree');
  const difference = JSON.parse(run(['diff', baseline, '--json']));
  assert.equal(difference.nodes.changed.length, 0);
  assert.ok(difference.facets.changed.some(change => change.before.value.status === 'supported' && change.after.value.status === 'unsupported'));
  assert.equal(difference.findings.changed.find(change => change.id === 'unresolved').after.gate.status, 'fail');
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(support(json('.lattice/site/graph.json')).status, 'unsupported');

  rmSync(join(repository, 'Handler.cs'));
  assert.equal(check().status, 1, 'Missing required dispatch evidence cannot pass the configured gate');
  assert.equal(support(graph()).status, 'unknown');
  git(['add', 'Handler.cs']); git(['commit', '--quiet', '-m', 'Remove the dispatch implementation']);
  const externalLens = `${repository}-external-lens.json`;
  writeFileSync(externalLens, readFileSync(join(repository, '.lattice/lens.json')));
  try {
    run(['build', '--lens', externalLens]);
    const missing = support(graph());
    assert.equal(graph().repository.dirty, false);
    assert.equal(missing.status, 'unknown');
    assert.ok(missing.diagnostics.flatMap(diagnostic => diagnostic.sources).length > 0);
    assert.ok(missing.diagnostics.flatMap(diagnostic => diagnostic.sources).every(source => source.url === undefined && source.revision === undefined), 'An external lens must not acquire repository source provenance');
  } finally { rmSync(externalLens); }
  console.log('Installed code links: support-only inputs, code-only edits, warm/cold equality, historical diff, exported evidence, missing-source gate and exact repository provenance passed.');
}
