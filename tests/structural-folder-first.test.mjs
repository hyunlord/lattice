import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuralMap, buildStructuralOverview, structuralSummary } from '../dist/query/structural-map-model.js';
const node = (id, path, attributes = {}, kind = 'module') => ({ id, kind, name: path, attributes, contentHash: 'h', sources: [{ path, line: 1, pointer: '', contentHash: 'h' }] });
const edge = (source, target) => ({ id: `${source}:${target}`, source, target, kind: 'imports', directed: true, field: '', sources: [] });
test('folder frontier contains complete physical subtrees, never selected siblings under a borrowed name', () => {
    const nodes = ['core', 'router', 'middleware', 'helper', 'adapter', 'jsx'].flatMap(name => Array.from({ length: 5 }, (_, i) => node(`${name}${i}`, `src/${name}/part${i}/index.ts`)));
    nodes.push(node('api', 'src/index.ts'));
    const model = buildStructuralMap(nodes, []);
    assert.equal(model.structuralSourceRoot, 'src');
    assert.equal(model.rootStageIds.length, 7);
    const roots = model.stages.filter(stage => model.rootStageIds.includes(stage.id));
    assert.deepEqual(new Set(roots.map(stage => stage.directoryPath)), new Set(['src', ...['core', 'router', 'middleware', 'helper', 'adapter', 'jsx'].map(name => `src/${name}`)]));
    assert.equal(roots.flatMap(stage => stage.descendantNodeIds).length, nodes.length);
    for (const stage of roots.filter(stage => stage.childIds?.length)) assert.deepEqual(new Set(stage.descendantNodeIds), new Set(nodes.filter(n => n.sources[0].path.startsWith(stage.directoryPath + '/')).map(n => n.id)));
    assert(model.structuralEntryStageIds.includes('folder:src'));
});
test('flat wide folders expose real siblings across explicit pages without a synthetic remainder', () => {
    const nodes = Array.from({ length: 13 }, (_, i) => node(`m${i}`, `src/part${i}/index.ts`));
    const model = buildStructuralMap(nodes, []);
    assert.equal(model.rootStageIds.length, 13);
    assert(model.rootStageIds.every(id => id.startsWith('folder:src/part')));
    assert.equal(model.stages.filter(stage => model.rootStageIds.includes(stage.id)).flatMap(stage => stage.descendantNodeIds).length, 13);
});
test('folder roles never use a type, public name, or repository intro as a substitute', () => {
    const n = node('n', 'src/part/a.ts', { publicNames: [{ name: 'Helper' }], sourceDescription: { kind: 'declaration-doc', text: 'Helper does a thing.' } });
    const readme = node('r', 'README.md', { sourceDescription: { kind: 'readme', text: 'Repository introduction.' } }, 'document');
    assert.equal(structuralSummary([n], [readme], 'src/part'), '역할 설명 없음 — 요약 실행 필요');
    assert.equal(structuralSummary([], [readme], '.'), 'Repository introduction.');
});
test('namespace imports target one physical common ancestor with no duplicate namespace cards', () => {
    const nodes = [node('caller', 'app/Caller.cs'), node('a', 'lib/a/A.cs'), node('b', 'lib/b/B.cs'), node('pkg', 'lib/a/A.cs', { category: 'namespace', directories: ['lib/a', 'lib/b'], memberIds: ['a', 'b'], packageName: 'Shared' }, 'package')];
    const model = buildStructuralMap(nodes, [edge('caller', 'pkg')]);
    assert(model.stages.every(stage => !stage.title.includes('네임스페이스') && !stage.id.includes('패키지')));
    assert.deepEqual(model.flows.map(flow => [flow.target, flow.count, flow.sourceFiles]), [['directory:lib', 1, ['app/Caller.cs']]]);
    assert(model.stages.every(stage => !stage.descendantNodeIds.includes('pkg')));
});

test('dominant language source root stays consistent with small compatibility trees outside it', () => {
    const nodes = [node('api', 'src/main/java/org/example/package-info.java'), ...Array.from({ length: 12 }, (_, i) => node(`n${i}`, `src/main/java/org/example/parser/P${i}.java`)), node('compat', 'src/main/java11/org/example/Compat.java')];
    const model = buildStructuralMap(nodes, []);
    assert.equal(model.structuralSourceRoot, 'src/main/java/org/example');
    assert.equal(model.stages.find(s => s.id === 'folder:src/main/java/org/example/parser').title, 'parser');
    assert.equal(model.stages.find(s => s.id === 'folder:src/main/java11/org/example').title, '저장소: src/main/java11/org/example');
    assert.deepEqual(model.structuralEntryStageIds, ['folder:src/main/java/org/example']);
});

