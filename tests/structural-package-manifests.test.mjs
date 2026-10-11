import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuralOverview, structuralSummary, productionSource } from '../dist/query/structural-map-model.js';
const node = (id, path, attributes = {}, kind = 'module') => ({ id, kind, name: id, attributes, contentHash: 'h', sources: [{ path, line: 1, pointer: '', contentHash: 'h' }] });
const pkg = (id, root, memberIds, description = '') => node(id, `${root}/Cargo.toml`, { buildSystem: 'cargo', manifestPath: `${root}/Cargo.toml`, root, memberIds, description }, 'package');
const edge = (source, target, kind = 'imports') => ({ id: `${source}:${target}`, source, target, kind, directed: true, field: '', sources: [] });

test('manifest packages remain distinct first-screen units and preserve uncovered product files', () => {
    // Given separate workspace members, one unrelated product script, and a test file.
    const nodes = [node('a', 'crates/runner/src/main.rs'), node('b', 'crates/search/src/lib.rs'), node('tool', 'tools/build.rs'), node('test', 'tests/check.rs'), pkg('runner', 'crates/runner', ['a'], 'Runs commands.'), pkg('search', 'crates/search', ['b'], 'Searches input.')];
    // When a structural overview is created.
    const model = buildStructuralOverview(nodes, [edge('runner', 'search', 'depends-on'), edge('a', 'b')]);
    // Then packages are visible separately, the dependency retains direction, and every product file belongs to a root.
    const roots = model.rootStageIds.map(id => model.stages.find(stage => stage.id === id));
    assert(roots.some(stage => stage.title === 'runner'));
    assert(roots.some(stage => stage.title === 'search'));
    assert.deepEqual(new Set(roots.flatMap(stage => stage.descendantNodeIds ?? stage.nodeIds)), new Set(['a', 'b', 'tool']));
    const from = roots.find(stage => stage.title === 'runner');
    const to = roots.find(stage => stage.title === 'search');
    assert(model.flows.some(flow => flow.source === from.id && flow.target === to.id));
    assert.equal(model.structuralScope.selectedCount, 3);
});

test('nested build packages take ownership before their aggregate root package', () => {
    // Given a root package containing a nested package path.
    const nodes = [node('root', 'src/main.ts'), node('child', 'packages/ui/src/index.ts'), pkg('workspace', '.', ['root', 'child']), pkg('ui', 'packages/ui', ['child'])];
    // When packages are projected.
    const model = buildStructuralOverview(nodes, []);
    // Then each source occurs once and the nested package owns its source.
    const roots = model.rootStageIds.map(id => model.stages.find(stage => stage.id === id));
    assert.deepEqual(roots.find(stage => stage.title === 'ui').nodeIds, ['child']);
    assert.equal(roots.flatMap(stage => stage.descendantNodeIds ?? stage.nodeIds).filter(id => id === 'child').length, 1);
});

test('main source paths protect namespace words from auxiliary classification', () => {
    // Given a language source namespace containing the word samples.
    // When product scope is computed, then src/main is retained while src/test remains auxiliary.
    assert.equal(productionSource('feature/src/main/kotlin/org/samples/view/Main.kt'), true);
    assert.equal(productionSource('feature/src/test/kotlin/org/view/MainTest.kt'), false);
});

test('repository introduction never comes from a nested package description', () => {
    // Given no root metadata description and one nested package description.
    const nested = node('nested', 'packages/ui/package.json', { sourceDescription: { kind: 'package-metadata', text: 'UI package only.' } }, 'document');
    const readme = node('readme', 'README.md', { sourceDescription: { kind: 'readme', text: 'Whole repository purpose.' } }, 'document');
    // When the repository heading is resolved, then the root README wins.
    assert.equal(structuralSummary([], [nested, readme], '.'), 'Whole repository purpose.');
});

