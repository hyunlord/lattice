import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyFindingDescriptions(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const save = (path, value) => writeFileSync(join(repository, path), JSON.stringify(value, null, 2));
  const get = (from, ...path) => ({ op: 'get', from, path });
  const description = field => ({ op: 'join', separator: '; ', input: { op: 'map', input: get('vars', 'targetValues'), value: get('item', 'derived', field) } });
  const data = [{ id: 'api', intent: 'Serve requests', implementation: 'Queued handler' }];
  save('services.json', data);
  save('.lattice/lens.json', {
    schemaVersion: 1, name: 'Service descriptions', kinds: [{ id: 'service', label: 'Services', files: ['services.json'] }],
    derived: ['intent', 'implementation'].map(id => ({ id, scope: 'node', kinds: ['service'], value: get('node', id) })),
    findings: [{ id: 'comparison', query: { kinds: ['service'] }, metrics: { count: { op: 'count', value: get('vars', 'targets') } }, template: '{count} services', intent: description('intent'), implementation: description('implementation') }],
  });
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const graph = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  run(['check']);
  const before = graph('.lattice/cache/graph.json');
  const finding = before.findings.find(item => item.ruleId === 'comparison');
  assert.equal(finding.intent, 'Serve requests');
  assert.equal(finding.implementation, 'Queued handler');
  for (const pointer of ['/0/intent', '/0/implementation']) assert.ok(finding.sources.some(source => source.path === 'services.json' && source.pointer === pointer));
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(graph('.lattice/site/graph.json').hash, before.hash);
  data[0].implementation = 'Direct handler';
  save('services.json', data);
  run(['check']);
  const after = graph('.lattice/cache/graph.json');
  assert.equal(after.findings.find(item => item.ruleId === 'comparison').implementation, 'Direct handler');
  assert.notEqual(after.hash, before.hash);
  console.log('Installed finding descriptions: derived intent/implementation, retained input evidence, source refresh and export passed.');
}
