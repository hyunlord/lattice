import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstImpression } from '../dist/query/first-impression-model.js';
import { firstImpression } from '../viewer/first-impression-data.js';
const hash = 'a'.repeat(64);
const source = path => ({ path, line: 1, pointer: '', contentHash: hash });
const module = path => ({ id: path, kind: 'module', name: path, attributes: {}, sources: [source(path)], contentHash: hash });
const graph = nodes => ({ hash, repository: { name: 'fixture', dirty: false, sourceFingerprint: hash }, nodes, edges: [] });
const project = nodes => buildFirstImpression(graph(nodes), () => { });
test('marks source-proven CI, lint, license and release components without changing membership', () => {
    // Given distinct maintenance files, including a declared lint module.
    const paths = ['ci/check.sh', 'kokoro/nightly.sh', 'spotless/copyright.kt', 'build_platform_release.sh', 'lint/src/main/kotlin/checks/Rule.kt', 'go.mod'];
    const nodes = paths.map(module);
    const pkg = { ...module('lint/build.gradle.kts'), id: 'lint-package', kind: 'package', attributes: { buildSystem: 'gradle', manifestPath: 'lint/build.gradle.kts', root: 'lint', memberIds: [paths[4]] } };
    // When the bounded projection is built.
    const model = project([...nodes, pkg]);
    // Then each full component is tagged without removing files or identities.
    assert.equal(model.fileCount, paths.length);
    assert.equal(model.components.length, paths.length);
    assert.ok(model.components.every(component => component.category === 'auxiliary'));
    assert.deepEqual(model.components.flatMap(component => component.memberPreview.map(member => member.path)).sort(), [...paths].sort());
});
test('keeps a mixed group when its product member occurs after the three preview members', () => {
    // Given a real package with three maintenance files followed by product code.
    const paths = ['pkg/ci/a.sh', 'pkg/ci/b.sh', 'pkg/ci/c.sh', 'pkg/src/main/core.ts'];
    const pkg = { ...module('pkg/package.json'), id: 'package', kind: 'package', attributes: { buildSystem: 'npm', manifestPath: 'pkg/package.json', root: 'pkg', memberIds: paths } };
    // When all package members form one real component.
    const model = project([...paths.map(module), pkg]);
    // Then preview-only classification cannot hide the product code.
    assert.equal(model.components.length, 1);
    assert.equal(model.components[0].fileCount, 4);
    assert.equal(model.components[0].category, undefined);
});
test('does not classify runtime release, license or lint names as maintenance scripts', () => {
    const model = project(['src/release.ts', 'src/license.ts', 'src/lint.ts', 'core/src/main/Build.kt'].map(module));
    assert.ok(model.components.every(component => component.category === undefined));
});
test('viewer accepts old exports and auxiliary metadata but rejects unknown categories', () => {
    const model = project([module('src/main.ts')]);
    assert.equal(firstImpression(model, hash), true);
    const component = model.components[0];
    assert.equal(firstImpression({ ...model, components: [{ ...component, category: 'auxiliary' }] }, hash), true);
    assert.equal(firstImpression({ ...model, components: [{ ...component, category: 'guessed' }] }, hash), false);
});
test('folds Homebrew distribution recipes while preserving runtime Ruby and shell integration', () => {
    // Given packaging conventions and similarly named runtime files.
    const packaging = ['pkg/brew/client-bin.rb', 'Formula/client.rb', 'packaging/homebrew/client.rb'];
    const product = ['src/formula/client.rb', 'lib/brew.rb', 'shell/common.sh'];
    // When components are classified from their complete source paths.
    const model = project([...packaging, ...product].map(module));
    // Then only explicit distribution locations leave the product diagram.
    assert.deepEqual(model.components.filter(component => component.category === 'auxiliary').flatMap(component => component.memberPreview.map(member => member.path)).sort(), packaging.sort());
});
test('source-root boundaries protect runtime subdirectories without hiding dedicated tooling modules', () => {
    // Given both root and nested product source roots plus an explicit lint module.
    const product = ['src/lint/rules.ts', 'source/ci/client.ts', 'lib/ci/client.ts', 'packages/core/src/lint/rules.ts', 'packages/core/source/ci/client.ts', 'packages/core/lib/lint/rules.ts'];
    const tooling = 'lint/src/main/kotlin/Rules.kt';
    // When directory semantics are classified before the first source-root boundary.
    const model = project([...product, tooling].map(module));
    // Then runtime names do not turn their components into maintenance code.
    assert.deepEqual(model.components.filter(component => component.category === 'auxiliary').flatMap(component => component.memberPreview.map(member => member.path)), [tooling]);
});
