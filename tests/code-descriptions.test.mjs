import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode } from '../dist/index.js';
const attributes = (path, text) => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') }).node.attributes;

test('module documentation skips license and preserves first sentence source lines', () => {
    const value = attributes('algo/algo.go', '// Copyright 2026. All rights reserved.\n\n// Package algo implements fuzzy matching. It ranks candidates.\npackage algo\nfunc Match() {}');
    assert.deepEqual(value.sourceDescription, { text: 'Package algo implements fuzzy matching.', kind: 'module-doc', line: 3, endLine: 3 });
});
test('Python module docstring and Rust inner docs supply deterministic descriptions', () => {
    assert.equal(attributes('api.py', '#!/usr/bin/python\n"""HTTP request helpers. Further detail."""\ndef get(): pass').sourceDescription.text, 'HTTP request helpers.');
    assert.equal(attributes('src/lib.rs', '//! Searches byte sequences.\n//! More details.\npub fn search() {}').sourceDescription.text, 'Searches byte sequences.');
});
test('public name ranking excludes private definitions and literal or comment mentions', () => {
    const value = attributes('x.go', 'package x\nfunc hidden() {}\nfunc Run() { Run(); Run(); hidden() }\nfunc Other() {}\n// Other Other Other\nvar text = "Other Other"');
    assert.deepEqual(value.publicNames, [{ name: 'Run', uses: 2, line: 3 }, { name: 'Other', uses: 0, line: 4 }]);
});
test('explicit public visibility is required for C# Rust and Swift; Python private names stay hidden', () => {
    for (const [path, text, names] of [
        ['x.cs', 'internal class Hidden {}\npublic class Visible { private void Secret() {} public void Run() {} }', ['Run', 'Visible']],
        ['x.rs', 'struct Hidden {}\npub(crate) struct Internal {}\npub struct Visible {}\nfn hidden() {}', ['Visible']],
        ['x.swift', 'struct Hidden {}\npublic struct Visible {}', ['Visible']],
        ['x.py', 'def _hidden(): pass\ndef visible(): pass', ['visible']],
        ['x.ts', 'function hidden() {}\nexport function visible() {}', ['visible']],
    ]) assert.deepEqual(attributes(path, text).publicNames.map(item => item.name), names);
});

test('README purpose and section descriptions preserve prose provenance and omit badges code and comments', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    const text = '# Search\n\n[![CI](badge.svg)](ci)\n\nFind files quickly.\nAcross folders.\n\n## src/algo\n<!-- hidden -->\n```js\nnot prose\n```\n\nFuzzy ranking routines. More details.\n';
    const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
    assert.deepEqual(graph.nodes[0].attributes.sourceDescription, { text: 'Find files quickly.', kind: 'readme', line: 5, endLine: 6 });
    assert.deepEqual(graph.nodes.find(node => node.name === 'src/algo').attributes.sourceDescription, { text: 'Fuzzy ranking routines.', kind: 'readme', line: 14, endLine: 14 });
});

test('compiler directives and implementation comments are not module descriptions', () => {
    assert.equal(attributes('A.cs', '#nullable enable\npublic class A {\n // Does work.\n public void Run() {}\n}').sourceDescription, undefined);
    assert.equal(attributes('x.rs', '#[cfg(feature = "x")]\npub fn run() {}\n// Implementation detail.').sourceDescription, undefined);
});

test('overloaded public declarations occupy one summary name', () => {
    const value = attributes('A.cs', 'public class A { public void Run() {} public void Run(int x) {} }');
    assert.equal(value.publicNames.filter(item => item.name === 'Run').length, 1);
});

test('package descriptions never come from imported helpers or tests', () => {
    assert.equal(attributes('x.go', 'package x\nimport "fmt"\n// A helper does work.\nfunc Helper() {}').sourceDescription, undefined);
    assert.equal(attributes('x.go', 'package x\n// Helper does work.\nfunc Helper() {}').sourceDescription.kind, 'declaration-doc');
    assert.equal(attributes('x.go', 'package x\n/*\nAlgorithm\n---------\n\nMatches ordered characters. More details.\n*/\nimport "fmt"').sourceDescription.text, 'Matches ordered characters.');
    assert.equal(attributes('test.rb', '# frozen_string_literal: true\nrequire "test"').sourceDescription, undefined);
});

test('README ignores complete HTML promo containers before the repository introduction', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    const text = '<div align="center">\n<a href="shop"><img src="badge.png"></a>\nBuy our hats today!\n</div>\n\n<kbd>\nShirts for sale!\n<br>\n</kbd>\n\n---\n\nA portable search engine for local files. More detail.\n';
    const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
    assert.equal(graph.nodes[0].attributes.sourceDescription.text, 'A portable search engine for local files.');
    assert.equal(graph.nodes[0].attributes.sourceDescription.line, 13);
});

