import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifySources(cli, repository) {
  mkdirSync(join(repository, '.lattice'), { recursive: true });
  execFileSync('git', ['init', '--quiet', repository]);
  const save = (path, value) => writeFileSync(join(repository, path), JSON.stringify(value, null, 2));
  const get = (from, ...path) => ({ op: 'get', from, path });
  const source = value => ({ op: 'source', value });
  save('services.json', [{ id: 'api', budget: 12, unrelated: 900, steps: [{ cost: 3 }, { cost: 5 }] }]);
  save('.lattice/lens.json', {
    schemaVersion: 1, name: 'Service evidence', kinds: [{ id: 'service', label: 'Services', files: ['services.json'] }],
    derived: [
      { id: 'budget', scope: 'node', kinds: ['service'], value: get('node', 'budget') },
      { id: 'unrelated', scope: 'node', kinds: ['service'], value: get('node', 'unrelated') },
      { id: 'evidence', scope: 'node', kinds: ['service'], value: source(get('vars', 'budget')) },
    ],
    facets: [
      { id: 'direct', key: 'direct', kinds: ['service'], value: source(get('node', 'budget')) },
      { id: 'derived', key: 'derived', kinds: ['service'], value: get('vars', 'evidence') },
      { id: 'repeated', key: 'repeated', kinds: ['service'], value: source(get('vars', 'budget')) },
      { id: 'lexical', key: 'lexical', kinds: ['service'], value: { op: 'let', bindings: { chosen: get('vars', 'budget'), ignored: get('vars', 'unrelated') }, value: source(get('vars', 'chosen')) } },
      { id: 'wildcard', key: 'wildcard', kinds: ['service'], value: source(get('node', 'steps', '*', 'cost')) },
      { id: 'literal', key: 'literal', kinds: ['service'], value: source({ op: 'literal', value: 12 }) },
      { id: 'missing', key: 'missing', kinds: ['service'], value: source(get('node', 'absent')) },
    ],
  });
  const run = args => execFileSync(process.execPath, [cli, ...args, '--root', repository], { encoding: 'utf8' });
  const read = path => JSON.parse(readFileSync(join(repository, path), 'utf8'));
  const values = graph => Object.fromEntries(graph.facets.filter(facet => facet.nodeId === 'api').map(facet => [facet.key, facet.value]));
  run(['check']);
  const before = read('.lattice/cache/graph.json');
  const facets = values(before);
  for (const key of ['direct', 'derived', 'repeated', 'lexical']) {
    assert.deepEqual(facets[key].map(entry => entry.pointer), ['/0/budget']);
    assert.equal(facets[key][0].path, 'services.json');
    assert.equal(facets[key][0].line, 4);
    assert.match(facets[key][0].contentHash, /^[a-f0-9]{64}$/);
  }
  assert.deepEqual(facets.wildcard.map(entry => entry.pointer), ['/0/steps/0/cost', '/0/steps/1/cost']);
  assert.deepEqual(facets.literal, []);
  assert.deepEqual(facets.missing, []);
  run(['export', join(repository, '.lattice/site')]);
  assert.equal(read('.lattice/site/graph.json').hash, before.hash);
  save('services.json', [{ id: 'api', budget: 21, unrelated: 900, steps: [{ cost: 3 }, { cost: 5 }] }]);
  run(['check']);
  const after = values(read('.lattice/cache/graph.json'));
  assert.notEqual(after.direct[0].contentHash, facets.direct[0].contentHash);
  assert.deepEqual(after.direct.map(entry => entry.pointer), ['/0/budget']);
  console.log('Installed source expressions: exact field/wildcard spans, isolated derived/lexical evidence, repeat reads, missing/literal values, edits and export passed.');
}
