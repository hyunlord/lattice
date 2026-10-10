import test from 'node:test';
import assert from 'node:assert/strict';
import { components } from '../dist/query/structural-frontier.js';
import { buildStructuralMap, buildStructuralOverview, structuralSummary, productionSource } from '../dist/query/structural-map-model.js';
const node = (id, path, attributes = {}, kind = 'module') => ({ id, kind, name: path, attributes, contentHash: 'h', sources: [{ path, line: 1, pointer: '', contentHash: 'h' }] });
const edge = (id, source, target) => ({ id, source, target, kind: 'imports', directed: true, field: '', sources: [] });
test('package dependency counts importing files rather than package members or duplicate statements', () => {
    const nodes = [node('a', 'src/a.go'), node('b', 'src/b.go'), ...Array.from({ length: 9 }, (_, i) => node(`u${i}`, `src/util/u${i}.go`)), node('package', 'src/util/u0.go', { directories: ['src/util'] }, 'package')];
    const model = buildStructuralMap(nodes, [edge('a', 'a', 'package'), edge('a2', 'a', 'package'), edge('b', 'b', 'package')]);
    assert.deepEqual(model.flows, [{ source: 'folder:src', target: 'folder:src/util', count: 2, sourceFiles: ['src/a.go', 'src/b.go'], label: '2개 파일 사용' }]);
});
test('wide folder trees fold to at most nine chunks without losing descendants', () => {
    const nodes = Array.from({ length: 18 }, (_, i) => node(`m${i}`, `src/feature${i}/index.ts`));
    const model = buildStructuralMap(nodes, []);
    assert(model.rootStageIds.length <= 9);
    const roots = model.stages.filter(s => model.rootStageIds.includes(s.id));
    assert.deepEqual(new Set(roots.flatMap(s => s.descendantNodeIds)), new Set(nodes.map(n => n.id)));
    assert(roots.some(s => s.childIds?.length > 1 && s.scopePaths?.length === s.childIds.length));
    assert.equal(roots.flatMap(s => s.descendantNodeIds).length, nodes.length);
});
test('most connected chunk is selected before isolated folders', () => {
    const model = buildStructuralMap([node('bin', 'bin/a.go'), node('app', 'src/a.go'), node('util', 'src/util/a.go')], [edge('i', 'app', 'util')]);
    assert.equal(model.defaultStage, 'folder:src');
});
test('deterministic descriptions prefer module prose, then local README, then public names', () => {
    const publicNode = node('n', 'src/a.go', { publicNames: [{ name: 'Search', uses: 7 }, { name: 'Parse', uses: 3 }] });
    const readme = node('readme', 'src/README.md', { sourceDescription: { text: 'Searchable input records. Extra sentence.', kind: 'readme' } }, 'document');
    assert.equal(structuralSummary([publicNode], [], 'src'), '공개 이름: Search · Parse');
    assert.equal(structuralSummary([publicNode], [readme], 'src'), 'Searchable input records.');
    assert.equal(structuralSummary([{ ...publicNode, attributes: { sourceDescription: { text: 'Package search matches input.', kind: 'module-doc' } } }], [readme], 'src'), 'Package search matches input.');
});

test('namespaces spanning folders remain logical packages instead of claiming every folder is used', () => {
    const nodes = [node('a', 'app/A.cs'), node('b', 'one/B.cs'), node('c', 'two/C.cs'), node('pkg', 'one/B.cs', { directories: ['one', 'two'], packageName: 'Shared' }, 'package')];
    const model = buildStructuralMap(nodes, [edge('i', 'a', 'pkg')]);
    assert.deepEqual(model.flows.map(f => [f.target, f.count]), [['folder:패키지 Shared', 1]]);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:패키지 Shared').nodeIds, ['pkg']);
});
test('parent folders retain only their direct modules when children are separately visible', () => {
    const model = buildStructuralMap([node('root', 'main.go'), node('src', 'src/main.go'), node('util', 'src/util/util.go')], []);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:.').nodeIds, ['root']);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:src').nodeIds, ['src']);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:src/util').nodeIds, ['util']);
});

