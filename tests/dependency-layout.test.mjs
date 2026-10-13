import test from 'node:test';
import assert from 'node:assert/strict';
import { dependencyLevels, dependencyView, orthogonalRoute } from '../viewer/dependency-layout.js';

const stage = (id, parentId, nodeIds = []) => ({ id, title: id, summary: '', unit: '모듈', nodeIds, descendantNodeIds: nodeIds, groups: [], incoming: [], outgoing: [], ...(parentId ? { parentId } : {}) });
test('folded dependency counts distinct importing files and excludes visible descendant membership', () => {
    const root = { ...stage('folder:.'), descendantNodeIds: ['main', 'a', 'b'] };
    const src = { ...stage('folder:src', 'folder:.', ['a']), descendantNodeIds: ['a', 'b'] };
    const util = stage('folder:src/util', 'folder:src', ['b']);
    const model = { stages: [root, src, util], flows: [{ source: src.id, target: util.id, sourceFiles: ['src/a.go', 'src/a.go'] }] };
    const visible = dependencyView(model, [root.id, src.id, util.id]);
    assert.deepEqual(visible.stages.map(s => s.nodeIds), [['main'], ['a'], ['b']]);
    assert.equal(visible.flows[0].count, 1);
});
test('dependency layering condenses actual cycles without treating unrelated siblings as a ring', () => {
    const stages = ['app', 'api', 'core', 'util'].map(id => stage(id));
    const flows = [{ source: 'app', target: 'api' }, { source: 'api', target: 'core' }, { source: 'core', target: 'api' }, { source: 'core', target: 'util' }];
    const layers = dependencyLevels({ stages, flows, actualCycles: [['api', 'core']] });
    assert.deepEqual(layers.map(g => [g.stages.map(s => s.id), g.level, g.cyclic]), [[['app'], 0, false], [['api', 'core'], 1, true], [['util'], 2, false]]);
});
test('orthogonal dependency route goes around labels and boxes instead of crossing them', () => {
    const obstacle = { x: 40, y: 24, width: 40, height: 64 };
    const points = orthogonalRoute({ x: 16, y: 48 }, { x: 112, y: 48 }, { width: 128, height: 128, obstacles: [obstacle] });
    assert.ok(points.length >= 4);
    for (let index = 1; index < points.length; index++) { const a = points[index - 1], b = points[index]; assert.ok(a.x === b.x || a.y === b.y); for (let t = 0; t <= 1; t += .01) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; assert.ok(!(x > 40 && x < 80 && y > 24 && y < 88)); } }
});
test('an off-page dependency stays in the selected chunk explanation', () => {
    const stages = [stage('folder:src'), ...Array.from({ length: 18 }, (_, i) => stage(`folder:src/feature${i}`, 'folder:src', [`module${i}`]))];
    const flows = [{ source: 'folder:src/feature0', target: 'folder:src/feature9', sourceFiles: ['src/feature0/index.ts'] }];
    const view = dependencyView({ stages, flows }, stages.slice(1, 10).map(s => s.id));
    assert.equal(view.flows.length, 0);
    assert.deepEqual(view.stages[0].outgoing, [{ name: 'folder:src/feature9', description: '1개 파일이 사용: index.ts' }]);
});
test('overview limits dependency pairs by weight without selecting a foundation', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const flows = Array.from({ length: 8 }, (_, index) => ({ source: `source${index}`, target: 'foundation', count: index + 1, sourceFiles: Array.from({ length: index + 1 }, (_, n) => `${index}/${n}.ts`) }));
    const view = { stages: ['foundation', ...flows.map(flow => flow.source)].map(id => stage(id)), flows };
    assert.deepEqual(displayedDependencyFlows(view, undefined, false).map(flow => flow.count), [8, 7, 6, 5, 4]);
    assert.equal(displayedDependencyFlows(view, 'source0', false).length, 1);
    assert.equal(displayedDependencyFlows(view, undefined, true).length, 8);
});
test('mutually dependent folder containers omit their internal arrows', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const view = {
        stages: ['app', 'api', 'core', 'util'].map(id => stage(id)), flows: [
            { source: 'app', target: 'api', count: 4 }, { source: 'api', target: 'core', count: 8 },
            { source: 'core', target: 'api', count: 2 }, { source: 'core', target: 'util', count: 3 }
        ]
    };
    assert.deepEqual(displayedDependencyFlows(view, undefined, false).map(flow => [flow.source, flow.target]), [['app', 'api'], ['api', 'util']]);
});
test('one mutual-reference container shares one external importer count', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const view = {
        stages: ['a', 'b', 'base'].map(id => stage(id)), flows: [
            { source: 'a', target: 'b', count: 1 }, { source: 'b', target: 'a', count: 1 },
            { source: 'a', target: 'base', sourceFiles: ['a/one.ts'], count: 1 },
            { source: 'b', target: 'base', sourceFiles: ['b/two.ts'], count: 1 }
        ]
    };
    const result = displayedDependencyFlows(view, undefined, false);
    assert.equal(result.length, 1); assert.equal(result[0].count, 2);
    assert.deepEqual(result[0].sourceFiles, ['a/one.ts', 'b/two.ts']);
});
test('opposite directions preserve separate importer counts on one pair', async () => {
    const { dependencyPairs } = await import('../viewer/dependency-layout.js');
    const pairs = dependencyPairs([{ source: 'a', target: 'b', count: 3, sourceFiles: ['a/1', 'a/2', 'a/3'], label: '3개 파일' }, { source: 'b', target: 'a', count: 2, sourceFiles: ['b/1', 'b/2'], label: '2개 파일' }]);
    assert.equal(pairs.length, 1); assert.equal(pairs[0].count, 3); assert.equal(pairs[0].reverseCount, 2); assert.equal(pairs[0].weight, 5);
});
test('label bands leave a free routing cell between a rounded label and the next card', async () => {
    const { dependencyBandHeight } = await import('../viewer/dependency-layout.js');
    assert.equal(dependencyBandHeight(5, 1100), 136);
    const label = { x: 310, y: 158, width: 92, height: 20 };
    const card = { x: 170, y: 206, width: 368, height: 102 };
    const points = orthogonalRoute({ x: 416, y: 168 }, { x: 352, y: 192 }, { width: 1100, height: 500, obstacles: [label, card] });
    assert.ok(points.length > 1);
});

