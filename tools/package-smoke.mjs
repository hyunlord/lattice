import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), 'lattice-package-'));
try {
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }));
  assert.equal(packed.length, 1);
  const entry = packed[0];
  assert.ok(entry.files.some(file => file.path === 'dist/index.js'));
  assert.ok(entry.files.some(file => file.path === 'dist/index.d.ts'));
  assert.ok(entry.files.every(file => !file.path.startsWith('tests/') && !file.path.startsWith('.omo/')));
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, entry.filename)], { cwd: temporary, stdio: 'pipe' });
  const manifest = JSON.parse(readFileSync(join(temporary, 'node_modules/@hyunlord/lattice/package.json'), 'utf8'));
  assert.equal(manifest.dependencies, undefined);
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { canonicalJson, createGraph } from '@hyunlord/lattice';
    const digest = text => createHash('sha256').update(text).digest('hex');
    assert.equal(canonicalJson({b:2,a:1}), '{"a":1,"b":2}');
    const graph = createGraph({ repository: {name:'installed',dirty:false,sourceFingerprint:digest('empty')},nodes:[],edges:[],facets:[],findings:[],views:[],snapshots:[],lensDigest:null,adapterVersions:{},inputs:[] }, digest);
    assert.match(graph.hash, /^[a-f0-9]{64}$/);
    assert.throws(() => canonicalJson({number:NaN}), {name:'GraphInputError'});
    console.log('Installed ESM exports, graph construction, hash and rejection path passed.');
  `], { cwd: temporary, encoding: 'utf8' });
  console.log(output.trim());
} finally { rmSync(temporary, { recursive: true, force: true }); }