test('declaration descriptions do not masquerade as folder purpose', () => {
    const module = node('a', 'src/a.go', { sourceDescription: { text: 'ConcurrentSet stores values.', kind: 'declaration-doc' }, publicNames: [{ name: 'Run', uses: 4 }] });
    assert.equal(structuralSummary([module], [], 'src'), '공개 이름: Run');
    const model = buildStructuralMap([module], []);
    assert.equal(model.stages[0].summary, '공개 이름: Run');
});

test('thirteen sibling folders preserve connected chunks and aggregate only the remainder', () => {
    const nodes = Array.from({ length: 13 }, (_, i) => node(`m${i}`, `src/feature${i}/index.ts`));
    const edges = Array.from({ length: 7 }, (_, i) => edge(`e${i}`, `m${i}`, `m${i + 1}`));
    const model = buildStructuralMap(nodes, edges);
    assert.equal(model.rootStageIds.length, 9);
    assert(model.rootStageIds.includes('folder:src'));
    assert(model.flows.some(flow => model.rootStageIds.includes(flow.source) && model.rootStageIds.includes(flow.target)));
    assert.equal(model.rootStageIds.filter(id => /feature[0-7]$/.test(id)).length, 8);
    const visible = model.stages.filter(s => model.rootStageIds.includes(s.id));
    const coveredChildren = new Set(visible.filter(s => s.id !== 'folder:src').flatMap(s => s.descendantNodeIds));
    const effective = visible.flatMap(s => s.id === 'folder:src' ? s.descendantNodeIds.filter(id => !coveredChildren.has(id)) : s.descendantNodeIds);
    assert.equal(effective.length, nodes.length);
    assert.equal(new Set(effective).size, nodes.length);
});

test('auxiliary trees fold without occupying production package slots or dropping files', () => {
    const nodes = [node('app', 'src/main/java/pkg/App.java'), node('parser', 'src/main/java/pkg/parser/Parser.java'), node('model', 'src/main/java/pkg/model/Model.java'), ...Array.from({ length: 15 }, (_, i) => node(`test${i}`, `src/test/java/pkg/case${i}/Test.java`)), ...Array.from({ length: 12 }, (_, i) => node(`example${i}`, `_examples/case${i}/main.go`))];
    const edges = [...nodes.filter(n => n.id.startsWith('test')).map(n => edge(n.id, n.id, 'app')), edge('prod', 'app', 'parser')];
    const model = buildStructuralMap(nodes, edges);
    assert.deepEqual(new Set(model.rootStageIds), new Set(['folder:src/main/java/pkg', 'folder:src/main/java/pkg/parser', 'folder:src/main/java/pkg/model', 'auxiliary:src/test', 'auxiliary:_examples']));
    assert.equal(model.defaultStage, 'folder:src/main/java/pkg');
    assert.equal(model.stages.find(s => s.id === 'auxiliary:src/test').descendantNodeIds.length, 15);
    assert.equal(model.flows.filter(f => f.target === 'folder:src/main/java/pkg').length, 15);
});
test('collapsed parents do not use one child module description as their purpose', () => {
    const child = node('a', '_examples/demo/main.go', { sourceDescription: { text: 'This is one specific demo.', kind: 'module-doc' }, entryPoints: [{ name: 'main', line: 5 }] });
    const model = buildStructuralMap([child], []);
    const group = model.stages.find(s => s.id === 'auxiliary:_examples');
    assert.deepEqual(group.scopePaths, ['_examples/demo']);
    assert.equal(group.summary, '');
    assert.equal(model.stages.find(s => s.id === 'folder:_examples/demo').summary, 'This is one specific demo.');
});
test('virtual package descriptions only use the recorded package members', () => {
    const nodes = [node('a', 'main/pkg/package-info.java', { sourceDescription: { text: 'Package document nodes.', kind: 'module-doc' } }), node('b', 'test/pkg/Test.java'), node('outsider', 'other/Foo.java', { sourceDescription: { text: 'Unrelated purpose.', kind: 'module-doc' } }), node('pkg', 'main/pkg/package-info.java', { directories: ['main/pkg', 'test/pkg'], memberIds: ['a', 'b'], packageName: 'pkg' }, 'package')];
    const model = buildStructuralMap(nodes, []);
    assert.equal(model.stages.find(s => s.id === 'folder:패키지 pkg').summary, '');
    assert.equal(model.stages.find(s => s.id === 'folder:패키지 pkg').unit, '패키지');
    assert.deepEqual(model.stages.find(s => s.id === 'folder:패키지 pkg').summaryDetails, []);
    assert.equal(model.stages.find(s => s.id === 'folder:패키지 pkg').summaryDetail.label, '여러 폴더가 공유하는 패키지');
});
test('verification fallback preserves the authored name and evidence', () => {
    const model = buildStructuralMap([node('a', 'test/api.ts', { verificationNames: [{ name: 'returns JSON', line: 12, kind: 'test-registration' }] })], []);
    assert.equal(model.stages[0].summary, '검증 항목: returns JSON');
    assert.deepEqual(model.stages[0].summaryEvidence, [{ path: 'test/api.ts', line: 12 }]);
});