test('dependency labels distinguish identical leaf names and ports stay separate', async () => {
    const { uniqueDependencyNames, dependencyPort, reserveDependencyRoute } = await import('../viewer/dependency-layout.js');
    const names = uniqueDependencyNames([{ id: 'a', title: 'src/main/nodes' }, { id: 'b', title: 'src/test/nodes' }, { id: 'c', title: 'src/parser' }]);
    assert.deepEqual([...names.values()], ['main/nodes', 'test/nodes', 'parser']);
    const box = { x: 24, y: 24, width: 160, height: 80 }; assert.equal(new Set(Array.from({ length: 8 }, (_, i) => dependencyPort(box, i, 8))).size, 8);
    const occupied = new Set(); reserveDependencyRoute([{ x: 16, y: 48 }, { x: 112, y: 48 }], 128, occupied);
    const route = orthogonalRoute({ x: 16, y: 48 }, { x: 112, y: 48 }, { width: 128, height: 128, obstacles: [], occupied });
    assert.ok(route.some(point => point.y !== 48));
});

test('every dependency label names its endpoints and count without tracing a shared path', async () => {
    const { dependencyLabelLines } = await import('../viewer/dependency-layout.js');
    const stages = [{ id: 'a', title: 'source' }, { id: 'b', title: 'test/helpers' }, { id: 'c', title: 'long-package-name-with-many-characters' }];
    const labels = dependencyLabelLines({ stages, flows: [{ source: 'a', target: 'b', label: '28개 파일' }, { source: 'a', target: 'c', label: '1개 파일' }] });
    assert.deepEqual(labels.get('["a","b"]'), ['source → helpers', '28개 파일']);
    assert.deepEqual(labels.get('["a","c"]'), ['source', '→ long-package-name-with-many-characters', '1개 파일']);
});

test('fractional card bounds preserve the free grid corridor beside a label', () => {
    for (const fixture of [
        { start: { x: 232, y: 224 }, end: { x: 160, y: 240 }, label: { x: 22, y: 206, width: 196, height: 32 }, card: { x: 12, y: 255.25, width: 310, height: 172.34375 } },
        { start: { x: 232, y: 1664 }, end: { x: 168, y: 1968 }, label: { x: 22, y: 1934, width: 196, height: 32 }, card: { x: 12, y: 1981.34375, width: 310, height: 115.25 } }
    ]) {
        const route = orthogonalRoute(fixture.start, fixture.end, { width: 334, height: 2200, obstacles: [fixture.label, fixture.card] });
        assert.ok(route.length > 1);
        for (let i = 1; i < route.length; i++) { const a = route[i - 1], b = route[i]; for (let t = 0; t <= 1; t += .01)for (const obstacle of [fixture.label, fixture.card]) { const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; assert.ok(!(x > obstacle.x && x < obstacle.x + obstacle.width && y > obstacle.y && y < obstacle.y + obstacle.height)); } }
    }
});

