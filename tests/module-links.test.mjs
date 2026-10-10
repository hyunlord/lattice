import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text = '') => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('relative imports with dotted basenames resolve selected TypeScript files and directory indexes', () => {
    const result = resolveModuleLinks([
        module('src/app.ts', "import '../engine/model.types';\nimport './locale.fr';\nimport './feature.v2';"),
        module('engine/model.types.ts'), module('src/locale.fr.ts'), module('src/feature.v2/index.ts'),
    ]);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:engine/model.types.ts', 'module:src/locale.fr.ts', 'module:src/feature.v2/index.ts']);
    assert.deepEqual(result.edges.map(edge => edge.sources[0].line), [1, 2, 3]);
});

test('dotted resolution retains ambiguity, explicit extensions, JS aliases, and selected-source boundaries', () => {
    const result = resolveModuleLinks([
        module('src/app.ts', "import './choice.types';\nimport './literal.ts';\nimport './compiled.js';\nimport './absent.types';\nimport '../../outside.types';"),
        module('src/choice.types.ts'), module('src/choice.types.tsx'),
        module('src/literal.ts.ts'), module('src/compiled.ts'), module('outside.types.ts'),
    ]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:src/compiled.ts']);
    assert.deepEqual(result.diagnostics.map(item => [item.specifier, item.code]), [
        ['./choice.types', 'ambiguous-module'], ['./literal.ts', 'unresolved-local-module'],
        ['./absent.types', 'unresolved-local-module'], ['../../outside.types', 'unresolved-local-module'],
    ]);
});

test('self-package imports use only selected explicit export and build projection evidence', async () => {
    const { extractJson } = await import('../dist/index.js');
    const record = (path, value) => extractJson({ path, text: JSON.stringify(value), contentHash: 'a'.repeat(64) });
    const records = [
        ...record('package.json', { name: '@scope/client', exports: { types: './distribution/index.d.ts', default: './distribution/index.js' }, scripts: { build: 'tsc --project tsconfig.dist.json' } }),
        ...record('tsconfig.dist.json', { compilerOptions: { rootDir: './source', outDir: './distribution' } }),
    ];
    const modules = [module('test-d/main.ts', "import client from '@scope/client';"), module('source/index.ts')];
    const resolved = resolveModuleLinks(modules, records);
    assert.deepEqual(resolved.diagnostics, []);
    assert.deepEqual(resolved.edges.map(edge => edge.target), ['module:source/index.ts']);
    assert.deepEqual([...new Set(resolved.edges[0].sources.map(source => source.path))].sort(), ['package.json', 'test-d/main.ts', 'tsconfig.dist.json']);
    assert.ok(resolved.edges[0].sources.some(source => source.pointer === '/compilerOptions/rootDir'));
    for (const metadata of [records.slice(0, 1), [records[0], ...record('tsconfig.dist.json', { compilerOptions: { outDir: './distribution' } })]]) {
        const unresolved = resolveModuleLinks(modules, metadata);
        assert.equal(unresolved.edges.length, 0);
        assert.equal(unresolved.diagnostics[0].code, 'unresolved-local-module');
        assert.match(unresolved.diagnostics[0].reason, /self-package/);
    }
    assert.equal(resolveModuleLinks(modules.slice(0, 1), records).edges.length, 0);
    const unselectedBranch = [...record('package.json', { name: '@scope/client', exports: { import: './source/index.ts', require: './missing.ts' } })];
    assert.equal(resolveModuleLinks(modules, unselectedBranch).edges.length, 0);
});

test('self-package exports preserve ambiguous conditions and nearest package ownership', async () => {
    const { extractJson } = await import('../dist/index.js');
    const record = (path, value) => extractJson({ path, text: JSON.stringify(value), contentHash: 'b'.repeat(64) });
    const modules = [module('test.ts', "import 'client';"), module('one.ts'), module('two.ts'), module('nested/test.ts', "import 'client';")];
    const records = [...record('package.json', { name: 'client', exports: { import: './one.ts', require: './two.ts' } }), ...record('nested/package.json', { name: 'other' })];
    const result = resolveModuleLinks(modules, records);
    assert.equal(result.edges.length, 0);
    assert.deepEqual(result.diagnostics.map(value => value.code), ['ambiguous-module', 'external-or-unresolved-module']);
});

test('CLI self-package edges retain metadata hashes and disappear when explicit configuration changes', async () => {
    const { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { buildRepository } = await import('../bin/build.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-self-package-')));
    try {
        execFileSync('git', ['init', '-q', root]);
        mkdirSync(join(root, 'source'));
        writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'client', main: './distribution/index.js', scripts: { build: 'tsc -p tsconfig.dist.json' } }));
        writeFileSync(join(root, 'tsconfig.dist.json'), JSON.stringify({ compilerOptions: { rootDir: 'source', outDir: 'distribution' } }));
        writeFileSync(join(root, 'test.ts'), "import client from 'client';");
        writeFileSync(join(root, 'source/index.ts'), 'export const client = 1;');
        execFileSync('git', ['-C', root, 'add', '.']);
        const first = buildRepository({ root });
        const edge = first.graph.edges.find(value => value.kind === 'imports');
        assert.equal(edge.target, 'module:source/index.ts');
        assert.equal(edge.sources.every(source => first.graph.inputs.some(input => input.path === source.path && input.contentHash === source.contentHash)), true);
        writeFileSync(join(root, 'tsconfig.dist.json'), JSON.stringify({ compilerOptions: { rootDir: 'excluded', outDir: 'distribution' } }));
        const second = buildRepository({ root });
        assert.equal(second.graph.edges.some(value => value.kind === 'imports'), false);
        assert.notEqual(second.graph.repository.sourceFingerprint, first.graph.repository.sourceFingerprint);
        assert.equal(second.diagnostics.find(value => value.specifier === 'client').code, 'unresolved-local-module');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