test('connected nested subtrees retain their parent when a wide frontier folds', () => {
    const nodes = [node('app', 'src/main.ts'), ...Array.from({ length: 8 }, (_, i) => node(`peer${i}`, `src/peer${i}/index.ts`)), node('nested', 'src/foundation/index.ts'), ...Array.from({ length: 5 }, (_, i) => node(`deep${i}`, `src/foundation/part${i}/index.ts`))];
    const edges = [edge('root', 'app', 'nested'), ...Array.from({ length: 8 }, (_, i) => edge(`peerUse${i}`, 'app', `peer${i}`)), ...Array.from({ length: 5 }, (_, i) => edge(`use${i}`, `peer${i}`, `deep${i}`))];
    const model = buildStructuralMap(nodes, edges);
    assert.equal(model.rootStageIds.length, 9);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:src/foundation').descendantNodeIds, ['nested']);
    const coverage = model.stages.filter(s => model.rootStageIds.includes(s.id)).flatMap(s => s.descendantNodeIds);
    assert.equal(coverage.length, nodes.length);
    assert.equal(new Set(coverage).size, nodes.length);
    assert.equal(model.flows.length, edges.length);
});
test('project-wide import declarations remain separate from local import evidence', () => {
    const nodes = [node('global', 'src/GlobalUsings.cs'), node('local', 'src/Local.cs'), node('target', 'lib/Target.cs')];
    const model = buildStructuralMap(nodes, [{ ...edge('global', 'global', 'target'), attributes: { importScope: 'project' } }, edge('local', 'local', 'target')]);
    assert.equal(model.flows[0].count, 2);
    assert.deepEqual(model.flows[0].projectSourceFiles, ['src/GlobalUsings.cs']);
    assert.equal(model.flows[0].label, '1개 파일 사용 · 프로젝트 선언 1개');
});

test('repository introduction prefers the root README over the GitHub fallback', () => {
    const github = node('github', '.github/README.md', { sourceDescription: { kind: 'readme', text: 'GitHub introduction.', line: 9 } }, 'document');
    const root = node('readme', 'README.md', { sourceDescription: { kind: 'readme', text: 'Root introduction.', line: 3 } }, 'document');
    assert.equal(structuralSummary([], [github, root], '.'), 'Root introduction.');
    assert.equal(structuralSummary([], [github], '.'), 'GitHub introduction.');
    assert.equal(structuralSummary([], [{ ...root, attributes: { sourceDescription: { kind: 'readme', text: '   ' } } }, github], '.'), 'GitHub introduction.');
});
test('GitHub README fallback retains its exact evidence without borrowing nested project prose', () => {
    const github = node('github', '.github/README.md', { sourceDescription: { kind: 'readme', text: 'Repository introduction.', line: 9 } }, 'document');
    const nested = node('nested', 'packages/component/README.md', { sourceDescription: { kind: 'readme', text: 'Component introduction.', line: 5 } }, 'document');
    const model = buildStructuralMap([node('root', 'main.cs'), node('assembly', 'src/CommonAssemblyInfo.cs'), github, nested], []);
    const root = model.stages.find(s => s.id === 'folder:.');
    assert.equal(root.summary, 'Repository introduction.');
    assert.deepEqual(root.summaryDetail, { label: '저장소 소개', text: 'Repository introduction.' });
    assert.equal(structuralSummary([], [github, nested], '.'), 'Repository introduction.');
    assert.deepEqual(root.summaryEvidence, [{ path: '.github/README.md', line: 9 }]);
    assert.equal(model.stages.find(s => s.id === 'folder:src').summaryDetail.label, '저장소 소개');
    assert.equal(structuralSummary([], [nested], '.'), '');
});