test('a long label affects only the dependency gap that contains it', async () => {
    const { dependencyLabelLines, dependencyLabelRowHeight } = await import('../viewer/dependency-layout.js');
    const short = { source: 'a', target: 'b', label: '7개 파일' }, long = { source: 'b', target: 'c', label: '1개 파일' };
    const lines = dependencyLabelLines({ stages: [{ id: 'a', title: 'test' }, { id: 'b', title: 'src' }, { id: 'c', title: 'long-namespace-with-many-characters' }], flows: [short, long] });
    assert.equal(dependencyLabelRowHeight([short], lines), 48);
    assert.equal(dependencyLabelRowHeight([long], lines), 64);
});

test('folding independent one-way imports does not claim an original cycle', () => {
    const stages = [stage('a'), stage('a/x', 'a'), stage('a/y', 'a'), stage('b'), stage('b/x', 'b'), stage('b/y', 'b')];
    const flows = [{ source: 'a/x', target: 'b/x', sourceFiles: ['a/x.ts'] }, { source: 'b/y', target: 'a/y', sourceFiles: ['b/y.ts'] }];
    const folded = dependencyLevels(dependencyView({ stages, flows }, ['a', 'b']));
    assert.equal(folded[0].cyclic, false); assert.equal(folded[0].foldedCycle, true);
    const actual = dependencyLevels(dependencyView({ stages, verifiedCycleStageGroups: [['a/x', 'b/x']], flows: [...flows, { source: 'b/x', target: 'a/x', sourceFiles: ['b/x.ts'] }] }, ['a', 'b']));
    assert.equal(actual[0].cyclic, true); assert.equal(actual[0].foldedCycle, false);
});
test('project-wide declarations remain distinct from importing files after folding', () => {
    const stages = [stage('a'), stage('a/x', 'a'), stage('b')];
    const flows = [{ source: 'a/x', target: 'b', sourceFiles: ['a/use.cs', 'a/GlobalUsings.cs'], projectSourceFiles: ['a/GlobalUsings.cs'] }];
    const view = dependencyView({ stages, flows }, ['a', 'b']); assert.equal(view.flows[0].count, 2);
    assert.equal(view.flows[0].label, '1개 파일 · 프로젝트 선언 1개');
    assert.match(view.stages[0].outgoing[0].description, /1개 파일이 사용: use.cs · 프로젝트 공통 선언 1개: GlobalUsings.cs/);
});

test('namespace identity keeps its specific category over the generic package label', async () => {
    const { label } = await import('../viewer/loop-map-shared.js');
    assert.equal(label({ kind: 'package', kindLabel: '네임스페이스' }, { context: { kindLabel: () => '패키지' } }), '네임스페이스');
});

test('shared folder prefixes stop at the first distinct path segment', async () => {
    const { sharedFolderPrefix, dependencyBandHeight } = await import('../viewer/dependency-layout.js');
    assert.equal(sharedFolderPrefix(['src/Serilog/Core', 'src/Serilog/Settings/KeyValuePairs']), 'src/Serilog');
    assert.equal(sharedFolderPrefix(['src/alpha/shared/a', 'src/beta/shared/b']), 'src');
    assert.equal(sharedFolderPrefix(['src/only']), '');
    assert.ok(dependencyBandHeight(0, 1100) >= 32, 'a skipped-level target port needs a free corridor');
});

test('long dotted components factor only a shared visible semantic prefix', async () => {
    const { factoredTitle } = await import('../viewer/dependency-layout.js');
    const paths = ['src/Library.Tests.Benchmarks', 'src/Library.DependencyInjectionExtensions', 'src/Library'];
    assert.deepEqual(factoredTitle(paths[1], paths), { prefix: 'src/Library.', name: 'DependencyInjectionExtensions' });
    assert.deepEqual(factoredTitle('src/UniqueVeryLongUnbrokenComponent', paths), { prefix: '', name: 'src/UniqueVeryLongUnbrokenComponent' });
    assert.deepEqual(factoredTitle('package.json', ['package.json', 'package.lock']), { prefix: '', name: 'package.json' });
});
test('dense focused positions use visible dependencies without manufacturing cycles', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const stages = ['app', 'middle', 'base', 'leaf'].map(id => stage(id));
    const flows = [{ source: 'app', target: 'middle' }, { source: 'middle', target: 'base' }, { source: 'base', target: 'leaf' }, { source: 'app', target: 'leaf' }, ...Array.from({ length: 9 }, () => ({ source: 'middle', target: 'base' }))];
    const view = { stages, flows, actualCycles: [] };
    const focused = dependencyLevels({ ...view, flows: displayedDependencyFlows(view, 'app', false) });
    assert.equal(Math.max(...focused.map(group => group.level)), 1);
    assert.ok(focused.every(group => !group.cyclic));
    assert.equal(Math.max(...dependencyLevels(view).map(group => group.level)), 3);
});

