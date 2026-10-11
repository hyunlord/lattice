import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export function repositorySpecializations(path, text, repositories) {
  const errors = [];
  const names = repositories.map(entry => entry.repository.split('/').at(-1).toLowerCase());
  const distinct = names.filter(name => !['click', 'runtime'].includes(name));
  for (const entry of repositories) {
    if (text.toLowerCase().includes(entry.repository.toLowerCase()) || text.includes(entry.commit)) errors.push(`${path}: repository identity ${entry.repository}`);
  }
  for (const name of distinct) if (new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'iu').test(text)) errors.push(`${path}: benchmark name ${name}`);
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isStringLiteralLike(node) && ['click', 'runtime'].includes(node.text.toLowerCase())) {
      const call = node.parent;
      const event = node.text === 'click' && ts.isCallExpression(call) && call.arguments[0] === node && ts.isPropertyAccessExpression(call.expression) && ['addEventListener', 'removeEventListener'].includes(call.expression.name.text);
      if (!event) errors.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ambiguous benchmark literal ${node.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return errors;
}

export function checkBenchmarkContract(root) {
  const directory = join(root, 'docs/benchmarks/l9');
  const freeze = JSON.parse(readFileSync(join(directory, 'freeze.json'), 'utf8'));
  for (const [path, expected] of Object.entries(freeze.files)) assert.equal(createHash('sha256').update(readFileSync(join(root, path))).digest('hex'), expected, `Frozen benchmark changed: ${path}`);
  const repositories = JSON.parse(readFileSync(join(directory, 'repositories.json'), 'utf8')).repositories;
  assert.equal(repositories.length, 12);
  const errors = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:[cm]?ts|tsx|[cm]?js|css|html)$/u.test(entry.name)) errors.push(...repositorySpecializations(path, readFileSync(path, 'utf8'), repositories));
    }
  }
  for (const directory of ['src', 'cli', 'viewer', 'browser']) visit(join(root, directory));
  assert.deepEqual(errors, [], 'Benchmark-specific production code is forbidden');
  console.log(`L9 benchmark contract: ${Object.keys(freeze.files).length} frozen artifacts, 12 repositories, no production specialization.`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) checkBenchmarkContract(resolve(fileURLToPath(new URL('..', import.meta.url))));
