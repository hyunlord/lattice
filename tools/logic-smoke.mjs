import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function verifyInstalledLogic(cli, root) {
  mkdirSync(root);
  execFileSync('git', ['init', '--quiet', root]);
  const fixtures = {
    'entry.js': 'function work() { return 1; } export function main() { return work(); }',
    'entry.ts': 'function work(): number { return 1; } export function main() { return work(); }',
    'entry.py': 'def work():\n    return 1\ndef main():\n    return work()\n',
    'entry.go': 'package main\nfunc work() int { return 1 }\nfunc main() { work() }\n',
    'entry.rs': 'fn work() -> i32 { 1 } fn main() { work(); }',
    'Entry.java': 'class Entry { static void work() {} public static void main(String[] args) { work(); } }',
    'Entry.kt': 'fun work() = 1\nfun main() { work() }\n',
    'Entry.cs': 'class Entry { static void Work() {} static void Main() { Work(); } }',
  };
  for (const [path, text] of Object.entries(fixtures)) writeFileSync(join(root, path), text);
  execFileSync(process.execPath, [cli, 'build', '--root', root, '--no-lens'], { stdio: 'pipe' });
  const graph = JSON.parse(readFileSync(join(root, '.lattice/cache/graph.json'), 'utf8'));
  for (const path of Object.keys(fixtures)) assert.ok(graph.edges.some(edge => edge.kind === 'calls' && edge.attributes.resolution === 'exact' && edge.sources.some(source => source.path === path)), `Installed WASM parser resolves ${path}`);
  console.log('Installed parser assets and exact calls passed for all seven language families.');
}