test('cheap folds elsewhere preserve a connected child under a deeper parent', () => {
    const nodes = [node('root', 'main.ts'), node('app', 'src/app/index.ts'), node('api', 'src/app/api/index.ts'), node('core', 'src/app/core/index.ts'), node('docs', 'docs/index.ts'), node('tests', 'tests/index.ts'), ...Array.from({ length: 5 }, (_, i) => node(`peer${i}`, `other/peer${i}/index.ts`))];
    const edges = [edge('a', 'app', 'api'), edge('b', 'app', 'core'), ...Array.from({ length: 5 }, (_, i) => edge(`p${i}`, `peer${i}`, 'core'))];
    const model = buildStructuralMap(nodes, edges);
    assert.equal(model.rootStageIds.length, 9);
    assert(model.rootStageIds.includes('folder:src/app/core'));
    assert(model.rootStageIds.includes('folder:src/app/api'));
    assert.equal(model.flows.length, edges.length);
    const covered = model.stages.filter(s => model.rootStageIds.includes(s.id)).flatMap(s => s.descendantNodeIds);
    assert.deepEqual(new Set(covered), new Set(nodes.map(n => n.id)));
});

test('folder bidirectionality through separate barrel files is not a verified file cycle', () => {
    const nodes = [node('entry', 'src/index.ts'), node('core', 'src/core.ts'), node('leaf', 'src/child/index.ts')];
    const model = buildStructuralMap(nodes, [edge('export', 'entry', 'leaf'), edge('use', 'leaf', 'core')]);
    assert.equal(model.flows.length, 2);
    assert.deepEqual(model.verifiedCycleStageGroups, []);
});
test('verified cycles require original file import edges rather than namespace or project declarations', () => {
    const nodes = [node('a', 'app/a.ts'), node('b', 'lib/b.ts'), node('global', 'config/Global.cs'), node('pkg', 'lib/b.ts', { directories: ['lib'] }, 'package')];
    const model = buildStructuralMap(nodes, [edge('a', 'a', 'b'), edge('b', 'b', 'a'), edge('pkg', 'global', 'pkg'), edge('reverse', 'pkg', 'global'), { ...edge('project', 'global', 'a'), attributes: { importScope: 'project' } }, edge('local', 'a', 'global')]);
    assert.deepEqual(model.verifiedCycleStageGroups, [['folder:app', 'folder:lib']]);
});


test('auxiliary folder roles match exact separated tokens without excluding their dependencies', () => {
    for (const path of ['src/Library.Tests/A.cs', 'src/Library_Benchmarks/A.cs', 'src/library-examples/demo/A.cs', 'testdata/a.go', 'fixtures/a.ts', 'docs/.vitepress/config.ts']) assert.equal(productionSource(path), false);
    for (const path of ['src/Contest/A.cs', 'src/Latest/A.cs', 'src/Testament/A.cs', 'src/testing-support/A.cs']) assert.equal(productionSource(path), true);
    const nodes = [node('app', 'src/Library/App.cs'), node('base', 'src/Foundation/Base.cs'), node('tests', 'src/Library.Tests/Test.cs'), node('nested', 'src/Library.Tests/nested/Test.cs')];
    const edges = [edge('prod', 'app', 'base'), edge('test', 'tests', 'app'), edge('nested', 'nested', 'base')];
    const model = buildStructuralMap(nodes, edges);
    assert.equal(model.rootStageIds.includes('folder:src/Library.Tests/nested'), false);
    assert(model.rootStageIds.includes('auxiliary:src/Library.Tests'));
    assert.notEqual(model.defaultStage, 'auxiliary:src/Library.Tests');
    assert.equal(model.flows.length, edges.length);
    assert.equal(model.stages.find(s => s.id === 'auxiliary:src/Library.Tests').descendantNodeIds.length, 2);
});


