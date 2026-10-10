import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import * as lattice from '../dist/index.js';
import { structuralSummary, missingStructuralRole } from '../dist/query/structural-map-model.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('literal package metadata supplies a sourced repository introduction ahead of README', () => {
    const readme = lattice.extractMarkdown(input('README.md', '# Project\n\nWelcome to this repository.\n')).nodes;
    for (const [path, text, line] of [
        ['package.json', '{\n "description": "**HTTP client** for applications. More detail."\n}', 2],
        ['pyproject.toml', '[project]\nname = "project"\ndescription = "HTTP client for applications. More detail."\n[tool.other]\ndescription = "Wrong scope"', 3],
        ['Cargo.toml', '[package]\ndescription = "HTTP client for applications. More detail."', 2],
        ['src/App.csproj', '<Project><PropertyGroup>\n<Description>HTTP client for applications. More detail.</Description>\n</PropertyGroup></Project>', 2],
        ['pom.xml', '<project>\n<description>HTTP client for applications. More detail.</description>\n</project>', 2],
        ['project.gemspec', 'Gem::Specification.new do |s|\n s.summary = "HTTP client for applications. More detail."\nend', 2],
    ]) {
        assert.equal(typeof lattice.extractPackageDescription, 'function');
        const node = lattice.extractPackageDescription(input(path, text));
        assert.equal(node.attributes.sourceDescription.text, 'HTTP client for applications.');
        assert.equal(node.sources[0].line, line);
        assert.equal(node.sources[0].contentHash, input(path, text).contentHash);
        assert.equal(structuralSummary([], [...readme, node], '.'), 'HTTP client for applications.');
        assert.equal(structuralSummary([], [node], 'src'), missingStructuralRole);
    }
});

test('metadata ignores dynamic values and nested scopes and preserves README fallback', () => {
    for (const [path, text] of [
        ['pyproject.toml', '[tool.lint]\ndescription = "Not the project"'],
        ['Cargo.toml', '[dependencies.other]\ndescription = "Not the package"'],
        ['x.gemspec', 's.summary = ENV["SUMMARY"]'],
        ['x.gemspec', 's.summary = "#{ENV["SUMMARY"]}"'],
        ['pom.xml', '<project><dependencies><dependency><description>Wrong package</description></dependency></dependencies></project>'],
        ['App.csproj', '<Project><PropertyGroup><Description>$(PackageDescription)</Description></PropertyGroup></Project>'],
    ]) assert.equal(lattice.extractPackageDescription(input(path, text)), undefined);
    const readme = lattice.extractMarkdown(input('README.md', '# Project\n\nA local file search tool.\n')).nodes;
    assert.equal(structuralSummary([], readme, '.'), 'A local file search tool.');
});

test('metadata changes participate in no-lens input hashes and fresh cached introductions', async () => {
    const { mkdtempSync, writeFileSync, rmSync, realpathSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { buildRepository } = await import('../bin/build.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-package-intro-')));
    try {
        execFileSync('git', ['init', '-q', root]);
        writeFileSync(join(root, 'api.py'), 'def get():\n    """Fetch a response."""\n    pass\n');
        writeFileSync(join(root, 'pyproject.toml'), '[project]\ndescription = "A response library."\n');
        writeFileSync(join(root, 'README.md'), '# API\n\nSee our documentation website.\n');
        const options = { root, noLens: true, cacheDir: join(root, '.lattice/cache') };
        const first = buildRepository(options);
        assert.equal(structuralSummary([], first.graph.nodes, '.'), 'A response library.');
        assert(first.extraction.manifest.some(entry => entry.path === 'pyproject.toml'));
        writeFileSync(join(root, 'pyproject.toml'), '[project]\ndescription = "A connection library."\n');
        const second = buildRepository(options);
        assert.equal(structuralSummary([], second.graph.nodes, '.'), 'A connection library.');
        assert.notEqual(first.graph.inputs.find(entry => entry.path === 'pyproject.toml').contentHash, second.graph.inputs.find(entry => entry.path === 'pyproject.toml').contentHash);
        assert.notEqual(first.fingerprint, second.fingerprint);
        assert(second.extraction.stats.reused > 0);
    } finally { rmSync(root, { recursive: true, force: true }); }
});

test('conditional project metadata is not an unconditional repository introduction', () => {
    const node = lattice.extractPackageDescription(input('App.csproj', '<Project><PropertyGroup Condition="debug"><Description>Debug only.</Description></PropertyGroup><PropertyGroup><PackageDescription>A public library.</PackageDescription></PropertyGroup></Project>'));
    assert.equal(node.attributes.sourceDescription.text, 'A public library.');
});