test('public names provide explicitly labelled facts without fabricating folder roles', () => {
    // Given no documentation but actual exported names.
    const source = node('api', 'lib/api.ts', { publicNames: [{ name: 'serve', uses: 4 }, { name: 'Request', uses: 2 }] });
    // When its structural card is built, then factual names remain visibly labelled.
    const model = buildStructuralOverview([source], []);
    const root = model.stages.find(stage => stage.id === model.rootStageIds[0]);
    assert.equal(root.summaryDetail?.label, '대표 공개 이름');
    assert.match(root.summaryDetail?.text ?? '', /serve/);
});

test('large package sets fold along parent paths with complete initial product coverage', () => {
    // Given many modules under three physical product families.
    const nodes = ['network', 'storage', 'display'].flatMap(family => Array.from({ length: 10 }, (_, index) => {
        const id = `${family}-${index}`, root = `modules/${family}/${index}`;
        return [node(id, `${root}/src/index.ts`), pkg(`pkg-${id}`, root, [id])];
    }).flat());
    // When the initial frontier is created, then folded roots cover every product file once.
    const model = buildStructuralOverview(nodes, []);
    assert(model.rootStageIds.length <= 12);
    const roots = model.rootStageIds.map(id => model.stages.find(stage => stage.id === id));
    assert.equal(new Set(roots.flatMap(stage => stage.descendantNodeIds ?? stage.nodeIds)).size, 30);
    assert(roots.some(stage => stage.childIds.length > 0));
    assert(roots.every(stage => stage.title.startsWith('modules/') || stage.title.startsWith('pkg-')));
});

test('declared package dependencies do not masquerade as importing source files', async () => {
    // Given one importing source file and one manifest declaration for the same package edge.
    const { dependencyCountLabel } = await import('../viewer/dependency-layout.js');
    // When an arrow label is described, then declaration and file counts remain distinct.
    assert.equal(dependencyCountLabel({ source: 'a', target: 'b', label: '', count: 2, sourceFiles: ['src/main.ts', 'package.json'], projectSourceFiles: ['package.json'] }), '1개 파일 · 의존 선언 1개');
});

test('a broad top-level tree respects the root budget without losing physical children', async () => {
    const { packageFrontier } = await import('../dist/query/structural-package-frontier.js');
    const stages = Array.from({ length: 28 }, (_, index) => ({ id: `manifest:${index}`, title: `unit-${index}`, directoryPath: `family-${Math.floor(index / 2)}/unit-${index}`, summary: '', unit: '파일', nodeIds: [`file:${index}`], descendantNodeIds: [`file:${index}`], childIds: [], groups: [], incoming: [], outgoing: [] }));
    const result = packageFrontier(stages, new Map());
    assert(result.roots.length <= 12);
    const byId = new Map(result.stages.map(stage => [stage.id, stage]));
    const pending = [...result.roots], reached = new Set();
    while (pending.length) { const id = pending.pop(); if (reached.has(id)) continue; reached.add(id); pending.push(...byId.get(id).childIds); }
    assert(stages.every(stage => reached.has(stage.id)));
    assert(result.stages.filter(stage => stage.directoryPath.startsWith('family-') && stage.childIds.length).length === 14);
    assert.equal(new Set(result.roots.flatMap(id => result.stages.find(stage => stage.id === id).descendantNodeIds)).size, 28);
    assert(result.roots.every(id => result.stages.find(stage => stage.id === id).directoryPath === '.'));
});

test('manifest product roots outrank misleading documentation, demo and test names', () => {
    const module = (id, path) => node(id, path);
    const build = (id, system, root, members, extra = {}) => ({ ...pkg(id, root, members), attributes: { ...pkg(id, root, members).attributes, buildSystem: system, ...extra } });
    const nodes = [module('flavor', 'app/src/demo/kotlin/ExampleTest.kt'), module('android-test', 'app/src/androidTest/kotlin/Test.kt'), build('app', 'gradle', 'app', ['flavor', 'android-test']), module('formatter', 'cli/flags/doc/help.rs'), build('cli', 'cargo', 'cli', ['formatter'], { sourceRoots: ['cli/flags'] }), module('playable', 'physics_tests/test_example.gd'), build('playable-game', 'godot', 'physics_tests', ['playable']), module('benchmark', 'Assets/Scripts/System/Benchmark/Benchmark.cs'), module('unit', 'Assets/Tests/Test.cs'), build('unit-assembly', 'unity', 'Assets/Tests', ['unit'], { isTestAssembly: true })];
    const model = buildStructuralOverview(nodes, []);
    const visible = new Set(model.rootStageIds.flatMap(id => model.stages.find(stage => stage.id === id).descendantNodeIds));
    for (const id of ['flavor', 'formatter', 'playable', 'benchmark']) assert(visible.has(id), `${id} must remain a product source`);
    assert(!visible.has('android-test')); assert(!visible.has('unit'));
    assert.equal(model.structuralScope.productionCount, 4);
});