test('production default does not inherit a folded test subtree popularity', () => {
    const nodes = [node('assembly', 'src/CommonAssemblyInfo.cs'), node('app', 'src/App/main.cs'), node('base', 'src/Base/base.cs'), ...Array.from({ length: 12 }, (_, i) => node(`test${i}`, `src/Project${i}.Tests/test.cs`))];
    const model = buildStructuralMap(nodes, [edge('prod', 'app', 'base'), ...Array.from({ length: 12 }, (_, i) => edge(`test${i}`, `test${i}`, 'app'))]);
    assert.equal(model.defaultStage, 'folder:src/App');
    assert.equal(model.flows.length, 13);
});


const projected = (model, ids = model.rootStageIds) => {
    const stages = new Map(model.stages.map(stage => [stage.id, stage]));
    const owner = id => { while (id) { if (ids.includes(id)) return id; id = stages.get(id)?.parentId; } };
    const result = new Map();
    for (const flow of model.flows) { const source = owner(flow.source), target = owner(flow.target); if (!source || !target || source === target) continue; const key = JSON.stringify([source, target]); if (!result.has(key)) result.set(key, { source, target, files: new Set() }); for (const file of flow.sourceFiles) result.get(key).files.add(file); }
    return [...result.values()];
};
test('direct root identity survives folding without creating a dependency back to the executor', () => {
    const nodes = [node('executor', 'main.go'), node('ast', 'taskfile/ast/a.go'), node('helper', 'internal/util/u.go'), ...Array.from({ length: 14 }, (_, i) => node(`other${i}`, `internal/other${i}/a.go`))];
    const model = buildStructuralMap(nodes, [edge('run', 'executor', 'ast'), edge('help', 'ast', 'helper')]);
    assert(model.rootStageIds.length <= 9);
    assert.deepEqual(model.stages.find(s => s.id === 'folder:.').descendantNodeIds, ['executor']);
    assert.equal(projected(model).some(flow => flow.target === 'folder:.'), false);
    assert(components(model.rootStageIds, projected(model)).every(group => group.length === 1));
    assert.equal(model.stages.filter(s => model.rootStageIds.includes(s.id)).flatMap(s => s.descendantNodeIds).length, nodes.length);
});
test('production scope omits auxiliary contributions and all scope retains exact import files', () => {
    const nodes = [node('app', 'main.go'), node('test', 'main_test.go'), node('lib', 'lib/a.go')];
    const model = buildStructuralOverview(nodes, [edge('prod', 'app', 'lib'), edge('test', 'test', 'lib')]);
    assert.deepEqual(model.structuralScope, { default: 'production', productionCount: 2, auxiliaryCount: 1, allRootStageIds: ['all:folder:.', 'all:folder:lib'], allDefaultStage: 'all:folder:.' });
    assert.deepEqual([...projected(model)[0].files], ['main.go']);
    assert.deepEqual([...projected(model, model.structuralScope.allRootStageIds)[0].files], ['main.go', 'main_test.go']);
    const testsOnly = buildStructuralOverview([node('test', 'tests/api.ts')], []);
    assert.equal(testsOnly.structuralScope.default, 'all');
    assert(testsOnly.rootStageIds.length > 0);
});
test('production local module documentation wins over ancestor sections and auxiliary names', () => {
    const module = node('main', 'src/lib/package-info.java', { sourceDescription: { kind: 'module-doc', text: 'The public API.', line: 3 }, publicNames: [{ name: 'Api', uses: 1 }] });
    const test = node('test', 'src/lib/ApiTest.java', { sourceDescription: { kind: 'module-doc', text: 'Test helpers.' }, publicNames: [{ name: 'Sandwich', uses: 100 }] });
    const readme = node('readme', 'src/README.md', { sourceDescription: { kind: 'readme', text: 'The Maven module.' } }, 'heading'); readme.name = 'lib';
    assert.equal(structuralSummary([module, test], [readme], 'src/lib'), 'The public API.');
    assert.equal(structuralSummary([{ ...module, attributes: { publicNames: [{ name: 'Api', uses: 1 }] } }, test], [], 'src/lib'), '공개 이름: Api');
});

