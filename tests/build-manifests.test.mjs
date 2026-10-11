import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { discoverBuildPackages } from '../dist/adapters/build-manifests.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const file = path => ({ id: `module:${path}`, kind: 'module', name: path, attributes: {}, sources: [{ ...input(path, ''), line: 1, pointer: '' }] });
const pairs = result => result.edges.filter(e => e.kind === 'depends-on').map(e => [result.nodes.find(n => n.id === e.source).name, result.nodes.find(n => n.id === e.target).name]);

test('Cargo workspace ownership, excluded members, renamed path dependencies and targets are literal', () => {
    const result = discoverBuildPackages([
        input('Cargo.toml', '[workspace]\nmembers = ["units/*"]\nexclude = ["units/skip"]\n[workspace.dependencies]\nengine = { package = "engine-core", path = "units/engine" }'),
        input('units/app/Cargo.toml', '[package]\nname = "tool"\ndescription = "CLI"\n[dependencies]\nengine = { workspace = true }\n[[bin]]\nname = "run"\npath = "src/start.rs"'),
        input('units/engine/Cargo.toml', '[package]\nname = "engine-core"'),
        input('units/skip/Cargo.toml', '[package]\nname = "skip"'),
    ], [file('units/app/src/start.rs'), file('units/engine/src/lib.rs')]);
    assert.deepEqual(result.nodes.map(n => n.name).sort(), ['engine-core', 'tool']);
    assert.deepEqual(pairs(result), [['tool', 'engine-core']]);
    assert.deepEqual(result.nodes.find(n => n.name === 'tool').attributes.entryTargets, ['units/app/src/start.rs']);
    assert.equal(result.edges.filter(e => e.kind === 'contains').length, 2);
});

test('Gradle includes, directory overrides and type-safe accessors produce scoped internal edges', () => {
    const result = discoverBuildPackages([
        input('settings.gradle.kts', 'include(":app", ":base-kit")\nproject(":base-kit").projectDir = file("shared")'),
        input('app/build.gradle.kts', 'dependencies {\n implementation(project(":base-kit"))\n testImplementation(projects.baseKit)\n}'),
        input('shared/build.gradle.kts', 'plugins { id("java-library") }'),
    ], [file('app/src/main/kotlin/App.kt'), file('shared/src/main/java/Base.java')]);
    assert.deepEqual(pairs(result), [[':app', ':base-kit'], [':app', ':base-kit']]);
    assert.equal(result.nodes.find(n => n.name === ':base-kit').attributes.root, 'shared');
    assert.equal(result.nodes.find(n => n.name === ':app').attributes.memberIds.length, 1);
});

test('JavaScript workspaces resolve declared names and keep root description scoped', () => {
    const result = discoverBuildPackages([
        input('package.json', JSON.stringify({ name: 'suite', workspaces: ['units/*'], description: 'Root purpose' })),
        input('units/api/package.json', JSON.stringify({ name: '@org/api', dependencies: { '@org/base': 'workspace:*' }, exports: { '.': './src/index.ts' } })),
        input('units/base/package.json', JSON.stringify({ name: '@org/base', description: 'Shared types' })),
    ], [file('units/api/src/index.ts'), file('units/base/index.ts')]);
    assert.deepEqual(pairs(result), [['@org/api', '@org/base']]);
    assert.equal(result.nodes.find(n => n.name === 'suite').attributes.description, 'Root purpose');
    assert.equal(result.nodes.find(n => n.name === '@org/api').attributes.memberIds.length, 1);
});

test('Go and Python manifests preserve public module identity and entry declarations', () => {
    const result = discoverBuildPackages([
        input('go.mod', 'module example.org/tool\n\nrequire example.org/lib v0.0.0\nreplace example.org/lib => ./lib'),
        input('lib/go.mod', 'module example.org/lib'),
        input('python/pyproject.toml', '[project]\nname = "console-kit"\ndescription = "Command toolkit"\n[project.scripts]\nrunner = "consolekit.cli:main"\n[tool.flit.module]\nname = "consolekit"'),
    ], [file('main.go'), file('lib/lib.go'), file('python/src/consolekit/cli.py')]);
    assert.deepEqual(pairs(result), [['example.org/tool', 'example.org/lib']]);
    assert.deepEqual(result.nodes.find(n => n.name === 'console-kit').attributes.entryTargets, ['consolekit.cli:main']);
});

