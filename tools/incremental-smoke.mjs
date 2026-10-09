import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyIncremental(cli, repository) {
  mkdirSync(repository, { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const save = (path, text) => writeFileSync(join(repository, path), text);
  const json = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  const build = parsed => {
    execFileSync(process.execPath, [cli, 'build', '--root', repository], { encoding: 'utf8' });
    const report = json('.lattice/cache/build.json');
    assert.equal(report.mode, 'strict-content');
    assert.equal(report.parsed, parsed);
    assert.equal(report.reused, report.files - parsed);
    assert.ok(report.bytes > 0);
    assert.ok(report.implementation);
    assert.ok(Number.isInteger(report.discarded) && report.discarded >= 0);
    return json('.lattice/cache/graph.json');
  };
  const coldEquivalent = incremental => {
    const files = json('.lattice/cache/build.json').files;
    rmSync(join(repository, '.lattice/cache/extractions'), { recursive: true, force: true });
    const cold = build(files);
    assert.equal(cold.hash, incremental.hash);
    assert.deepEqual(cold.findings, incremental.findings);
  };
  save('.gitignore', '.lattice/cache/\n.lattice/site/\n');
  save('records.json', '[{"id":"service:a","name":"API","value":1}]\n');
  save('collections.json', '{"active":[{"id":"selected:active"}],"draft":[{"id":"selected:draft"}]}\n');
  save('owners.csv', 'id,name\nowner:a,Platform\n');
  save('README.md', '# Service map\n[Records](records.json)\n');
  save('main.ts', 'import { work } from "./worker.js";\n');
  save('worker.ts', 'export const work = 1;\n');
  save('other.ts', 'export const work = 2;\n');
  const first = build(7);
  assert.equal(build(0).hash, first.hash);

  const recordPath = join(repository, 'records.json');
  const previousStat = statSync(recordPath);
  save('records.json', readFileSync(recordPath, 'utf8').replace('"value":1', '"value":2'));
  utimesSync(recordPath, previousStat.atime, previousStat.mtime);
  assert.equal(statSync(recordPath).size, previousStat.size);
  assert.ok(Math.abs(statSync(recordPath).mtimeMs - previousStat.mtimeMs) < 1);
  const edited = build(1);
  assert.equal(edited.nodes.find(node => node.id === 'service:a').attributes.value, 2);
  assert.notEqual(edited.hash, first.hash);
  coldEquivalent(edited);

  save('extra.json', '{"id":"service:extra"}\n');
  rmSync(join(repository, 'owners.csv'));
  renameSync(join(repository, 'README.md'), join(repository, 'GUIDE.md'));
  const moved = build(2);
  assert.ok(moved.nodes.some(node => node.id === 'service:extra'));
  assert.ok(moved.nodes.some(node => node.id === 'document:GUIDE.md'));
  assert.ok(moved.nodes.every(node => node.id !== 'owner:a' && node.id !== 'document:README.md'));
  coldEquivalent(moved);

  save('main.ts', 'import { work } from "./other.js";\n');
  const imported = build(1);
  assert.ok(imported.edges.some(edge => edge.kind === 'imports' && edge.source === 'module:main.ts' && edge.target === 'module:other.ts'));
  assert.ok(imported.edges.every(edge => edge.source !== 'module:main.ts' || edge.target !== 'module:worker.ts'));
  coldEquivalent(imported);

  const lens = {
    schemaVersion: 1, name: 'Incremental service map',
    kinds: [
      { id: 'service', label: 'Services', files: ['records.json', 'extra.json'] },
      { id: 'selection', label: 'Selection', files: ['collections.json'] },
      { id: 'document', label: 'Documents', files: ['*.md'] },
      { id: 'module', label: 'Modules', files: ['*.ts'] },
    ],
    facets: [{ id: 'stage', key: 'stage', value: 'draft' }],
    findings: [{ id: 'count', query: { kinds: ['service'] }, metrics: { count: { op: 'count', value: { op: 'get', from: 'vars', path: ['targets'] } } }, template: '{count} services' }],
  };
  const saveLens = () => save('.lattice/lens.json', JSON.stringify(lens));
  saveLens();
  const classified = build(0);
  assert.equal(classified.facets.find(facet => facet.nodeId === 'service:a').value, 'draft');
  lens.facets[0].value = 'ready';
  saveLens();
  const reclassified = build(0);
  assert.equal(reclassified.facets.find(facet => facet.nodeId === 'service:a').value, 'ready');
  assert.notEqual(reclassified.hash, classified.hash);
  coldEquivalent(reclassified);

  lens.kinds[1].records = '/active';
  saveLens();
  assert.ok(build(1).nodes.some(node => node.id === 'selected:active'));
  lens.kinds[1].records = '/draft';
  saveLens();
  const selected = build(1);
  assert.ok(selected.nodes.some(node => node.id === 'selected:draft'));
  assert.ok(selected.nodes.every(node => node.id !== 'selected:active'));
  coldEquivalent(selected);
  assert.equal(build(0).hash, selected.hash);
  console.log('Installed incremental build: no-op reuse, preserved-mtime edit, add/delete/rename, import relinking, lens reclassification and selector invalidation match cold rebuilds.');
}