test('fallback keeps named production anchors and does not turn scope metadata into purpose', async () => {
    const { structuralFrontier } = await import('../dist/query/structural-frontier.js');
    const stages = Array.from({ length: 18 }, (_, i) => ({ id: `folder:${i ? `module${i}` : '.'}`, title: i ? `module${i}` : 'root', summary: '', unit: '모듈', nodeIds: [`n${i}`], groups: [], incoming: [], outgoing: [] }));
    const flows = stages.slice(1).map((stage, i) => ({ source: stages[i].id, target: stage.id, sourceFiles: Array.from({ length: i === 5 || i === 10 ? 20 : 1 }, (_, n) => `module${i}/file${n}.ts`), label: 'uses' }));
    const model = structuralFrontier(stages, flows, () => true);
    const roots = model.stages.filter(s => model.rootStageIds.includes(s.id));
    assert(roots.length <= 9);
    assert(roots.filter(s => s.nodeIds.length && s.id !== 'folder:.').length >= 3);
    assert(roots.some(s => s.id === 'folder:.'));
    assert(roots.every(s => !s.title.startsWith('의존 단계') && s.summary === ''));
    assert(components(model.rootStageIds, projected({ ...model, flows })).every(group => group.length === 1));
    assert.equal(roots.flatMap(s => s.descendantNodeIds).length, stages.length);
    const cycle = structuralFrontier(stages, [...flows, { source: stages.at(-1).id, target: stages[0].id, sourceFiles: ['module17/file.ts'], label: 'uses' }], () => true);
    const cyclicRoots = cycle.stages.filter(s => cycle.rootStageIds.includes(s.id));
    assert.equal(cyclicRoots.length, 9);
    assert.equal(cyclicRoots.filter(s => s.nodeIds.length).length, 8);
    assert.equal(cyclicRoots.flatMap(s => s.descendantNodeIds).length, stages.length);
});
test('scope public names aggregate full definitions once per source instead of truncated overload lists', () => {
    const n = node('n', 'src/a.go', { definitions: [{ name: 'Executor', public: true, uses: 9, line: 4 }, { name: 'Executor', public: true, uses: 9, line: 7 }, { name: 'Reader', public: true, uses: 15, line: 10 }, { name: 'Secret', public: false, uses: 100, line: 12 }], publicNames: [{ name: 'Executor', uses: 9 }, { name: 'ExportedValue', uses: 2, line: 14 }] });
    assert.equal(structuralSummary([n], [], 'src'), '공개 이름: Reader · Executor · ExportedValue');
    const model = buildStructuralMap([n], []);
    assert.deepEqual(model.stages[0].summaryEvidence.map(e => e.line), [4, 10, 14]);
});

test('scoped cards label representative type prose and preserve its comment evidence', () => {
    const doc = { text: 'Processes manifests and runs their actions. More detail.', kind: 'type-doc', line: 4, endLine: 5 };
    const member = node('runner', 'runner.go', { definitions: [{ name: 'Runner', kind: 'type', public: true, uses: 20, line: 6, declarationDescription: doc }] });
    const readme = node('readme', 'README.md', { sourceDescription: { kind: 'readme', text: 'Repository purpose.', line: 1 } }, 'document');
    assert.equal(structuralSummary([], [readme], '.'), 'Repository purpose.');
    const model = buildStructuralMap([member, readme], []);
    assert.equal(model.stages[0].summary, '주요 타입 Runner — Processes manifests and runs their actions.');
    assert.deepEqual(model.stages[0].summaryDetail, { label: '주요 타입 Runner', text: 'Processes manifests and runs their actions.' });
    assert.deepEqual(model.stages[0].summaryEvidence, [{ path: 'runner.go', line: 4 }]);
    const copy = node('copy', 'src/README.md', readme.attributes, 'document');
    assert.equal(structuralSummary([{ ...member, sources: [{ ...member.sources[0], path: 'src/runner.go' }] }], [readme, copy], 'src'), '주요 타입 Runner — Processes manifests and runs their actions.');
    const module = { ...member, attributes: { ...member.attributes, sourceDescription: { kind: 'module-doc', text: 'Package runner evaluates input.' } } };
    assert.equal(structuralSummary([module], [readme], '.'), 'Package runner evaluates input.');
});
test('residual cards keep actual folder names and label member type prose without broadening its claim', () => {
    const nodes = [node('a', 'examples/alpha/a.ts', { definitions: [{ name: 'Alpha', kind: 'type', public: true, uses: 3, line: 10, declarationDescription: { kind: 'type-doc', text: 'Renders an example.', line: 8, endLine: 9 } }] }), node('b', 'examples/beta/b.ts'), node('hidden', 'examples/zzz/z.ts', { definitions: [{ name: 'Hidden', kind: 'type', public: true, uses: 500, mentionFiles: 500, declarationDescription: { kind: 'type-doc', text: 'Describes the hidden helper.', line: 2 } }] })];
    const model = buildStructuralMap(nodes, []), group = model.stages.find(s => s.scopePaths);
    assert.equal(group.title, 'examples/alpha · beta 외 1개 폴더');
    assert.deepEqual(group.headingParts, ['examples/alpha', 'examples/beta']);
    assert.equal(group.headingRemainder, 1);
    assert.equal(group.summary, '주요 타입 Alpha — Renders an example.');
    assert.deepEqual(group.summaryDetails, [{ label: '주요 타입 Alpha', text: 'Renders an example.' }]);
    assert.deepEqual(group.summaryEvidence, [{ path: 'examples/alpha/a.ts', line: 8 }]);
});

