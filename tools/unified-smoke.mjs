import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyUnifiedGraph(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  const git = args => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  const save = (path, text) => writeFileSync(join(repository, path), text);
  const read = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const graph = () => read('.lattice/cache/graph.json');
  git(['init', '--quiet']); git(['config', 'user.name', 'Lattice fixture']); git(['config', 'user.email', 'fixture@example.invalid']);
  save('.gitignore', '.lattice/cache/\n.lattice/site/\n');
  save('service.json', JSON.stringify({ id: 'service:api', docId: 'document:README.md', moduleId: 'module:main.ts' }));
  save('README.md', '# Service\n[Entry](main.ts)\n');
  save('main.ts', 'export const service = "api";\n');
  run(['build']);
  assert.equal(graph().nodes.length, 4);
  assert.ok(graph().edges.some(edge => edge.source === 'service:api' && edge.target === 'document:README.md'));
  assert.ok(graph().edges.some(edge => edge.source === 'service:api' && edge.target === 'module:main.ts'));
  const count = path => ({ op: 'count', value: { op: 'get', from: 'graph', path: [path] } });
  save('.lattice/lens.json', JSON.stringify({
    schemaVersion: 1, name: 'Repository knowledge',
    kinds: [{ id: 'service', label: 'Services', files: ['*.json'] }, { id: 'document', label: 'Documentation', files: ['*.md'] }, { id: 'module', label: 'Modules', files: ['*.ts'] }],
    derived: [{ id: 'connections', scope: 'graph', value: count('edges') }],
    facets: [{ id: 'family', key: 'family', value: { op: 'get', from: 'node', path: ['kind'] } }],
    findings: [{ id: 'coverage', query: {}, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } }, connections: { op: 'get', from: 'vars', path: ['connections'] } }, template: '{count} nodes and {connections} connections', gate: { metric: 'count', comparator: 'eq', threshold: 4 } }],
    views: [{ id: 'connections', type: 'cycle', label: 'Connections', query: {} }],
  }));
  git(['add', '.']); git(['commit', '--quiet', '-m', 'Describe one system across data, documents and code']);
  const baseline = git(['rev-parse', 'HEAD']);
  run(['check']);
  const before = graph();
  assert.equal(before.findings.find(item => item.ruleId === 'coverage').gate.status, 'pass');
  assert.deepEqual(before.findings.find(item => item.ruleId === 'coverage').metrics, { count: 4, connections: 4 });
  assert.equal(before.facets.length, 4);
  assert.equal(before.views[0].query.nodeIds.length, 4);
  assert.equal(before.views[0].query.edgeIds.length, 4);
  assert.ok(before.findings.find(item => item.ruleId === 'coverage').targetIds.includes('module:main.ts'));
  assert.ok(before.findings.find(item => item.ruleId === 'coverage').targetIds.includes('document:README.md'));
  assert.ok(!read('.lattice/cache/diagnostics.json').some(value => value.code === 'unresolved-reference'));
  run(['build']); assert.equal(graph().hash, before.hash);
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(read('.lattice/site/graph.json').hash, before.hash);
  save('README.md', '# Service\n[Entry](missing.ts)\n');
  git(['add', 'README.md']); git(['commit', '--quiet', '-m', 'Move the documented entry path']);
  const difference = JSON.parse(run(['diff', baseline, '--json']));
  const changed = difference.findings.changed.find(value => value.id === 'coverage');
  assert.equal(changed.before.metrics.connections, 4);
  assert.equal(changed.after.metrics.connections, 3);
  assert.equal(difference.edges.removed.filter(value => value.kind === 'link').length, 1);
  assert.ok(read('.lattice/cache/diagnostics.json').some(value => value.code === 'broken-link'));
  console.log('Installed unified graph: cross-adapter references, complete lens targets/facets/views, structural-edge expressions, gates, history, deterministic rebuild and export passed.');
}
