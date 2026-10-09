import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyAggregation(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  writeFileSync(join(repository, '.gitignore'), '/.lattice/cache/\n/.lattice/site/\n');
  const save = (path, value) => writeFileSync(join(repository, path), JSON.stringify(value, null, 2));
  const get = (from, ...path) => ({ op: 'get', from, path });
  const value = field => get('vars', 'capacity', field);
  save('.lattice/lens.json', {
    schemaVersion: 1, name: 'Service capacity', kinds: [{ id: 'service', label: 'Service', files: ['services.json'] }],
    derived: [{ id: 'capacity', scope: 'graph', value: { op: 'aggregate', value: get('graph', 'nodes', '*', 'capacity') } }],
    findings: [
      { id: 'coverage', metrics: Object.fromEntries(['sum', 'count', 'total', 'missing', 'invalid', 'coverage'].map(field => [field, value(field)])), template: '{count}/{total} capacities: {sum}', gate: { metric: 'missing', comparator: 'eq', threshold: 0 } },
      { id: 'capacity', metrics: { sum: value('sum') }, template: 'Capacity {sum}', gate: { metric: 'sum', comparator: 'gt', threshold: 0 } },
    ],
  });
  const records = [{ id: 'api', capacity: 3 }, { id: 'worker' }];
  save('services.json', records);
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Record partial capacities']);
  const before = git(['rev-parse', 'HEAD']);
  const run = (command, args = [], status = 0) => {
    const result = spawnSync(process.execPath, [cli, command, ...args, '--root', repository, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr + result.stdout);
    return JSON.parse(result.stdout);
  };
  const graph = () => JSON.parse(readFileSync(join(repository, '.lattice/cache/graph.json'), 'utf8'));
  run('check', [], 1);
  const partial = graph().findings.find(finding => finding.id === 'coverage');
  assert.deepEqual(partial.metrics, { sum: 3, count: 1, total: 2, missing: 1, invalid: 0, coverage: 'partial' });
  assert.equal(partial.gate.status, 'fail');
  assert.ok(partial.sources.some(source => source.path === 'services.json' && source.pointer === '/0/capacity'));
  assert.equal(partial.sources.some(source => source.pointer === '/1/capacity'), false);
  records[1].capacity = 7;
  save('services.json', records);
  git(['add', 'services.json']); git(['commit', '--quiet', '-m', 'Supply missing capacity']);
  const complete = run('check');
  assert.deepEqual(graph().findings.find(finding => finding.id === 'coverage').metrics, { sum: 10, count: 2, total: 2, missing: 0, invalid: 0, coverage: 'complete' });
  const delta = run('diff', [before]);
  assert.equal(delta.findings.changed.length, 2);
  records[1].capacity = null;
  save('services.json', records);
  run('check', [], 1);
  assert.equal(graph().findings.find(finding => finding.id === 'capacity').gate.status, 'unknown');
  assert.deepEqual(graph().findings.find(finding => finding.id === 'coverage').metrics, { sum: null, count: 1, total: 2, missing: 0, invalid: 1, coverage: 'partial' });
  records[1].capacity = 7;
  save('services.json', records);
  assert.equal(run('check').result.graph.hash, complete.result.graph.hash);
  const exported = run('export', [join(repository, '.lattice/site')]);
  assert.equal(exported.result.hash, complete.result.graph.hash);
  assert.equal(git(['status', '--porcelain']), '');
  console.log('Installed aggregation: partial totals and coverage gate, exact evidence, completion, null-invalid unknown gate, history and export passed.');
}
