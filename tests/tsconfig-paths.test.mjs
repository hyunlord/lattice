import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, extractJson, extractTypeScriptConfig, typeScriptConfigPaths, resolveModuleLinks } from '../dist/index.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const module = (path, text = '') => extractCode(input(path, text));
const config = (path, value) => extractTypeScriptConfig(input(path, typeof value === 'string' ? value : JSON.stringify(value)));

test('configuration JSONC keeps original lines and hash while ordinary JSON stays strict', () => {
    const source = input('tsconfig.json', '{\n // notes\n "compilerOptions": { "paths": { "app": ["./src/app.ts",], }, },\n}');
    const [record] = extractTypeScriptConfig(source);
    assert.equal(record.fields['/compilerOptions/paths/app/0'].line, 3);
    assert.equal(record.fields['/compilerOptions/paths/app/0'].contentHash, source.contentHash);
    assert.throws(() => extractJson(source));
    assert.throws(() => extractTypeScriptConfig(input('tsconfig.json', '{ /* unfinished')));
    const inputs = [source, input('tsconfig.child.json', '{"extends":"./config/base"}'), input('config/base.json', '{"extends":"../config/next.json"}'), input('config/next.json', '{}'), input('ordinary.json', '{ /*not a config*/ }')];
    assert.deepEqual([...typeScriptConfigPaths(inputs)].sort(), ['config/base.json', 'config/next.json', 'tsconfig.child.json', 'tsconfig.json']);
});

test('exact and most-specific wildcard paths resolve only selected module targets with field evidence', () => {
    const metadata = config('tsconfig.json', { compilerOptions: { paths: { '@app': ['./src/index.ts'], '@app/*': ['./src/*.ts'], '@app/internal/*': ['./private/*.ts'] } }, include: ['src/**/*', 'tests/**/*'] });
    const modules = [module('tests/main.ts', "import '@app';\nimport '@app/model';\nimport '@app/internal/model';"), module('src/index.ts'), module('src/model.ts'), module('private/model.ts')];
    const result = resolveModuleLinks(modules, metadata);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:src/index.ts', 'module:src/model.ts', 'module:private/model.ts']);
    assert.ok(result.edges[1].sources.some(source => source.pointer === '/compilerOptions/paths/@app~1*/0'));
    assert.ok(result.edges[1].sources.some(source => source.pointer === '/include/1'));
    const excludedTarget = resolveModuleLinks(modules.filter(value => value.node.id !== 'module:src/model.ts'), metadata);
    assert.equal(excludedTarget.diagnostics.find(value => value.specifier === '@app/model').code, 'unresolved-local-module');
});

test('multiple viable path targets stay ambiguous and unsupported wildcard patterns stay explicit', () => {
    const metadata = config('tsconfig.json', { compilerOptions: { paths: { 'choice': ['./one.ts', './two.ts'], 'bad/**': ['./one.ts'] } } });
    const result = resolveModuleLinks([module('main.ts', "import 'choice';\nimport 'bad/name';"), module('one.ts'), module('two.ts')], metadata);
    assert.equal(result.edges.length, 0);
    assert.deepEqual(result.diagnostics.map(value => value.code), ['ambiguous-module', 'unresolved-local-module']);
});

test('nearest configuration and inherited option origins prevent alias leakage across project scopes', () => {
    const metadata = [...config('tsconfig.json', { extends: './config/base.json', include: ['src/**/*', 'tests/**/*'], exclude: ['tests/skip/**'] }), ...config('config/base.json', { compilerOptions: { baseUrl: '../', paths: { 'app/*': ['./src/*.ts'] } } }), ...config('examples/tsconfig.json', { compilerOptions: { paths: { 'app/*': ['./local/*.ts'] } } })];
    const modules = [module('tests/main.ts', "import 'app/model';"), module('tests/skip/main.ts', "import 'app/model';"), module('examples/main.ts', "import 'app/model';"), module('examples/local/model.ts'), module('src/model.ts')];
    const result = resolveModuleLinks(modules, metadata);
    assert.deepEqual(result.edges.map(edge => [edge.source, edge.target]), [['module:tests/main.ts', 'module:src/model.ts'], ['module:examples/main.ts', 'module:examples/local/model.ts']]);
    assert.ok(result.edges[0].sources.some(source => source.path === 'config/base.json' && source.pointer === '/compilerOptions/baseUrl'));
    assert.ok(result.edges[0].sources.some(source => source.path === 'tsconfig.json' && source.pointer === '/extends'));
    assert.equal(result.diagnostics.length, 1);
});