test('Unity test assembly status comes from assembly metadata, not a benchmark name', async () => {
    const { discoverBuildPackages } = await import('../dist/adapters/build-manifests.js');
    const inputs = [
        { path: 'Assets/Runtime/Runtime.asmdef', text: '{"name":"BenchmarkRuntime"}', contentHash: 'a'.repeat(64) },
        { path: 'Assets/Tests/Tests.asmdef', text: '{"name":"Checks","optionalUnityReferences":["TestAssemblies"]}', contentHash: 'b'.repeat(64) },
    ];
    const result = discoverBuildPackages(inputs, []);
    assert.equal(result.nodes.find(n => n.name === 'BenchmarkRuntime').attributes.isTestAssembly, false);
    assert.equal(result.nodes.find(n => n.name === 'Checks').attributes.isTestAssembly, true);
});


test('package frontier spends its budget on source-heavy families before tiny tooling', async () => {
    const { packageFrontier } = await import('../dist/query/structural-package-frontier.js');
    // Given a small early-sorting tree and three large product families.
    for (const [small, large] of [['a-support', 'z-product'], ['z-support', 'a-product']]) {
        const nodes = new Map(), stages = [];
        const add = (path, count, noise = false) => {
            const ids = Array.from({ length: count }, (_, index) => `${path}:${index}`);
            for (const id of ids) nodes.set(id, node(id, `${path}/${id.split(':').at(-1)}.ts`, {}, 'file'));
            const extra = `${path}:definition`; nodes.set(extra, node(extra, `${path}/index.ts`, {}, 'function'));
            const members = noise ? [...ids, ...Array(100).fill(ids[0] ?? extra), extra] : ids;
            stages.push({ id: `manifest:${path}`, title: path, directoryPath: path, summary: '', unit: '파일', nodeIds: members, descendantNodeIds: members, childIds: [], groups: [], incoming: [], outgoing: [] });
        };
        for (let index = 0; index < 10; index++) add(`${small}/tool-${index}`, index % 2, true);
        for (const family of ['network', 'storage', 'display']) for (let index = 0; index < 10; index++) add(`${large}/${family}/unit-${index}`, 3);
        // When input order changes, unique actual files still determine expansion.
        const result = packageFrontier(stages, nodes), reversed = packageFrontier([...stages].reverse(), nodes);
        assert.deepEqual(result.roots, reversed.roots);
        const byId = new Map(result.stages.map(stage => [stage.id, stage]));
        assert.deepEqual(new Set(result.roots.map(id => byId.get(id).directoryPath)), new Set([small, ...['network', 'storage', 'display'].map(family => `${large}/${family}`)]));
        assert(result.roots.length <= 12);
        assert(byId.get(result.roots[0]).directoryPath.startsWith(`${large}/`));
        assert.equal(byId.get(result.roots.at(-1)).directoryPath, small);
        // Then every leaf, including zero-file packages, remains navigable exactly under its real tree.
        const reached = new Set(), pending = [...result.roots];
        while (pending.length) { const id = pending.pop(); assert(!reached.has(id)); reached.add(id); pending.push(...byId.get(id).childIds); }
        assert(stages.every(stage => reached.has(stage.id)));
        const covered = new Set(result.roots.flatMap(id => byId.get(id).descendantNodeIds));
        assert.deepEqual(covered, new Set(stages.flatMap(stage => stage.descendantNodeIds)));
    }
});