test('folder SCCs without file-level proof never claim a verified file cycle', () => {
    const stages = ['src', 'src/vanilla'].map(id => stage(id));
    const flows = [{ source: 'src', target: 'src/vanilla' }, { source: 'src/vanilla', target: 'src' }];
    for (const view of [{ stages, flows }, dependencyView({ stages, flows }, stages.map(item => item.id))]) {
        const group = dependencyLevels(view)[0]; assert.equal(group.cyclic, false); assert.equal(group.foldedCycle, true);
    }
});

test('an unrelated repository root does not erase a useful shared path prefix', async () => {
    const { sharedFolderPrefix } = await import('../viewer/dependency-layout.js');
    const paths = ['.', 'lib/src/main/java/acme/core', 'lib/src/main/java/acme/core/stream', 'lib/src/main/java/acme/core/internal'];
    const prefix = sharedFolderPrefix(paths);
    assert.equal(prefix, 'lib/src/main/java/acme');
    assert.equal(paths[0].startsWith(`${prefix}/`), false);
    assert.ok(paths.slice(1).every(path => path.startsWith(`${prefix}/`)));
});

test('structural scope selects one tree while preserving complete catalog nodes', async () => {
    const { structuralScopeModel } = await import('../viewer/dependency-layout.js');
    const stages = [{ id: 'src', childIds: ['child'] }, { id: 'child', parentId: 'src' }, { id: 'all:src', childIds: ['all:test'] }, { id: 'all:test', parentId: 'all:src' }];
    const nodes = [{ id: 'production' }, { id: 'test' }];
    const model = { stages, nodes, flows: [{ source: 'src', target: 'child' }, { source: 'all:src', target: 'all:test' }], rootStageIds: ['src'], defaultStage: 'src', structuralScope: { default: 'production', productionCount: 1, auxiliaryCount: 1, allRootStageIds: ['all:src'], allDefaultStage: 'all:src' }, verifiedCycleStageGroups: [['src', 'child'], ['all:src', 'all:test']] };
    const production = structuralScopeModel(model);
    assert.deepEqual(production.stages.map(stage => stage.id), ['src', 'child']);
    assert.equal(production.nodes, nodes);
    assert.equal(production.flows.length, 1);
    const all = structuralScopeModel(model, 'all');
    assert.deepEqual(all.stages.map(stage => stage.id), ['all:src', 'all:test']);
    assert.deepEqual(all.rootStageIds, ['all:src']);
    assert.equal(all.defaultStage, 'all:src');
    assert.deepEqual(all.verifiedCycleStageGroups, [['all:src', 'all:test']]);
    const auxiliaryOnly = { ...model, structuralScope: { ...model.structuralScope, productionCount: 0, default: 'all' } };
    assert.deepEqual(structuralScopeModel(auxiliaryOnly, 'production').rootStageIds, ['all:src']);
    const configured = { ...model, structuralScope: undefined };
    assert.equal(structuralScopeModel(configured, 'all'), configured);
});

test('long repeated residual suffixes retain unique short scope labels', async () => {
    const { uniqueDependencyNames } = await import('../viewer/dependency-layout.js');
    const names = uniqueDependencyNames([stage('a'), stage('b')].map((s, i) => ({ ...s, title: `${i ? 'extras' : 'gson'}/src/main/java/com/google/gson/나머지 하위 폴더` })));
    assert.equal(names.get('a'), 'gson/…/나머지 하위 폴더');
    assert.equal(names.get('b'), 'extras/…/나머지 하위 폴더');
});

test('caption outside a card moves its short arrow port clear of the caption', async () => {
    const { clearDependencyPort } = await import('../viewer/dependency-layout.js');
    const box = { x: 0, y: 40, width: 200, height: 80 }, caption = { x: 50, y: 15, width: 90, height: 24 };
    const x = clearDependencyPort(box, 100, true, [caption]);
    assert.ok(x < 50 || x > 140);
});

test('port selection excludes only its own padded card while retaining other obstacles', async () => {
    const { clearDependencyPort } = await import('../viewer/dependency-layout.js');
    const box = { x: 0, y: 40, width: 200, height: 80 }, own = { x: -4, y: 36, width: 208, height: 88 }, caption = { x: 50, y: 15, width: 90, height: 24 }, neighbor = { x: 140, y: 10, width: 70, height: 30 };
    const x = clearDependencyPort(box, 100, true, [own, caption, neighbor], own);
    assert.ok(x < 50);
});

