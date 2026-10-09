import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyLensSchema(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const lensPath = join(repository, '.lattice/lens.yaml');
  const dataPath = join(repository, 'services.json');
  const data = '[{"id":"service:api","kind":"service","peerId":"service:queue"},{"id":"service:queue","kind":"queue"}]';
  const lens = `schemaVersion: 1
name: Dynamic service catalog
kinds:
  - id: catalog
    label: Catalog
    files: [services.json]
    kindField: kind
    columns: [id, peerId]
facets:
  - id: future
    key: future
    kinds: [not-yet-present]
    value:
      op: count
      value: {op: get, from: node, path: [members]}
findings:
  - id: services
    query: {kinds: [service]}
    metrics:
      count: {op: count, value: {op: get, from: vars, path: [targets]}}
    template: '{count} service'
    gate: {metric: count, comparator: eq, threshold: 1}
views:
  - id: inventory
    type: table
    label: Inventory
    columns:
      - id: name
        label: Name
        value: {op: get, from: node, path: [name]}
`;
  const run = (command, args = [], status = 0) => {
    const result = spawnSync(process.execPath, [cli, command, ...args, '--root', repository, '--json'], { encoding: 'utf8' });
    assert.equal(result.status, status, result.stderr + result.stdout);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  writeFileSync(dataPath, data);
  writeFileSync(lensPath, lens);
  const valid = run('check');
  assert.equal(valid.result.gates[0].status, 'pass');
  const graphPath = join(repository, '.lattice/cache/graph.json');
  const graph = JSON.parse(readFileSync(graphPath, 'utf8'));
  assert.deepEqual(graph.nodes.map(node => node.kind).sort(), ['queue', 'service']);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.views[0].query.rows.length, 2);
  assert.equal(run('export', [join(repository, '.lattice/site')]).result.hash, graph.hash);
  const invalid = lens.replace('      value: {op: get', '      vaule: {op: get');
  writeFileSync(lensPath, invalid);
  writeFileSync(dataPath, '{');
  const error = run('build', [], 2);
  assert.equal(error.ok, false);
  assert.ok(error.error.message.includes('/facets/0/value/vaule'), error.error.message);
  const line = invalid.split('\n').findIndex(text => text.includes('vaule:')) + 1;
  assert.ok(error.error.message.includes(`.lattice/lens.yaml:${line}:`), error.error.message);
  assert.equal(JSON.parse(readFileSync(graphPath, 'utf8')).hash, graph.hash);
  writeFileSync(dataPath, data);
  writeFileSync(lensPath, lens);
  assert.equal(run('check').result.graph.hash, graph.hash);
  console.log('Installed lens schema: YAML locations, unused-rule rejection before data parsing, dynamic kinds, valid check/export and recovery passed.');
}