test('cross-file lexical mentions outrank local repetitions without implying compiler binding', () => {
    const type = (name, uses, mentionFiles) => ({ kind: 'type', public: true, name, uses, ...(mentionFiles === undefined ? {} : { mentionFiles, usageBasis: 'distinct-other-files-lexical' }), declarationDescription: { kind: 'type-doc', text: `${name} handles its documented task.`, line: 3 } });
    const n = node('types', 'src/types.cs', { definitions: [type('LocalHelper', 100), type('MainApi', 2, 12), type('LocalException', 200, 1)] });
    assert.equal(structuralSummary([n], [], 'src'), '주요 타입 MainApi — MainApi handles its documented task.');
    const undocumented = { ...n, attributes: { definitions: n.attributes.definitions.map(({ declarationDescription, ...value }) => value) } };
    assert.equal(structuralSummary([undocumented], [], 'src'), '공개 이름: MainApi · LocalException · LocalHelper');
});
test('explicit package warning does not override an authored representative type purpose', () => {
    const n = node('a', 'src/a.java', { sourceDescription: { kind: 'module-doc', text: 'Do NOT use this package directly.' }, definitions: [{ kind: 'type', public: true, name: 'Factory', uses: 1, declarationDescription: { kind: 'type-doc', text: 'Creates requested values.', line: 8 } }] });
    assert.equal(structuralSummary([n], [], 'src'), '주요 타입 Factory — Creates requested values.');
    const warningOnly = buildStructuralMap([{ ...n, attributes: { sourceDescription: n.attributes.sourceDescription } }], []);
    assert.equal(warningOnly.stages[0].summaryDetail.label, '사용 주의');
});
test('package endpoints deduplicate only when all member files already have one physical owner', async () => {
    const { packageStages } = await import('../dist/query/structural-package-stages.js');
    const stage = (id, ids, extra = {}) => ({ id, title: id, summary: '', unit: '모듈', nodeIds: ids, groups: [], incoming: [], outgoing: [], ...extra });
    const nodes = [node('a', 'core/a.cs'), node('b', 'core/compat/b.cs'), node('consumer', 'app/main.cs'), node('pkg', 'core/a.cs', { category: 'namespace', memberIds: ['a', 'b'], directories: ['core', 'core/compat'] }, 'package')];
    const stages = [stage('core', [], { childIds: ['a', 'b'], descendantNodeIds: ['a', 'b'] }), stage('a', ['a'], { parentId: 'core' }), stage('b', ['b'], { parentId: 'core' }), stage('app', ['consumer']), stage('namespace', ['pkg'])];
    const flows = [{ source: 'app', target: 'namespace', sourceFiles: ['app/main.cs'], count: 1, label: '1개 파일 사용' }, { source: 'app', target: 'core', sourceFiles: ['app/main.cs'], count: 1, label: '1개 파일 사용' }];
    const result = packageStages({ stages, flows, rootStageIds: ['core', 'app', 'namespace'], defaultStage: 'namespace' }, nodes);
    assert.deepEqual(result.rootStageIds, ['core', 'app']); assert.equal(result.defaultStage, 'core');
    assert.deepEqual(result.flows.map(f => [f.source, f.target, f.count, f.sourceFiles]), [['app', 'core', 1, ['app/main.cs']]]);
    assert(nodes.some(n => n.id === 'pkg'));
    const spanning = packageStages({ stages, flows, rootStageIds: ['a', 'b', 'app', 'namespace'], defaultStage: 'namespace' }, nodes);
    assert(spanning.rootStageIds.includes('namespace'));
    assert.equal(spanning.stages.find(s => s.id === 'namespace').summary, '');
    assert.equal(spanning.stages.find(s => s.id === 'namespace').summaryDetail.label, '여러 폴더가 공유하는 네임스페이스');
    assert.deepEqual(spanning.flows, flows);
});