test('group edge labels use actual representative paths before resolving ambiguity', async () => {
    const { dependencyStageTitle } = await import('../viewer/dependency-layout.js');
    const group = { ...stage('group'), title: 'unrelated legacy caption', headingParts: ['src/bind', 'src/annotations'], headingRemainder: 2, scopePaths: ['src/bind', 'src/annotations', 'src/a', 'src/b'] };
    assert.equal(dependencyStageTitle(group), 'src/bind');
    assert.equal(dependencyStageTitle(stage('src/core')), 'src/core');
});

test('selected panel preserves the scope of repository context and authored type summaries', async () => {
    const { dependencyPanelSummary } = await import('../viewer/dependency-overview.js');
    assert.equal(dependencyPanelSummary({ ...stage('folder:helper'), summary: 'Repository purpose.', summaryDetail: { label: '저장소 소개', text: 'Repository purpose.' } }), '저장소 소개 — Repository purpose.');
    assert.equal(dependencyPanelSummary({ ...stage('folder:reader'), summary: '주요 타입 Reader — Reads input.', summaryDetail: { label: '주요 타입 Reader', text: 'Reads input.' } }), '주요 타입 Reader — Reads input.');
});

test('member counts never distinguish two otherwise identical dependency labels', async () => {
    const { uniqueDependencyNames, dependencyStageTitle } = await import('../viewer/dependency-layout.js');
    const stages = [{ ...stage('ordinary'), title: 'gson/src/main/java/com/google/gson/internal' }, { ...stage('group'), headingParts: ['gson/src/main/java-templates/com/google/gson/internal'], scopePaths: ['one', 'two', 'three'] }].map(item => ({ ...item, title: dependencyStageTitle(item) }));
    const names = uniqueDependencyNames(stages);
    assert.notEqual(names.get('ordinary'), names.get('group'));
    assert.match(names.get('ordinary'), /java/);
    assert.match(names.get('group'), /java-templates/);
    assert.ok([...names.values()].every(name => !name.includes('(+')));
});

test('folder headings use the model source-root path without unrelated representatives', async () => {
    const { dependencyHeadingParts } = await import('../viewer/dependency-layout.js');
    const group = { ...stage('group'), title: 'internal', headingParts: ['internal/complete', 'cmd/task'] };
    const ast = { ...stage('ast'), title: 'taskfile/ast' };
    assert.deepEqual(dependencyHeadingParts(group, [group, ast]), ['internal']);
    assert.deepEqual(dependencyHeadingParts(ast, [group, ast]), ['taskfile/ast']);
});

test('the selected panel lists every authored type fact once with its qualifier', async () => {
    const { dependencyPanelSummary } = await import('../viewer/dependency-overview.js');
    const first = { label: '주요 타입 Reader', text: 'Reads records.' };
    assert.equal(dependencyPanelSummary({ ...stage('folder'), summaryDetail: first, summaryDetails: [first, { label: '주요 타입 Writer', text: 'Writes records.' }] }), '주요 타입 Reader — Reads records.\n주요 타입 Writer — Writes records.');
});
test('dotted endpoint labels factor a repeated base while retaining the distinguishing component', async () => {
    const { dependencyLabelLines, factoredTitle } = await import('../viewer/dependency-layout.js');
    const base = stage('Library'), extension = stage('Library.DependencyInjectionExtensions');
    assert.deepEqual(factoredTitle(extension.title, [base.title, extension.title]), { prefix: 'Library.', name: 'DependencyInjectionExtensions' });
    const lines = [...dependencyLabelLines({ stages: [base, extension], flows: [{ source: base.id, target: extension.id, label: '1개 파일' }] }).values()][0];
    assert.ok(lines.join(' ').includes('DependencyInjectionExtensions'));
    assert.ok(!lines.join(' ').includes('Library.DependencyInjectionExtensions'));
});

