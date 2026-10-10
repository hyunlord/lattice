import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text) => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('package imports identify one package with explicit membership instead of unrelated file dependencies', () => {
    // Given two importing files and two package members.
    const modules = [module('go.mod', 'module example.org/app'), module('a.go', 'package app\nimport "example.org/app/util"'), module('b.go', 'package app\nimport "example.org/app/util"'), module('util/a.go', 'package util\nfunc A() {}'), module('util/b.go', 'package util\nfunc B() {}')];
    // When package references are resolved.
    const result = resolveModuleLinks(modules);
    // Then two importer edges share one package target and membership is separate.
    assert.equal(result.edges.length, 2);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0].kind, 'package');
    assert.deepEqual(result.nodes[0].attributes.directories, ['util']);
    assert.deepEqual(result.nodes[0].attributes.memberIds, ['module:util/a.go', 'module:util/b.go']);
    assert.equal(result.edges.every(edge => edge.target === result.nodes[0].id), true);
    assert.deepEqual(result.membershipEdges.map(edge => edge.target), ['module:util/a.go', 'module:util/b.go']);
});

test('namespace spanning directories stays one logical package and explicit type references remain precise', () => {
    // Given a namespace split across two folders.
    const modules = [module('App.cs', 'using Domain; using Alias = Domain.Hero;'), module('one/Hero.cs', 'namespace Domain; class Hero {}'), module('two/Tool.cs', 'namespace Domain; class Tool {}')];
    // When namespace and type imports are resolved.
    const result = resolveModuleLinks(modules);
    // Then namespace membership never becomes two claimed file usages.
    assert.equal(result.nodes.length, 1);
    assert.deepEqual(result.nodes[0].attributes.directories, ['one', 'two']);
    assert.deepEqual(result.edges.map(edge => edge.target), [result.nodes[0].id, 'module:one/Hero.cs']);
});

test('CLI build retains valid package endpoints and declaration evidence without document location collisions', async () => {
    const { mkdtempSync, realpathSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { execFileSync } = await import('node:child_process');
    const { buildRepository } = await import('../bin/build.mjs');
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-package-build-')));
    try {
        // Given a real tracked repository with a package import.
        execFileSync('git', ['init', '-q', root]);
        mkdirSync(join(root, 'util'));
        writeFileSync(join(root, 'go.mod'), 'module example.org/app');
        writeFileSync(join(root, 'main.go'), 'package main\nimport "example.org/app/util"');
        writeFileSync(join(root, 'util/a.go'), 'package util\nfunc A() {}');
        execFileSync('git', ['-C', root, 'add', '.']);
        // When the same builder used by CLI assembles all adapters.
        const { graph } = buildRepository({ root });
        // Then import and membership endpoints exist and evidence keeps its real source file.
        const ids = new Set(graph.nodes.map(node => node.id));
        assert.equal(graph.edges.every(edge => ids.has(edge.source) && ids.has(edge.target)), true);
        const imported = graph.edges.find(edge => edge.kind === 'imports');
        assert.equal(imported.target, 'package:go:util');
        assert.equal(graph.nodes.find(node => node.id === imported.target).sources[0].path, 'util/a.go');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