test('dominant source scope exposes its real children while all scope retains outside product files', () => {
    const names = ['core', 'router', 'middleware', 'helper', 'adapter', 'jsx'];
    const nodes = names.flatMap(name => Array.from({ length: 5 }, (_, i) => node(`${name}${i}`, `src/${name}/part${i}/index.ts`)));
    nodes.push(node('api', 'src/index.ts'), ...['build', 'tools', 'adapters'].map(name => node(name, `${name}/index.ts`)));
    const model = buildStructuralOverview(nodes, []);
    assert.equal(model.rootStageIds.length, 7);
    assert.equal(model.structuralScope.outsideRootCount, 3);
    assert.equal(model.structuralScope.selectedCount, 31);
    const allRoots = model.stages.filter(stage => model.structuralScope.allRootStageIds.includes(stage.id));
    assert.deepEqual(new Set(allRoots.flatMap(stage => stage.descendantNodeIds)), new Set(nodes.map(n => n.id)));
    assert(model.structuralScope.excludedDescription.includes('소스 루트 밖 제품 파일 3개'));
});

test('eleven physical children page without mixing their folder boundaries', () => {
    const names = ['adapter', 'client', 'helper', 'jsx', 'middleware', 'preset', 'request', 'router', 'utils', 'validator'];
    const nodes = [node('api', 'src/index.ts'), ...names.flatMap(name => [node(name, `src/${name}/index.ts`), node(name + 'child', `src/${name}/child/value.ts`)])];
    const model = buildStructuralMap(nodes, []);
    const roots = model.rootStageIds.map(id => model.stages.find(stage => stage.id === id));
    assert.equal(roots.length, 11);
    assert.deepEqual(roots.slice(0, 9).map(stage => stage.title), ['루트', ...names.slice(0, 8)]);
    assert.equal(roots.flatMap(stage => stage.descendantNodeIds).length, nodes.length);
    assert.equal(new Set(roots.flatMap(stage => stage.descendantNodeIds)).size, nodes.length);
});

test('a graph without physical files does not manufacture an empty folder card', () => {
    const model = buildStructuralMap([node('package', 'missing.cs', { directories: ['missing'] }, 'package')], []);
    assert.deepEqual(model.rootStageIds, []);
    assert.deepEqual(model.stages, []);
});

test('arbitrary module prose never describes its containing folder', () => {
    const nodes = [node('utility', 'src/utils/body.ts', { sourceDescription: { kind: 'module-doc', text: 'Body utility.' } }), node('preset', 'src/preset/fast.ts', { sourceDescription: { kind: 'module-doc', text: 'The preset that uses FastRouter.' } })];
    const model = buildStructuralMap(nodes, []);
    for (const stage of model.stages) {
        assert.equal(stage.summary, '역할 설명 없음 — 요약 실행 필요');
        assert.deepEqual(stage.summaryEvidence, []);
    }
});
test('root introduction remains header-only while dedicated package documentation retains its scope', () => {
    const readme = node('readme', 'README.md', { sourceDescription: { kind: 'readme', text: 'Acme is a compact framework.' } }, 'document');
    const copy = node('copy', 'src/README.md', readme.attributes, 'document');
    const entry = node('entry', 'src/index.ts', { sourceDescription: { kind: 'module-doc', text: 'Acme - A compact framework.' } });
    const child = node('child', 'src/utils/index.ts', { sourceDescription: { kind: 'module-doc', text: 'Shared utility exports.' } });
    const model = buildStructuralMap([readme, copy, entry, child], []);
    assert.equal(model.stages.find(s => s.id === 'folder:src').summary, '역할 설명 없음 — 요약 실행 필요');
    assert.equal(model.stages.find(s => s.id === 'folder:src/utils').summary, 'Shared utility exports.');
    const java = buildStructuralMap([node('api', 'src/package-info.java', { sourceDescription: { kind: 'module-doc', text: 'The public API for loading and parsing documents.' } })], []);
    assert.equal(java.stages.find(s => s.id === 'folder:src').summary, 'The public API for loading and parsing documents.');
    assert.equal(structuralSummary([], [readme], '.'), 'Acme is a compact framework.');
});