test('dependency labels explicitly distinguish a folder bundle from its representative member', async () => {
    const { dependencyLabelLines } = await import('../viewer/dependency-layout.js');
    const source = stage('root'), bundle = { ...stage('logger'), scopePaths: ['internal/logger', 'internal/execext'] };
    const labels = [...dependencyLabelLines({ stages: [source, bundle], flows: [{ source: source.id, target: bundle.id, label: '11개 파일', count: 11 }] }).values()];
    assert.deepEqual(labels, [['root → logger 묶음', '11개 파일']]);
});
test('mutual-folder facts preserve all internal directions and deduplicate importers', async () => {
    const { internalDependencyFacts } = await import('../viewer/dependency-layout.js');
    const view = { stages: [], flows: [{ source: 'a', target: 'b', sourceFiles: ['1', '1', '2'], count: 99 }, { source: 'b', target: 'a', sourceFiles: ['3'] }, { source: 'c', target: 'a', sourceFiles: ['4'] }, { source: 'a', target: 'c', sourceFiles: ['5'] }, { source: 'outside', target: 'a', sourceFiles: ['1', '2', '3'] }] };
    assert.deepEqual(internalDependencyFacts(view, ['a', 'b', 'c']).map(f => [f.source, f.target, f.count]), [['a', 'b', 2], ['a', 'c', 1], ['b', 'a', 1], ['c', 'a', 1]]);
    assert.deepEqual(internalDependencyFacts(view, ['a']), []);
});
test('featured roles prioritize entry folders then largest subtrees without selecting them', async () => {
    const { featuredDependencyRoles } = await import('../viewer/dependency-layout.js');
    const stages = [{ ...stage('compat'), descendantNodeIds: ['a'] }, { ...stage('root'), descendantNodeIds: ['a', 'b'] }, { ...stage('config'), descendantNodeIds: ['a', 'b', 'c'] }, { ...stage('mappers'), descendantNodeIds: ['a', 'b', 'c', 'd'] }];
    assert.deepEqual(featuredDependencyRoles({ stages, flows: [] }, ['root']).map(s => s.id), ['root', 'mappers', 'config']);
    assert.deepEqual(featuredDependencyRoles({ stages: [stages[0]], flows: [] }, []).map(s => s.id), ['compat']);
});
test('inline card roles keep first sourced sentence and never expose stale AI as current', async () => {
    const { dependencyCardRole } = await import('../viewer/dependency-layout.js');
    const authored = { ...stage('a'), summary: 'Parses requests. Preserves routes.', summaryEvidence: [{ path: 'a/README.md', line: 1 }] };
    assert.deepEqual(dependencyCardRole(authored), { text: 'Parses requests.', label: '문서 설명' });
    assert.deepEqual(dependencyCardRole({ ...authored, interpretation: { summary: 'Builds clients. Calls the parser.', stale: false, evidence: [] } }), { text: 'Builds clients.', label: 'AI 요약' });
    assert.deepEqual(dependencyCardRole({ ...authored, interpretation: { summary: 'Old inferred role.', stale: true, evidence: [] } }), { text: 'Parses requests.', label: '문서 설명' });
    assert.equal(dependencyCardRole(stage('b')).text, '역할 설명 없음 — 요약 실행 필요');
});
test('collapsed-arrow attribution names actual members rather than the representative folder', async () => {
    const { dependencyPairSources } = await import('../viewer/dependency-layout.js');
    const view = { stages: ['root', 'configuration', 'license'].map(id => stage(id)), flows: [{ source: 'root', target: 'configuration' }, { source: 'configuration', target: 'root' }, { source: 'configuration', target: 'license' }] };
    assert.deepEqual(dependencyPairSources(view, { source: 'root', target: 'license' }), ['configuration']);
    assert.deepEqual(dependencyPairSources(view, { source: 'root', target: 'license' }, 'target'), ['license']);
    const reverse = { ...view, flows: [...view.flows.filter(flow => flow.target !== 'license'), { source: 'license', target: 'root' }] };
    assert.deepEqual(dependencyPairSources(reverse, { source: 'license', target: 'configuration' }, 'target'), ['root']);
});

test('coverage separates rendered external pairs from internal directed connections', async () => {
    const { dependencyCoverage, displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const view = { stages: ['a', 'b', 'c', 'd'].map(id => stage(id)), flows: [{ source: 'a', target: 'b', sourceFiles: ['a'] }, { source: 'b', target: 'a', sourceFiles: ['b'] }, { source: 'a', target: 'c', sourceFiles: ['a'] }, { source: 'b', target: 'c', sourceFiles: ['b'] }, { source: 'c', target: 'd', sourceFiles: ['c'] }] };
    const shown = displayedDependencyFlows(view, 'a', false);
    assert.deepEqual(dependencyCoverage(view, shown), { externalArrows: 1, internalDirections: 2, hiddenExternalArrows: 1 });
    assert.deepEqual(dependencyCoverage(view, displayedDependencyFlows(view, undefined, true)), { externalArrows: 2, internalDirections: 2, hiddenExternalArrows: 0 });
});

test('four separate sources use distinct clear vertical ports on a wide target', async () => {
    const { straightDependencyRoute, dependencyRouteIntersects } = await import('../viewer/dependency-layout.js');
    const target = { x: 40, y: 200, width: 800, height: 80 };
    const sources = [40, 240, 440, 640].map(x => ({ x, y: 40, width: 180, height: 80 }));
    const routes = sources.map(source => straightDependencyRoute(source, target, []));
    assert.equal(new Set(routes.map(route => route[0].x)).size, 4);
    for (const [index, route] of routes.entries()) {
        assert.equal(route.length, 2); assert.equal(route[0].x, route[1].x);
        const halo = { x: route[0].x - 8, y: 140, width: 16, height: 28 };
        for (const [other, foreign] of routes.entries()) if (other !== index) assert.equal(dependencyRouteIntersects(foreign, halo), false);
    }
    assert.equal(straightDependencyRoute(sources[0], target, [{ x: 100, y: 130, width: 80, height: 20 }]), undefined);
});

test('strongest routes survive crossings while independent routes remain visible', async () => {
    const { selectDependencyRoutes } = await import('../viewer/dependency-layout.js');
    const routes = [
        { flow: { source: 'weak', target: 'base', weight: 1 }, points: [{ x: 0, y: 50 }, { x: 100, y: 50 }] },
        { flow: { source: 'strong', target: 'base', weight: 10 }, points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] },
        { flow: { source: 'other', target: 'base', weight: 2 }, points: [{ x: 150, y: 0 }, { x: 150, y: 100 }] },
    ];
    assert.deepEqual(selectDependencyRoutes(routes).map(item => item.flow.source), ['strong', 'other']);
});