test('unselected extends and configuration cycles are diagnosed instead of guessed', () => {
    const modules = [module('main.ts', "import 'app';"), module('src/app.ts')];
    for (const metadata of [config('tsconfig.json', { extends: './missing.json', compilerOptions: { paths: { app: ['./src/app.ts'] } } }), [...config('tsconfig.json', { extends: './base.json' }), ...config('base.json', { extends: './tsconfig.json', compilerOptions: { paths: { app: ['./src/app.ts'] } } })]]) {
        const result = resolveModuleLinks(modules, metadata);
        assert.equal(result.edges.length, 0);
        assert.equal(result.diagnostics[0].code, 'unresolved-configuration');
        assert.match(result.diagnostics[0].reason, /configuration/);
    }
});

test('CLI selected JSONC metadata participates in source fingerprints and cache invalidation', async () => {
    const { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { buildRepository } = await import('../bin/build.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-config-jsonc-')));
    try {
        execFileSync('git', ['init', '-q', root]);
        mkdirSync(join(root, 'src'));
        writeFileSync(join(root, 'tsconfig.json'), '{/*root*/"extends":"./base.json"}');
        writeFileSync(join(root, 'base.json'), '{\n/*original*/ "compilerOptions":{"paths":{"app":["./src/app.ts",],},},\n}');
        writeFileSync(join(root, 'ordinary.json'), '{/*not configuration*/"value":1}');
        writeFileSync(join(root, 'main.ts'), "import 'app';");
        writeFileSync(join(root, 'src/app.ts'), 'export const app = 1;');
        execFileSync('git', ['-C', root, 'add', '.']);
        const first = buildRepository({ root });
        const edge = first.graph.edges.find(value => value.kind === 'imports');
        assert.equal(edge.target, 'module:src/app.ts');
        assert.equal(edge.sources.every(source => first.graph.inputs.some(value => value.path === source.path && value.contentHash === source.contentHash)), true);
        assert.equal(first.diagnostics.some(value => value.path === 'tsconfig.json' && value.code === 'unparsed-file'), false);
        assert.equal(first.diagnostics.some(value => value.path === 'ordinary.json' && value.code === 'unparsed-file'), true);
        writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"paths":{"app":["./src/excluded.ts"]}}}');
        const second = buildRepository({ root });
        assert.equal(second.graph.edges.some(value => value.kind === 'imports'), false);
        assert.notEqual(second.graph.repository.sourceFingerprint, first.graph.repository.sourceFingerprint);
        assert.equal(second.diagnostics.find(value => value.specifier === 'app').code, 'unresolved-local-module');
        assert.equal(second.diagnostics.some(value => value.path === 'base.json' && value.code === 'unparsed-file'), true);
    } finally { rmSync(root, { recursive: true, force: true }); }
});


test('named configuration ambiguity and root-directory include remain conservative', () => {
    const modules = [module('main.ts', "import 'app';"), module('src/app.ts')];
    const one = config('tsconfig.named.json', { compilerOptions: { paths: { app: ['./src/app.ts'] } }, include: ['.'] });
    assert.equal(resolveModuleLinks(modules, one).edges.length, 1);
    const two = [...one, ...config('tsconfig.other.json', { compilerOptions: { paths: { app: ['./src/app.ts'] } }, include: ['**/*'] })];
    assert.equal(resolveModuleLinks(modules, two).diagnostics[0].code, 'ambiguous-module');
    const inherited = [...config('tsconfig.json', { extends: './config/base.json', include: ['.'] }), ...config('config/base.json', { compilerOptions: { paths: { app: ['../src/app.ts'] } } })];
    assert.equal(resolveModuleLinks(modules, inherited).edges[0].target, 'module:src/app.ts');
});
