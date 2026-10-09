import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const required = ['AGENTS.md', 'DESIGN.md', 'docs/design/brief-v0.1.md', 'docs/design/lattice-v0.md', 'docs/design/viewer.md', 'docs/design/lens-examples.md', 'docs/review/acceptance.md', 'docs/reference/bs-mobile-oracle.md'];
for (const file of required) assert.ok((await stat(resolve(root, file))).isFile(), file);
const brief = await readFile(resolve(root, 'docs/design/brief-v0.1.md'));
assert.equal(createHash('sha256').update(brief).digest('hex'), '05c5555feb777ae8f64780536a0ce10a15787918608fc2c1dbd2aa933412c01b', 'Original brief must remain byte-identical');
const oracle = JSON.parse(await readFile(resolve(root, 'docs/reference/prototype-oracle.json'), 'utf8'));
assert.equal(oracle.classification.length, 216);
assert.equal(new Set(oracle.classification.map((entry) => entry.id)).size, 216);
assert.equal(oracle.classification.filter((entry) => entry.inProfile).length, 77);
assert.equal(oracle.classification.filter((entry) => entry.depth === 'unique').length, 20);
for (const row of oracle.counts) {
  const entries = oracle.classification.filter((entry) => entry.kind === row.kind);
  assert.equal(entries.length, row.total, row.kind);
  assert.equal(entries.filter((entry) => entry.inProfile).length, row.selected);
  for (const depth of ['design', 'stat', 'base', 'unique']) assert.equal(entries.filter((entry) => entry.depth === depth).length, row[depth]);
}
assert.deepEqual(oracle.baseWeaponShapes, { disk: 3, rays: 5, sector180: 1, sector90: 1 });
async function markdownFiles(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['.git', '.omo', '.omx', '.codex', '.agents', '.lattice', 'node_modules', 'dist', 'site', 'evidence'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await markdownFiles(path));
    else if (entry.name.endsWith('.md')) paths.push(path);
  }
  return paths;
}
const files = await markdownFiles(root);
let linkCount = 0;
for (const file of files) {
  const markdown = await readFile(file, 'utf8');
  assert.ok(markdown.endsWith('\n'), `Missing terminal newline: ${file}`);
  assert.ok(!/^(<<<<<<<|=======|>>>>>>>) /m.test(markdown), `Conflict marker: ${file}`);
  for (const match of markdown.matchAll(/\[[^\]\n]+\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const path = resolve(dirname(file), decodeURIComponent(target.split('#')[0]));
    assert.ok((await stat(path)).isFile(), `Missing link ${target} in ${file}`);
    linkCount++;
  }
}
const ledger = await readFile(resolve(root, 'docs/review/acceptance.md'), 'utf8');
const rows = [...ledger.matchAll(/^\| ((?:L\d-\d+|INV-\d+|REPORT)) \|/gm)].map((m) => m[1]);
assert.equal(new Set(rows).size, rows.length, 'Duplicate requirement ID');
assert.equal(rows.length, 50, 'Acceptance ledger row count changed; review original brief coverage');
console.log(`Documentation checks passed: ${files.length} Markdown files, ${linkCount} local file links, ${rows.length} requirements, 216 reference classifications. Product/runtime gates are not evaluated.`);