test('Maven reactors and project references include Unity GUID assemblies and Godot root', () => {
    const result = discoverBuildPackages([
        input('pom.xml', '<project><groupId>org.demo</groupId><artifactId>parent</artifactId><modules><module>web</module><module>core</module></modules></project>'),
        input('web/pom.xml', '<project><artifactId>web</artifactId><dependencies><dependency><groupId>org.demo</groupId><artifactId>core</artifactId></dependency></dependencies></project>'),
        input('core/pom.xml', '<project><groupId>org.demo</groupId><artifactId>core</artifactId></project>'),
        input('dot/App/App.csproj', '<Project><ItemGroup><ProjectReference Include="../Base/Base.csproj" /></ItemGroup></Project>'),
        input('dot/Base/Base.csproj', '<Project/>'),
        input('Assets/View/View.asmdef', '{"name":"View","references":["GUID:abcd"]}'),
        input('Assets/Core/Core.asmdef', '{"name":"Core"}'),
        input('Assets/Core/Core.asmdef.meta', 'fileFormatVersion: 2\nguid: abcd'),
        input('game/project.godot', '[application]\nconfig/name="Game"\nrun/main_scene="res://main.tscn"'),
    ], [file('web/src/main/java/App.java'), file('Assets/View/View.cs'), file('game/main.gd')]);
    assert(pairs(result).some(([a, b]) => a === 'web' && b === 'core'));
    assert(pairs(result).some(([a, b]) => a === 'App' && b === 'Base'));
    assert(pairs(result).some(([a, b]) => a === 'View' && b === 'Core'));
    assert.deepEqual(result.nodes.find(n => n.name === 'Game').attributes.entryTargets, ['game/main.tscn']);
});

test('dynamic or invalid declarations diagnose instead of inventing dependencies', () => {
    const result = discoverBuildPackages([input('settings.gradle', 'include(moduleName)'), input('package.json', '{ broken')], []);
    assert(result.diagnostics.some(d => d.code === 'dynamic-manifest'));
    assert(result.diagnostics.some(d => d.code === 'invalid-manifest'));
});

test('manifest package imports target one package and honor a Cargo dependency rename', async () => {
    const { resolveBuildPackageImports } = await import('../dist/adapters/build-manifests.js');
    const manifests = [input('Cargo.toml', '[workspace]\nmembers=["app","base"]'), input('app/Cargo.toml', '[package]\nname="app"\n[dependencies]\nshared={package="base-core",path="../base"}'), input('base/Cargo.toml', '[package]\nname="base-core"')];
    const node = file('app/src/main.rs'); const packages = discoverBuildPackages(manifests, [node, file('base/src/lib.rs'), file('base/src/other.rs')]);
    const edges = resolveBuildPackageImports(packages.nodes, [{ node, language: 'rust', imports: [{ specifier: 'shared::Thing', source: node.sources[0] }] }]);
    assert.equal(edges.length, 1); assert.equal(edges[0].target, 'build-package:base/Cargo.toml');
});

test('Gradle includeBuild and repository group filters are not malformed project includes', () => {
    const result = discoverBuildPackages([input('settings.gradle.kts', 'includeBuild("conventions")\nincludeGroupByRegex("com\\.vendor.*")\ninclude(":app")'), input('app/build.gradle.kts', '')], []);
    assert.equal(result.diagnostics.length, 0);
});

test('conditional Gradle projects and dependencies are diagnosed rather than unconditional edges', () => {
    const result = discoverBuildPackages([
        input('settings.gradle.kts', 'include(":app", ":base")\nif (flag) { include(":optional") }'),
        input('app/build.gradle.kts', 'dependencies {\n if (flag) {\n implementation(project(":base"))\n }\n}'),
        input('base/build.gradle.kts', ''), input('optional/build.gradle.kts', ''),
    ], []);
    assert.equal(result.nodes.some(node => node.name === ':optional'), false);
    assert.equal(pairs(result).length, 0);
    assert(result.diagnostics.some(d => d.code === 'dynamic-manifest'));
});

test('Go require resolves sibling module names without needing a replace directive', () => {
    const result = discoverBuildPackages([input('tool/go.mod', 'module example.org/tool\nrequire (\n example.org/base v1.0.0\n)'), input('base/go.mod', 'module example.org/base')], []);
    assert.deepEqual(pairs(result), [['example.org/tool', 'example.org/base']]);
});