test('scope switching keeps only interpretations for that exact structural scope', async () => {
    const { structuralScopeModel } = await import('../viewer/dependency-layout.js');
    const model = { stages: [], flows: [], rootStageIds: [], structuralScope: { productionCount: 2, default: 'production', allRootStageIds: [] }, structuralDependencyGroups: [{ id: 'production', scope: 'production' }, { id: 'all', scope: 'all' }] };
    assert.deepEqual(structuralScopeModel(model).structuralDependencyGroups.map(group => group.id), ['production']);
    assert.deepEqual(structuralScopeModel(model, 'all').structuralDependencyGroups.map(group => group.id), ['all']);
});

test('horizontal member labels fit vertical routes by height, without discarding source names', async () => {
    const { dependencyLabelFitsSegment } = await import('../viewer/dependency-arrows.js');
    assert.equal(dependencyLabelFitsSegment({ width: 140, height: 14 }, { vertical: true, length: 43 }), true);
    assert.equal(dependencyLabelFitsSegment({ width: 140, height: 14 }, { vertical: false, length: 43 }), false);
    assert.equal(dependencyLabelFitsSegment({ width: 140, height: 14 }, { vertical: true, length: 20 }), false);
});

test('overview keeps connected package layers intact and places isolated tools afterward', async () => {
    const { dependencyOverviewLevels } = await import('../viewer/dependency-layout.js');
    const view = { stages: [stage('app'), stage('base'), stage('tool')], flows: [{ source: 'app', target: 'base', count: 1 }] };
    const original = dependencyLevels(view), overview = dependencyOverviewLevels(view);
    const level = (groups, id) => groups.find(group => group.stages.some(s => s.id === id)).level;
    assert.equal(level(overview, 'app'), level(original, 'app'));
    assert.equal(level(overview, 'base'), level(original, 'base'));
    assert(level(overview, 'tool') > level(overview, 'base'));
    assert.deepEqual(dependencyOverviewLevels({ ...view, flows: [] }), dependencyLevels({ ...view, flows: [] }));
});

test('package overview ranks twelve actual directed pairs including mutual references', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const stages = Array.from({ length: 15 }, (_, index) => stage(`manifest:${index}`));
    const flows = Array.from({ length: 14 }, (_, index) => ({ source: stages[index].id, target: stages[14].id, count: index + 1 }));
    flows.push({ source: stages[14].id, target: stages[13].id, count: 20 });
    const view = { stages, flows, displayFlows: [] };
    const visible = displayedDependencyFlows(view, undefined, false);
    assert.equal(visible.length, 12);
    assert.deepEqual(visible.slice(0, 2).map(flow => [flow.source, flow.target, flow.count]), [['manifest:14', 'manifest:13', 20], ['manifest:13', 'manifest:14', 14]]);
    assert.ok(visible.every(flow => flow.reverseCount === undefined));
    assert.equal(displayedDependencyFlows(view, undefined, true).length, 15);
    assert.deepEqual(displayedDependencyFlows(view, 'manifest:0', false).map(flow => flow.source), ['manifest:0']);
});