test('shell and Ruby use only meaningful leading script documentation without adding analysis claims', () => {
    const shell = attributes('preview.sh', '#!/usr/bin/env bash\n#\n# Preview files and images in the terminal.\n# Extra information.\n\necho ready\n# Ignore implementation notes.');
    assert.deepEqual(shell.sourceDescription, { text: 'Preview files and images in the terminal.', kind: 'module-doc', line: 3, endLine: 4 });
    assert.equal(shell.extraction, 'file-only');
    assert.equal(attributes('test.rb', '# frozen_string_literal: true\n# Run isolated integration scenarios.\nrequire "test"').sourceDescription.text, 'Run isolated integration scenarios.');
    assert.equal(attributes('test.rb', '# frozen_string_literal: true\nrequire "test"\n# Run isolated integration scenarios.').sourceDescription, undefined);
    assert.equal(attributes('update.sh', '#!/bin/sh\n# Copyright 2026\n#\n# Updates generated completion files.\nset -e').sourceDescription.text, 'Updates generated completion files.');
});

test('license provenance and URL-only headers are never source descriptions', () => {
    for (const header of ['/*! MIT License © Example */', '// https://example.org/original', '// Ported from Original, source: https://example.org']) assert.equal(attributes('index.ts', `${header}\nimport x from './x.js';\nexport default x;`).sourceDescription, undefined);
});
test('package documentation skips Java annotations while type documentation remains distinct', () => {
    assert.equal(attributes('package-info.java', '/** Utilities for parsing structured input. */\n@NullMarked\npackage demo;').sourceDescription.kind, 'module-doc');
    assert.equal(attributes('a.py', '# Formats a value.\ndef format_value(): pass').sourceDescription.kind, 'declaration-doc');
    assert.equal(attributes('a.ts', '/** Builds one request. */\nexport function request() {}').sourceDescription.kind, 'declaration-doc');
});
test('public export values entrypoints and real imported test registrations carry source evidence', () => {
    const value = attributes('index.ts', 'const hidden = 1;\nexport const create = () => 1;\nconst client = {};\nexport default client;\nexport {hidden as visible};');
    assert.deepEqual(value.publicNames.map(item => item.name).sort(), ['client', 'create', 'visible']);
    assert.deepEqual(attributes('main.go', 'package main\nfunc main() {}').entryPoints, [{ name: 'main', line: 2 }]);
    assert.deepEqual(attributes('helpers.go', 'package helpers\nfunc main() {}').entryPoints, []);
    const tests = attributes('x.test.ts', "import verify from 'ava';\nverify('retries failed requests', () => {});\nconst fake = \"verify('invented',()=>{})\";");
    assert.deepEqual(tests.verificationNames, [{ name: 'retries failed requests', line: 2, kind: 'test-registration' }]);
    assert.deepEqual(attributes('x.ts', "function verify() {}\nverify('not proven test',()=>{});").verificationNames, []);
    assert.deepEqual(attributes('x.test-d.ts', "import {expectType} from 'tsd';\nexpectType<string>(value);").verificationNames, [{ name: 'expectType', line: 2, kind: 'type-assertion' }]);
});
test('README introductions preserve blockquotes and plain HTML paragraphs but skip notices', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    for (const text of ['# Client\n\n> [!NOTE]\n> Release preview.\n\n> A small HTTP client for browser requests.\n\nTargets modern browsers.', '<div align="center">\n<p>A small HTTP client for browser requests.</p>\n<img src="badge.svg">\n</div>\n\nTargets modern browsers.', '<div>\n<p>\nA small HTTP client for browser requests.\n</p>\n</div>']) {
        const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
        assert.equal(graph.nodes[0].attributes.sourceDescription.text, 'A small HTTP client for browser requests.');
    }
});

test('default exports describe declared bindings, never literal values or call expressions', () => {
    for (const text of ['export default true;', 'function createClient() {}\nexport default createClient();', 'export default missing;']) assert.deepEqual(attributes('index.ts', text).publicNames, []);
    assert.deepEqual(attributes('index.ts', 'const client = {};\nexport default client;').publicNames.map(value => value.name), ['client']);
});
test('README sponsor containers cannot override the real introduction', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    for (const banner of ['<div class="sponsors"><p>Sponsored by Acme.</p></div>', '<div class="sponsors">\n<p>Acme makes excellent tools.</p>\n</div>']) {
        const text = `${banner}\n\n<p>A portable search engine for local files.</p>`;
        const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
        assert.equal(graph.nodes[0].attributes.sourceDescription.text, 'A portable search engine for local files.');
    }
});

test('provenance sentences and setext titles do not count as purpose', async () => {
    assert.equal(attributes('middleware.go', '// The original work was derived from Example middleware, source: https://example.org\npackage middleware').sourceDescription, undefined);
    const { extractMarkdown } = await import('../dist/index.js');
    for (const underline of ['============', '------------']) {
        const text = `Example programs\n${underline}\n\n* [Demo](demo.go)\n`;
        const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
        assert.equal(graph.nodes[0].attributes.sourceDescription, undefined);
    }
    const text = 'Search\n======\n\nFind local files quickly.';
    const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
    assert.equal(graph.nodes[0].attributes.sourceDescription.text, 'Find local files quickly.');
    assert.equal(graph.nodes[0].attributes.sourceDescription.line, 4);
});
