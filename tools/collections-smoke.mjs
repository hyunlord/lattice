import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyCollections(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const save = (path, value) => writeFileSync(join(repository, path), JSON.stringify(value));
  const get = (from, ...path) => ({ op: 'get', from, path });
  save('services.json', [{ id: 'a', owner: 'platform' }, { id: 'b', owner: 'app' }, { id: 'c', owner: 'platform' }]);
  save('.lattice/lens.json', {
    schemaVersion: 1, name: 'Service ownership', kinds: [{ id: 'service', label: 'Services', files: ['services.json'] }],
    derived: [{ id: 'owners', scope: 'graph', value: { op: 'groupBy', input: get('graph', 'nodes'), key: get('item', 'owner') } }],
    findings: [{ id: 'ownership', query: {}, metrics: {
      count: { op: 'count', value: get('vars', 'owners') },
      names: { op: 'join', input: { op: 'map', input: get('vars', 'owners'), value: get('item', 'key') }, separator: ', ' },
      members: { op: 'map', input: get('vars', 'owners'), value: { op: 'join', input: get('item', 'items', '*', 'id'), separator: '/' } },
    }, template: '{count} owners: {names}', gate: { metric: 'count', comparator: 'eq', threshold: 2 } }],
  });
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const read = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  run(['check']);
  const before = read('.lattice/cache/graph.json');
  assert.deepEqual(before.findings.find(item => item.ruleId === 'ownership').metrics, { count: 2, names: 'app, platform', members: ['b', 'a/c'] });
  assert.equal(before.findings.find(item => item.ruleId === 'ownership').message, '2 owners: app, platform');
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(read('.lattice/site/graph.json').hash, before.hash);
  save('services.json', [{ id: 'a', owner: 'platform' }, { id: 'b', owner: 'app' }, { id: 'c', owner: 'app' }]);
  run(['check']);
  assert.deepEqual(read('.lattice/cache/graph.json').findings.find(item => item.ruleId === 'ownership').metrics.members, ['b/c', 'a']);
  console.log('Installed collection expressions: grouped ownership, ordered joined members, finding text, gates, source edits and export passed.');
}
