import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyExpressionMissing(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const save = (path, value) => writeFileSync(join(repository, path), JSON.stringify(value));
  const get = (from, ...path) => ({ op: 'get', from, path });
  save('records.json', [
    { id: 'empty', effects: [] },
    { id: 'incomplete', effects: [{}] },
    { id: 'explicit-null', effects: [{ operation: null }] },
    { id: 'implemented', effects: [{ operation: 'stat-add' }] },
  ]);
  const first = get('vars', 'operations', 0);
  save('.lattice/lens.json', {
    schemaVersion: 1, name: 'Implementation evidence',
    kinds: [{ id: 'record', label: 'Records', files: ['records.json'] }],
    derived: [
      { id: 'operations', scope: 'node', value: { op: 'map', input: get('node', 'effects'), value: get('item', 'operation') } },
      { id: 'first', scope: 'node', value: { op: 'let', bindings: { first }, value: get('vars', 'first') } },
      { id: 'complete', scope: 'node', value: { op: 'all', input: get('vars', 'operations'), where: { op: 'eq', left: get('item'), right: 'stat-add' } } },
      { id: 'custom', scope: 'node', value: { op: 'any', input: get('vars', 'operations'), where: { op: 'ne', left: get('item'), right: 'stat-add' } } },
    ],
    facets: [{ id: 'complete', key: 'complete', value: get('vars', 'complete') }],
    findings: [
      { id: 'complete', query: { where: get('vars', 'complete') }, metrics: { count: { op: 'count', value: get('vars', 'targets') } }, template: '{count} complete', gate: { metric: 'count', comparator: 'eq', threshold: 1 } },
      { id: 'custom', query: { where: get('vars', 'custom') }, metrics: { count: { op: 'count', value: get('vars', 'targets') } }, template: '{count} custom' },
      { id: 'nulls', query: {}, metrics: { count: { op: 'count', value: { op: 'filter', input: get('vars', 'targetValues'), where: { op: 'eq', left: get('item', 'derived', 'first'), right: null } } } }, template: '{count} explicit nulls', gate: { metric: 'count', comparator: 'eq', threshold: 1 } },
    ],
  });
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const read = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  run(['check']);
  const graph = read('.lattice/cache/graph.json');
  assert.deepEqual(graph.findings.find(finding => finding.id === 'complete').targetIds, ['implemented']);
  assert.deepEqual(graph.findings.find(finding => finding.id === 'custom').targetIds, ['explicit-null']);
  assert.equal(graph.findings.find(finding => finding.id === 'nulls').metrics.count, 1);
  assert.equal(graph.facets.find(facet => facet.nodeId === 'empty').value, false);
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(read('.lattice/site/graph.json').hash, graph.hash);
  console.log('Installed expressions: missing operations never imply implementation, empty effects are incomplete, explicit null survives derived target values, gate and export agree.');
}