test('Maven dependency management does not invent a declared dependency', () => {
    const result = discoverBuildPackages([input('pom.xml', '<project><artifactId>tool</artifactId><dependencyManagement><dependencies><dependency><groupId>org.x</groupId><artifactId>base</artifactId></dependency></dependencies></dependencyManagement></project>'), input('base/pom.xml', '<project><groupId>org.x</groupId><artifactId>base</artifactId></project>')], []);
    assert.equal(pairs(result).length, 0);
});

test('MSBuild literal properties follow nearest props and explicit parent imports with evidence', () => {
    const result = discoverBuildPackages([
        input('Directory.Build.props', '<Project><PropertyGroup><Shared>$(MSBuildThisFileDirectory)shared/</Shared></PropertyGroup></Project>'),
        input('apps/Directory.Build.props', '<Project><Import Project="../Directory.Build.props"/><PropertyGroup><TargetFile>Base.csproj</TargetFile></PropertyGroup></Project>'),
        input('apps/Tool/Tool.csproj', '<Project><PropertyGroup><TargetFile>Core.csproj</TargetFile></PropertyGroup><ItemGroup><ProjectReference Include="$(Shared)$(TargetFile)" /></ItemGroup></Project>'),
        input('shared/Core.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['Tool', 'Core']]);
    const edge = result.edges.find(e => e.kind === 'depends-on');
    assert(edge.sources.some(source => source.path === 'Directory.Build.props'));
    assert(edge.sources.some(source => source.path === 'apps/Tool/Tool.csproj' && source.pointer.includes('TargetFile')));
});

test('unknown, cyclic and conditional MSBuild properties remain diagnostics; reference condition is retained', () => {
    const result = discoverBuildPackages([
        input('Directory.Build.props', '<Project><PropertyGroup><A>$(B)</A><B>$(A)</B><Known>../Base/Base.csproj</Known><Known Condition="flag">elsewhere.csproj</Known></PropertyGroup></Project>'),
        input('App/App.csproj', '<Project><ItemGroup Condition="Debug"><ProjectReference Include="../Base/Base.csproj"/><ProjectReference Include="$(A)"/><ProjectReference Include="$(Unknown)"/><ProjectReference Include="$(Known)"/></ItemGroup></Project>'),
        input('Base/Base.csproj', '<Project/>'),
    ], []);
    assert.equal(pairs(result).length, 1);
    assert.equal(result.edges.find(e => e.kind === 'depends-on').attributes.condition, 'Debug');
    assert(result.diagnostics.filter(d => d.code === 'dynamic-manifest').length >= 3);
});

test('MSBuild pure path intrinsics combine literal segments without executing arbitrary functions', () => {
    const result = discoverBuildPackages([
        input('Directory.Build.props', `<Project><PropertyGroup><Base>$([MSBuild]::NormalizeDirectory('$(MSBuildThisFileDirectory)', 'shared', '..', 'shared'))</Base><File>$([MSBuild]::NormalizePath('$(Base)', 'Base.csproj'))</File><Unsafe>$([System.IO.File]::ReadAllText('secret'))</Unsafe></PropertyGroup></Project>`),
        input('app/App.csproj', '<Project><ItemGroup><ProjectReference Include="$(File)"/><ProjectReference Include="$(Unsafe)"/></ItemGroup></Project>'),
        input('shared/Base.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
    assert(result.diagnostics.some(d => d.message.includes('Unsafe')));
});

test('MSBuild item expansion sees literal properties in nearest Directory.Build.targets', () => {
    const result = discoverBuildPackages([
        input('Directory.Build.targets', '<Project><PropertyGroup><Shared>$(MSBuildThisFileDirectory)base/Base.csproj</Shared></PropertyGroup></Project>'),
        input('app/App.csproj', '<Project><ItemGroup><ProjectReference Include="$(Shared)"/></ItemGroup></Project>'),
        input('base/Base.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
});

test('MSBuild task-time references are not claimed as static project dependencies', () => {
    const result = discoverBuildPackages([input('App/App.csproj', '<Project><Target Name="BuildOther"><ItemGroup><ProjectReference Include="../Base/Base.csproj"/></ItemGroup></Target></Project>'), input('Base/Base.csproj', '<Project/>')], []);
    assert.equal(pairs(result).length, 0);
    assert(result.diagnostics.some(d => d.code === 'dynamic-manifest'));
});

test('MSBuild project references can target another literal project format without claiming language support', () => {
    const result = discoverBuildPackages([input('App/App.csproj', '<Project><ItemGroup><ProjectReference Include="../Base/Base.fsproj"/></ItemGroup></Project>'), input('Base/Base.fsproj', '<Project/>')], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
});

test('Arcade SDK defaults RepoRoot from nearest versioned global manifest with evidence', () => {
    const result = discoverBuildPackages([
        input('global.json', '{"msbuild-sdks":{"Microsoft.DotNet.Arcade.Sdk":"1.2.3"}}'),
        input('nested/global.json', '{"msbuild-sdks":{"Microsoft.DotNet.Arcade.Sdk":"2.0.0"}}'),
        input('nested/Directory.Build.props', '<Project><Import Project="Sdk.props" Sdk="Microsoft.DotNet.Arcade.Sdk"/></Project>'),
        input('nested/App/App.csproj', '<Project><ItemGroup><ProjectReference Include="$(RepoRoot)Base/Base.csproj"/></ItemGroup></Project>'),
        input('nested/Base/Base.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
    assert(result.edges.find(e => e.kind === 'depends-on').sources.some(s => s.path === 'nested/global.json'));
});

test('unrelated SDK never supplies RepoRoot and Arcade preserves an explicit value', () => {
    const unrelated = discoverBuildPackages([input('global.json', '{"msbuild-sdks":{"Other.Sdk":"1.0"}}'), input('App/App.csproj', '<Project Sdk="Other.Sdk"><ItemGroup><ProjectReference Include="$(RepoRoot)Base/Base.csproj"/></ItemGroup></Project>'), input('Base/Base.csproj', '<Project/>')], []);
    assert.equal(pairs(unrelated).length, 0);
    const explicit = discoverBuildPackages([input('global.json', '{"msbuild-sdks":{"Microsoft.DotNet.Arcade.Sdk":"1.0"}}'), input('Directory.Build.props', '<Project><PropertyGroup><RepoRoot>../custom/</RepoRoot></PropertyGroup><Import Project="Sdk.props" Sdk="Microsoft.DotNet.Arcade.Sdk"/></Project>'), input('App/App.csproj', '<Project><ItemGroup><ProjectReference Include="$(RepoRoot)Base.csproj"/></ItemGroup></Project>'), input('custom/Base.csproj', '<Project/>')], []);
    assert.deepEqual(pairs(explicit), [['App', 'Base']]);
});

test('known SDK property equality selects conditional imports without evaluating arbitrary conditions', () => {
    const result = discoverBuildPackages([
        input('global.json', '{"msbuild-sdks":{"Microsoft.DotNet.Arcade.Sdk":"1.0"}}'),
        input('Directory.Build.props', `<Project><Import Project="sdk.props" Condition="'$(UsingMicrosoftNETSdk)' == 'true'"/><Import Project="unknown.props" Condition="Exists('anything')"/></Project>`),
        input('sdk.props', '<Project><Import Project="Sdk.props" Sdk="Microsoft.DotNet.Arcade.Sdk"/></Project>'),
        input('unknown.props', '<Project><PropertyGroup><RepoRoot>../wrong/</RepoRoot></PropertyGroup></Project>'),
        input('App/App.csproj', '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><ProjectReference Include="$(RepoRoot)Base/Base.csproj"/></ItemGroup></Project>'), input('Base/Base.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
});

test('MSBuild ancestor file lookup resolves only supplied literal imports', () => {
    const result = discoverBuildPackages([
        input('Directory.Build.props', '<Project><PropertyGroup><Base>$(MSBuildThisFileDirectory)base/Base.csproj</Base></PropertyGroup></Project>'),
        input('nested/Directory.Build.props', `<Project><Import Project="$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', $(MSBuildThisFileDirectory)..))"/></Project>`),
        input('nested/App/App.csproj', '<Project><ItemGroup><ProjectReference Include="$(Base)"/></ItemGroup></Project>'), input('base/Base.csproj', '<Project/>'),
    ], []);
    assert.deepEqual(pairs(result), [['App', 'Base']]);
});