test('package alias cleanup removes empty folded ancestors and refreshes mixed scope headings', async () => {
    const { structuralFrontier } = await import('../dist/query/structural-frontier.js');
    const { packageStages } = await import('../dist/query/structural-package-stages.js');
    const stage = (path, nodeIds, childIds) => ({ id: `folder:${path}`, title: path, summary: '', unit: '모듈', nodeIds, ...(childIds ? { childIds } : {}), groups: [], incoming: [], outgoing: [] });
    for (const count of [7, 8]) {
        const nodes = [node('a', 'src/core/a.cs'), node('b', 'src/core/b.cs'), node('p1', 'src/core/a.cs', { memberIds: ['a'] }, 'package'), node('p2', 'src/core/b.cs', { memberIds: ['b'] }, 'package'), ...Array.from({ length: count }, (_, i) => node(`o${i}`, `other${i}/a.cs`))];
        const leaves = [stage('src/core', ['a', 'b']), stage('virtual/one', ['p1']), stage('virtual/two', ['p2']), ...Array.from({ length: count }, (_, i) => stage(`other${i}`, [`o${i}`]))];
        const flows = Array.from({ length: count }, (_, i) => ({ source: `folder:other${i}`, target: 'folder:src/core', count: 1, sourceFiles: [`other${i}/a.cs`], label: '1개 파일 사용' }));
        const frontier = structuralFrontier([...leaves, stage('virtual', [], ['folder:virtual/one', 'folder:virtual/two']), stage('.', [], leaves.map(s => s.id))], flows, () => true);
        const result = packageStages({ ...frontier, flows, defaultStage: 'folder:virtual' }, nodes);
        assert(result.rootStageIds.includes(result.defaultStage));
        assert(result.stages.every(s => s.nodeIds.length || s.childIds?.length));
        assert(result.stages.every(s => !(s.scopePaths ?? []).some(path => path.startsWith('virtual'))));
        assert(result.stages.every(s => !(s.headingParts ?? []).some(path => path.startsWith('virtual'))));
        assert(result.stages.every(s => !s.title.includes('virtual')));
        assert.equal(result.flows.reduce((sum, f) => sum + f.count, 0), count);
    }
});

test('type role details retain three distinct ranked facts and only their exact source evidence', () => {
    const member = (name, rank, path, line) => node(name + path, path, { definitions: [{ name, kind: 'type', public: true, mentionFiles: rank, uses: 1, declarationDescription: { kind: 'type-doc', text: `${name} performs its documented operation.`, line } }] });
    const nodes = [member('First', 12, 'src/a.ts', 2), member('Second', 10, 'src/b.ts', 4), member('Third', 8, 'src/c.ts', 6), member('Fourth', 6, 'src/d.ts', 8), member('First', 5, 'src/e.ts', 10)];
    const stage = buildStructuralMap(nodes, []).stages[0];
    assert.deepEqual(stage.summaryDetails.map(d => d.label), ['주요 타입 First', '주요 타입 Second', '주요 타입 Third']);
    assert.deepEqual(stage.summaryDetail, stage.summaryDetails[0]);
    assert.deepEqual(stage.summaryEvidence, [{ path: 'src/a.ts', line: 2 }, { path: 'src/b.ts', line: 4 }, { path: 'src/c.ts', line: 6 }]);
    const documented = nodes.map((n, i) => i ? n : { ...n, attributes: { ...n.attributes, sourceDescription: { kind: 'module-doc', text: 'This package executes operations.', line: 1 } } });
    assert.equal(buildStructuralMap(documented, []).stages[0].summaryDetails, undefined);
});
