import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { extractCode } from '../dist/index.js';
import { publicTypeUsage } from '../bin/public-type-usage.mjs';
import { buildRepository } from '../bin/build.mjs';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const named = (modules, path, name) => modules.find(module => module.node.sources[0].path === path).node.attributes.definitions.find(value => value.name === name);

test('public type mentions count other files once, excluding comments and strings without mutating cached declarations', () => {
    const inputs = [input('types.cs', 'public interface IReader {} public class Fault { Fault() {} Fault(int n) {} }'), input('use.cs', 'IReader first; IReader second;'), input('more.cs', 'IReader third;'), input('decoy.cs', '// IReader\n/* IReader */ string text = "IReader";'), input('unselected.cs', 'IReader hidden;')];
    const modules = inputs.slice(0, 4).map(extractCode), before = JSON.stringify(modules);
    const result = publicTypeUsage(modules, inputs);
    assert.equal(named(result, 'types.cs', 'IReader').mentionFiles, 2);
    assert.equal(named(result, 'types.cs', 'Fault').mentionFiles, 0);
    assert.equal(named(result, 'types.cs', 'IReader').usageBasis, 'distinct-other-files-lexical');
    assert.equal(JSON.stringify(modules), before);
    assert.equal(named(result, 'types.cs', 'IReader').uses, named(modules, 'types.cs', 'IReader').uses);
});

test('duplicate public type names remain unclassified while other languages have independent candidates', () => {
    const inputs = [input('a.cs', 'public class Reader {}'), input('b.cs', 'public class Reader {}'), input('use.cs', 'Reader value;'), input('reader.ts', 'export class Reader {}'), input('use.ts', 'let value: Reader;')];
    const result = publicTypeUsage(inputs.map(extractCode), inputs);
    assert.equal(named(result, 'a.cs', 'Reader').mentionFiles, undefined);
    assert.equal(named(result, 'b.cs', 'Reader').usageBasis, undefined);
    assert.equal(named(result, 'reader.ts', 'Reader').mentionFiles, 1);
});

test('warm extraction reuse recomputes cross-file mentions after another source changes', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-type-mentions-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '-q', root]);
    writeFileSync(join(root, '.gitignore'), '.lattice/\n');
    writeFileSync(join(root, 'types.cs'), 'public interface IReader {}');
    writeFileSync(join(root, 'use.cs'), 'IReader first;');
    const count = build => build.graph.nodes.find(node => node.id === 'module:types.cs').attributes.definitions.find(value => value.name === 'IReader').mentionFiles;
    assert.equal(count(buildRepository({ root, noLens: true })), 1);
    const warm = buildRepository({ root, noLens: true });
    assert.equal(warm.extraction.stats.parsed, 0);
    assert.equal(count(warm), 1);
    writeFileSync(join(root, 'use.cs'), 'int first;');
    const changed = buildRepository({ root, noLens: true });
    assert.equal(changed.extraction.stats.parsed, 1);
    assert.ok(changed.extraction.stats.reused >= 1);
    assert.equal(count(changed), 0);
});