test('package routing preserves all directed mutual-group edges around cards and captions', async () => {
    const { routePackageDependencies } = await import('../viewer/dependency-package-arrows.js');
    const { dependencyRouteIntersects } = await import('../viewer/dependency-layout.js');
    for (const width of [358, 1120]) {
        const mobile = width < 600;
        const boxes = new Map(Array.from({ length: 6 }, (_, index) => [`p${index}`, { x: mobile ? 64 : 64 + (index % 3) * 336, y: 96 + (mobile ? index * 160 : Math.floor(index / 3) * 256), width: mobile ? 230 : 272, height: 88 }]));
        boxes.set('caption', { x: 64, y: 48, width: 220, height: 24 });
        const pairs = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3], [3, 4], [4, 5], [5, 3], [2, 5], [0, 5], [1, 4]];
        const flows = pairs.map(([source, target], index) => ({ source: `p${source}`, target: `p${target}`, count: 20 - index, weight: 20 - index }));
        const routes = routePackageDependencies(flows, boxes, width, mobile ? 1200 : 650, () => 16);
        assert.equal(routes.length, 12, `${width}px: every requested direction is routed`);
        assert.deepEqual(routes.map(route => route.flow), flows);
        for (const route of routes) {
            assert.ok([...boxes.values()].every(box => !dependencyRouteIntersects(route.points, box)));
            assert.ok(routes.filter(other => other !== route).every(other => !dependencyRouteIntersects(other.points, route.labelBox)), 'labels never obscure another direction');
            assert.ok(route.points.every(point => point.x >= 0 && point.x <= width));
        }
    }
});

test('package direction selection handles all-scope IDs and empty graphs without changing folder pairs', async () => {
    const { displayedDependencyFlows } = await import('../viewer/dependency-layout.js');
    const stages = ['all:manifest:first', 'all:manifest:second'].map(id => stage(id));
    assert.deepEqual(displayedDependencyFlows({ stages, flows: [] }, undefined, false), []);
    const flows = [{ source: stages[0].id, target: stages[1].id, count: 3 }, { source: stages[1].id, target: stages[0].id, count: 2 }];
    assert.deepEqual(displayedDependencyFlows({ stages, flows }, undefined, false).map(flow => flow.count), [3, 2]);
});

test('package routing handles empty and acyclic geometry deterministically', async () => {
    const { routePackageDependencies } = await import('../viewer/dependency-package-arrows.js');
    const boxes = new Map([['a', { x: 64, y: 32, width: 224, height: 64 }], ['b', { x: 64, y: 176, width: 224, height: 64 }]]);
    const flows = [{ source: 'a', target: 'b', count: 3, weight: 3 }];
    const route = () => routePackageDependencies(flows, boxes, 358, 300, () => 16);
    assert.deepEqual(routePackageDependencies([], boxes, 358, 300, () => 16), []);
    assert.equal(route().length, 1);
    assert.deepEqual(route(), route());
});

test('narrow package fan-in keeps ten directed routes and labels', async () => {
    const { routePackageDependencies } = await import('../viewer/dependency-package-arrows.js');
    const { dependencyRouteIntersects } = await import('../viewer/dependency-layout.js');
    const boxes = new Map(Array.from({ length: 11 }, (_, i) => [`p${i}`, { x: i === 10 ? 24 : 24 + (i % 2) * 159, y: i === 10 ? 552 : 24 + Math.floor(i / 2) * 96, width: i === 10 ? 286 : 127, height: 64 }]));
    const flows = [3, 0, 1, 2, 4, 5, 6, 7, 8, 9].map(i => ({ source: `p${i}`, target: 'p10', count: i === 3 ? 4 : 2, projectCount: 1, weight: i === 3 ? 4 : 2 }));
    const routes = routePackageDependencies(flows, boxes, 334, 660, () => 20);
    assert.equal(routes.length, 10);
    for (const route of routes) {
        assert.ok([...boxes.values()].every(box => !dependencyRouteIntersects(route.points, box)));
        assert.ok(routes.filter(other => other !== route).every(other => !dependencyRouteIntersects(other.points, route.labelBox)));
    }
});

test('dependency title segments preserve full labels and break only at semantic separators', async () => {
    const { dependencyTitleSegments } = await import('../viewer/dependency-layout.js');
    assert.deepEqual(dependencyTitleSegments('Vendor.Platform.HostLibrary'), ['Vendor.', 'Platform.', 'HostLibrary']);
    assert.deepEqual(dependencyTitleSegments('@scope/worker-tools:public_api'), ['@scope/', 'worker-tools:public_api']);
    assert.deepEqual(dependencyTitleSegments('folder/Library.Namespace_Name'), ['folder/', 'Library.Namespace_Name']);
    assert.deepEqual(dependencyTitleSegments('worker-tools:public_api'), ['worker-tools:public_api']);
    for (const name of ['', 'SingleVeryLongUnbrokenIdentifier', 'a..b', 'folder/path']) assert.equal(dependencyTitleSegments(name).join(''), name);
});
