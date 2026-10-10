import test from 'node:test';
import assert from 'node:assert/strict';
import { overviewInterpretationTargets, interpretationStatus } from '../dist/interpretation/model.js';
import { projectedDependencyRelations } from '../dist/query/structural-dependency-groups.js';
import { buildLoopMap } from '../dist/query/loop-map-model.js';
const node = (id, path) => ({ id, name: path, kind: 'module', attributes: {}, contentHash: 'a'.repeat(64), sources: [{ path, pointer: '', line: 1, contentHash: 'a'.repeat(64) }] });
const edge = (source, target) => ({ id: `${source}:${target}`, source, target, kind: 'imports', directed: true, field: '', sources: [] });
const graph = (nodes, edges) => ({ nodes, edges, inputs: nodes.flatMap(node => node.sources.map(({ path, contentHash }) => ({ path, contentHash }))) });
const fixture = () => graph([node('a', 'src/a/index.ts'), node('b', 'src/b/index.ts'), node('extra', 'src/c/index.ts')], [edge('a', 'b'), edge('b', 'a')]);
const group = model => overviewInterpretationTargets(model, 'production').find(target => target.group);
const note = target => ({ schemaVersion: 1, targetId: target.id, author: 'test-agent', summary: '두 폴더가 함께 문서를 변환합니다.', sources: target.sources.map(({ path, contentHash, line }) => ({ path, contentHash, line })) });

test('projected dependency group targets bind only member folders and have stable distinct identities', () => {
    // Given two mutually referencing folders and an unrelated folder.
    const model = fixture();
    // When overview targets are prepared for the external agent.
    const target = group(model);
    // Then the first target is a separate cluster with the exact member source union.
    assert.ok(target);
    assert.equal(overviewInterpretationTargets(model, 'production')[0].id, target.id);
    assert.deepEqual(target.sources.map(source => source.path), ['src/a/index.ts', 'src/b/index.ts']);
    assert.equal(target.kind, 'cluster');
    assert.equal(target.group.relation, 'folder-imports');
    assert.equal(group(graph([...model.nodes].reverse(), [...model.edges].reverse())).id, target.id);
    const changed = graph(model.nodes, [...model.edges, edge('b', 'extra'), edge('extra', 'a')]);
    assert.notEqual(group(changed).id, target.id);
    assert.equal(interpretationStatus(note(target), changed), 'stale');
});

test('group notes remain distinct from root and member notes and expose stale status', () => {
    // Given a group note with exact source evidence and an unrelated folder note.
    const model = fixture(), target = group(model);
    assert.ok(target);
    const saved = note(target), root = { ...saved, targetId: 'overview:production:folder:src/a', summary: '멤버 설명' };
    // When the same generic loop model receives source-validated interpretations.
    const map = buildLoopMap(model.nodes, model.edges, [], { kinds: [], interpretations: [{ ...saved, status: 'fresh' }, { ...root, status: 'fresh' }] }, 'fixture');
    const shown = map.structuralDependencyGroups.find(item => item.id === target.id);
    // Then only the dedicated group note becomes its explanation; changes are stale.
    assert.equal(shown.interpretation.summary, saved.summary);
    const staleMap = buildLoopMap(model.nodes, model.edges, [], { kinds: [], interpretations: [{ ...saved, status: 'stale' }] }, 'fixture');
    assert.equal(staleMap.structuralDependencyGroups.find(item => item.id === target.id).interpretation.stale, true);
    const without = buildLoopMap(model.nodes, model.edges, [], { kinds: [], interpretations: [{ ...root, status: 'fresh' }] }, 'fixture');
    assert.equal(without.structuralDependencyGroups.find(item => item.id === target.id).interpretation, undefined);
    assert.equal(interpretationStatus(saved, { ...model, inputs: model.inputs.map((input, index) => index ? input : { ...input, contentHash: 'b'.repeat(64) }) }), 'stale');
});

test('projected namespace groups bind complete folded folder descendants without claiming file cycles', () => {
    // Given a namespace dependency onto a wide physical subtree and one return import.
    const members = Array.from({ length: 10 }, (_, index) => node(`a${index}`, `src/a/part${index}/type.cs`));
    const b = node('b', 'src/b/index.cs');
    const namespace = { ...node('pkg', 'src/a/part0/type.cs'), kind: 'package', attributes: { memberIds: members.map(node => node.id), directories: members.map(node => node.sources[0].path.slice(0, -8)) } };
    const model = graph([...members, b, node('entry', 'src/index.cs'), namespace], [edge('a0', 'b'), { ...edge('b', 'pkg'), attributes: { importScope: 'project' } }]);
    // When the first-screen projected group is offered as an interpretation target.
    const target = group(model);
    // Then it includes every descendant source and honestly identifies the folded relationship.
    assert.ok(target);
    assert.equal(target.group.relation, 'projected-folder-imports');
    assert.equal(target.sources.length, 11);
    assert.ok(target.group.stageIds.includes('directory:src/a'));
    assert.ok(target.sources.some(source => source.path === 'src/a/part9/type.cs'));
    const all = overviewInterpretationTargets(model, 'all').find(target => target.group);
    assert.notEqual(all.id, target.id);
});


test('shared projection retains off-page explanation edges without adding diagram cycles', () => {
    // Given a dependency to a real folder on another page.
    const stages = [{ id: 'folder:a' }, { id: 'folder:b' }];
    const flows = [{ source: 'folder:a', target: 'folder:b', sourceFiles: ['a/index.ts'], count: 1 }];
    // When only the first folder is displayed.
    const projected = projectedDependencyRelations(stages, flows, ['folder:a']);
    // Then evidence keeps the target while the visible diagram has no such edge.
    assert.deepEqual(projected.flows, []);
    assert.equal(projected.relatedFlows[0].target, 'folder:b');
    assert.deepEqual(projected.relatedFlows[0].sourceFiles, ['a/index.ts']);
});
