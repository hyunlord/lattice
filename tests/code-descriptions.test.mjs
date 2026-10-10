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

test('multiline linked badges are removed without losing real prose or source lines', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    for (const badge of ['[![Build\nCI](https://example.org/a(b).svg)](https://example.org/build)', '![Build\nCI][badge]', '[![Build\nCI][badge]][build]']) {
        const text = `${badge}\n\nA database migration tool. More details.\n\n[badge]: badge.svg\n[build]: /build`;
        const graph = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') });
        assert.equal(graph.nodes[0].attributes.sourceDescription.text, 'A database migration tool.');
        assert.equal(graph.nodes[0].attributes.sourceDescription.line, 4);
    }
    const text = '[![CI](badge.svg)](/build) A database migration tool.';
    assert.equal(extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription.text, 'A database migration tool.');
});
test('tool pragmas and import annotations are not module purpose', () => {
    for (const header of ['/* eslint-disable no-inner-declarations */', '// @ts-nocheck', '// prettier-ignore', '// types only!', '// type-only imports']) assert.equal(attributes('module.ts', `${header}\nimport {value} from './value';\nexport function run() {}`).sourceDescription, undefined);
    assert.equal(attributes('Module.cs', '// ReSharper disable MergeCastWithTypeCheck\nusing System;\npublic class Module {}').sourceDescription, undefined);
    assert.equal(attributes('module.ts', '// Requests remote data with retries.\nimport {value} from "./value";').sourceDescription.text, 'Requests remote data with retries.');
});

test('tool directives are removed per line while adjacent purpose keeps exact evidence', () => {
    const value = attributes('module.ts', '// @ts-check\n// Provides HTTP request retries.\nimport x from "./x.js";');
    assert.deepEqual(value.sourceDescription, { text: 'Provides HTTP request retries.', kind: 'module-doc', line: 2, endLine: 2 });
    const block = attributes('module.ts', '/* eslint-disable no-console\n * Provides HTTP request retries.\n */\nimport x from "./x.js";');
    assert.deepEqual(block.sourceDescription, { text: 'Provides HTTP request retries.', kind: 'module-doc', line: 2, endLine: 2 });
});

test('generated banners and stability-only notices are not module purpose', () => {
    for (const header of ['// <auto-generated>\n// This code was generated by a tool.\n// </auto-generated>', '// Internal functions (subject to change without notice)', '// Internal functions (subject to change without notice)\n// In case you rely on them, be sure to pin the version']) assert.equal(attributes('module.ts', `${header}\nimport x from './x';\nexport function run() {}`).sourceDescription, undefined);
});
test('README skips navigation-only introductions and prefers its own package paragraph', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    for (const header of ['visit [example.org](https://example.org) or `npm i example`', 'Install with `npm install example`.']) {
        const text = `${header}\n\nA state management library for applications.`;
        const value = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription;
        assert.equal(value.text, 'A state management library for applications.'); assert.equal(value.line, 3);
    }
    const text = 'A validation library for applications.\n\nThe `Example.Integration` package integrates dependency injection.\n';
    const value = extractMarkdown({ path: 'src/Example.Integration/README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription;
    assert.equal(value.text, 'The Example.Integration package integrates dependency injection.'); assert.equal(value.line, 3);
});

test('purpose prose about generated code is preserved while actual banners are excluded', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    const text = 'A parser for code generated by a tool.';
    assert.equal(extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription.text, text);
    assert.equal(attributes('parser.ts', `// ${text}\nimport x from './x';`).sourceDescription.text, text);
    assert.equal(attributes('parser.ts', '// API functions are subject to change without notice.\nimport x from "./x";').sourceDescription, undefined);
});

test('indented HTML paragraph prose stays visible while code remains excluded', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    const text = '<div align="center">\n  <p>\n    A cross-platform build tool.\n  </p>\n</div>';
    const value = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription;
    assert.equal(value.text, 'A cross-platform build tool.'); assert.equal(value.line, 3);
    for (const code of ['    <p>Fake code description.</p>', '```html\n<p>Fake code description.</p>\n```']) {
        const text = `${code}\n\nA genuine description.`;
        assert.equal(extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription.text, 'A genuine description.');
    }
});


test('qualified Java annotations preserve authored package documentation', () => {
    const value = attributes('package-info.java', '/** Streams structured data efficiently. */\n@com.example.annotations.CheckReturnValue\npackage example.stream;');
    assert.deepEqual(value.sourceDescription, { text: 'Streams structured data efficiently.', kind: 'module-doc', line: 1, endLine: 1 });
});

test('grouped Go types preserve public declarations and balanced bodies without field inventions', () => {
    const text = 'package task\ntype (\n ExecutorOption interface { Apply(*Executor) }\n Executor struct { Handler func(int) (string, error); Nested struct { Value int } }\n Alias = map[string]func(int) (string, error)\n hidden []Executor\n)\nfunc (e *Executor) RunTask() {}';
    const value = attributes('executor.go', text);
    assert.deepEqual(value.definitions.map(item => item.name), ['ExecutorOption', 'Executor', 'Alias', 'hidden', 'RunTask']);
    assert.equal(value.definitions.find(item => item.name === 'Executor').line, 4);
    assert.equal(value.definitions.find(item => item.name === 'hidden').public, false);
    assert.ok(value.publicNames.some(item => item.name === 'Executor'));
});

test('JavaDoc inline links render readable labels and keep first sentence evidence', () => {
    for (const [link, rendered] of [['{@link example.Parser}', 'example.Parser'], ['{@link example.Parser parser API}', 'parser API'], ['{@linkplain example.Parser parser API}', 'parser API']]) {
        const value = attributes('package-info.java', `/** This package provides ${link} to parse structured data. More detail. */\npackage example;`).sourceDescription;
        assert.deepEqual(value, { text: `This package provides ${rendered} to parse structured data.`, kind: 'module-doc', line: 1, endLine: 1 });
    }
});

test('major public type docs preserve authored prose and exact declaration evidence', () => {
    for (const [path, text, name, expected, line, endLine] of [
        ['executor.go', 'package task\ntype (\n // Executor processes task files. More detail.\n Executor struct {}\n)', 'Executor', 'Executor processes task files.', 3, 3],
        ['reader.go', 'package taskfile\n// Reader recursively reads task files\n// and builds a graph.\ntype Reader struct {}', 'Reader', 'Reader recursively reads task files and builds a graph.', 2, 3],
        ['ast.go', 'package ast\n// Taskfile is the syntax tree for a task file\ntype Taskfile struct {}', 'Taskfile', 'Taskfile is the syntax tree for a task file', 2, 2],
        ['Reader.cs', 'using System;\n/// <summary>\n/// Reads data from <see cref="IParser" />.\n/// </summary>\npublic class Reader {}', 'Reader', 'Reads data from IParser.', 2, 4],
        ['Writer.cs', 'using System;\n/// <summary>Writes CSV files.</summary>\npublic class Writer {}', 'Writer', 'Writes CSV files.', 2, 2],
        ['Parser.java', 'package example;\n/** Converts {@code Parser} values. More detail. */\n@example.CheckReturnValue\npublic class Parser {}', 'Parser', 'Converts Parser values.', 2, 2],
    ]) assert.deepEqual(attributes(path, text).definitions.find(value => value.name === name).declarationDescription, { text: expected, kind: 'type-doc', line, endLine });
});
test('type docs preserve every public candidate beyond three for repository-wide selection', () => {
    const text = 'package example\n// A purpose.\ntype A struct {}\n// B purpose.\ntype B struct {}\n// C purpose.\ntype C struct {}\n// D purpose.\ntype D struct {}\nvar _ D\nvar _ D\nvar _ B';
    const definitions = attributes('types.go', text).definitions;
    assert.deepEqual(definitions.filter(value => value.declarationDescription).map(value => value.name), ['A', 'B', 'C', 'D']);
    assert.equal(attributes('types.go', 'package example\n// Unrelated comment.\nvar x = 1\ntype Public struct {}').definitions.find(value => value.name === 'Public').declarationDescription, undefined);
});

test('type documentation stops at non-doc comments and bounded incomplete blocks', () => {
    assert.equal(attributes('Type.java', '/** Earlier class description. */\nclass Earlier {}\n/* ordinary implementation note */\npublic class Visible {}').definitions.find(value => value.name === 'Visible').declarationDescription, undefined);
    const text = `/** Start.\n${' * More details.\n'.repeat(260)} */\npublic class Visible {}`;
    assert.equal(attributes('Type.java', text).definitions.find(value => value.name === 'Visible').declarationDescription, undefined);
});

test('type documentation attaches only to the declaration owning the preceding line', () => {
    const value = attributes('Types.cs', 'namespace Demo;\n/// <summary>Represents the first type.</summary>\npublic class First {} public class Second {}');
    assert.equal(value.definitions.find(item => item.name === 'First').declarationDescription.text, 'Represents the first type.');
    assert.equal(value.definitions.find(item => item.name === 'Second').declarationDescription, undefined);
    for (const text of ['/// <summary>A namespace description.</summary>\nnamespace Demo { public class Nested {} }', '/// <summary>A containing type.</summary>\npublic class Outer { public class Nested {} }']) assert.equal(attributes('Types.cs', text).definitions.find(item => item.name === 'Nested').declarationDescription, undefined);
});

test('type prose excludes line-leading documentation block tags without removing ordinary text', () => {
    const value = attributes('Parser.java', '/**\n * Parses structured values\n * @author Example Author\n * @since 1.0\n */\npublic class Parser {}');
    assert.equal(value.definitions[0].declarationDescription.text, 'Parses structured values');
    const prose = attributes('Parser.java', '/**\n * Sends status to support@example.org using {@code @author}.\n */\npublic class Parser {}');
    assert.equal(prose.definitions[0].declarationDescription.text, 'Sends status to support@example.org using @author.');
});

test('module docs render prose without Markdown wrappers or JSDoc examples', () => {
    const text = '/**\n * @module request\n * **Builds** a `Request` from [input](https://example.org). More details.\n * @example\n * const example = new Request();\n */\nexport const request = 1;';
    assert.deepEqual(attributes('index.ts', text).sourceDescription, { text: 'Builds a Request from input.', kind: 'module-doc', line: 1, endLine: 6 });
});

test('fenced examples never become module descriptions and prose after them survives', () => {
    const text = '/**\n * ```ts\n * const misleading = "Example code.";\n * ```\n * Provides **routing** helpers.\n */\nimport x from "./x";';
    assert.equal(attributes('index.ts', text).sourceDescription.text, 'Provides routing helpers.');
    assert.equal(attributes('index.ts', '/**\n * @example\n * const misleading = "Example code.";\n */\nimport x from "./x";').sourceDescription, undefined);
});

test('XML documentation selects summary prose and excludes example code', () => {
    const text = 'using System;\n/// <example><code>var value = "Wrong purpose.";</code></example>\n/// <summary>Reads <see cref="IParser"/> &amp; **writes** <c>CSV</c> records.</summary>\npublic class Reader {}';
    assert.equal(attributes('Reader.cs', text).definitions[0].declarationDescription.text, 'Reads IParser & writes CSV records.');
});

test('documentation block metadata without sentence punctuation cannot leak into prose', () => {
    const text = '/**\n * Parses structured values\n * @example\n * new Parser().parse("value")\n * @returns parsed data\n */\npublic class Parser {}';
    assert.equal(attributes('Parser.java', text).definitions[0].declarationDescription.text, 'Parses structured values');
});

test('README purpose can begin under an explicit introductory heading after badges', async () => {
    const { extractMarkdown } = await import('../dist/index.js');
    for (const heading of ['What is Example Mapper?', 'Overview', 'Introduction', 'About Example Mapper']) {
        const text = `![Logo](logo.svg)\n\n[![CI](badge.svg)](/ci)\n\n### ${heading}\n\nA library for mapping one object to another. More detail.\n\n### Getting started\n\nFirst, configure the library.`;
        const value = extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription;
        assert.equal(value.text, 'A library for mapping one object to another.'); assert.equal(value.line, 7);
    }
    const text = '![Logo](logo.svg)\n\n### Getting started\n\nFirst, configure the library.';
    assert.equal(extractMarkdown({ path: 'README.md', text, contentHash: createHash('sha256').update(text).digest('hex') }).nodes[0].attributes.sourceDescription, undefined);
});

test('public function prose stays on its declaration with exact adjacent evidence', () => {
    const value = attributes('args.go', 'package demo\n\n// ExactArgs rejects a wrong argument count. More detail.\nfunc ExactArgs(n int) error { return nil }\n\n// hidden is not public API.\nfunc hidden() {}\n');
    assert.deepEqual(value.definitions.find(d => d.name === 'ExactArgs').declarationDescription, { text: 'ExactArgs rejects a wrong argument count.', kind: 'function-doc', line: 3, endLine: 3 });
    assert.equal(value.definitions.find(d => d.name === 'hidden').declarationDescription, undefined);
    assert.notEqual(value.sourceDescription?.kind, 'module-doc');
});
test('adjacent public methods retain authored prose without claiming undocumented functions', () => {
    for (const [path, source, name] of [
        ['api.go', 'package demo\ntype Command struct{}\n// Run executes this command.\nfunc (c *Command) Run() {}', 'Run'],
        ['api.ts', 'import x from "x";\n/** Execute a request. */\nexport function request() {}', 'request'],
        ['api.cs', 'public class Api {\n/// <summary>Execute a request.</summary>\npublic void Run() {}\n}', 'Run'],
        ['api.java', 'public class Api {\n/** Execute a request. */\npublic void run() {}\n}', 'run'],
        ['api.rs', 'use std::fmt;\n/// Execute a request.\npub fn run() {}', 'run'],
    ]) {
        const value = attributes(path, source), declaration = value.definitions.find(d => d.name === name);
        assert.equal(declaration.declarationDescription.kind, 'function-doc', path);
        assert(!/[<>*`]/u.test(declaration.declarationDescription.text), path);
        assert.notEqual(value.sourceDescription?.kind, 'module-doc', path);
    }
    const value = attributes('api.go', 'package demo\n// Explanation for an unrelated statement.\nvar x = 1\nfunc Run() {}');
    assert.equal(value.definitions.find(d => d.name === 'Run').declarationDescription, undefined);
});

test('function evidence does not inherit documentation from another declaration on the same line', () => {
    const value = attributes('api.cs', '/// <summary>The API container.</summary>\npublic class Api { public void Run() {} }');
    assert.equal(value.definitions.find(d => d.name === 'Run').declarationDescription, undefined);
    assert.equal(value.definitions.find(d => d.name === 'Api').declarationDescription.kind, 'type-doc');
});

test('function documentation appears only as a labelled file definition, never a file or folder role', async () => {
    const { buildStructuralMap } = await import('../dist/query/structural-map-model.js');
    const path = 'src/args.go', text = 'package demo\n\n// ExactArgs rejects the wrong argument count.\nfunc ExactArgs(n int) error { return nil }';
    const node = extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') }).node;
    const model = buildStructuralMap([node], []), stage = model.stages.find(s => s.id === model.rootStageIds[0]);
    assert.equal(stage.summary, '역할 설명 없음 — 요약 실행 필요');
    assert.deepEqual(stage.summaryEvidence, []);
    assert.equal(stage.filePreviews[0].summary, '파일 설명 없음 — 요약 실행 필요');
    assert.deepEqual(stage.filePreviews[0].summaryEvidence, []);
    assert.deepEqual(stage.filePreviews[0].definition, { name: 'ExactArgs', summary: 'ExactArgs rejects the wrong argument count.', line: 3 });
});
test('public function docs retain the bounded adjacent-comment scan', () => {
    const text = 'package demo\n' + Array.from({ length: 300 }, () => '// Older discussion.').join('\n') + '\nfunc Run() {}';
    assert.equal(attributes('api.go', text).definitions.find(d => d.name === 'Run').declarationDescription, undefined);
});

test('Python public declaration docstrings retain their own scope and first sentence', () => {
    const value = attributes('pkg/_client.py', 'import typing\n__all__ = ["Client"]\nclass BaseClient:\n    """Shared implementation details."""\nclass _Private:\n    """Private implementation."""\nclass Client(BaseClient):\n    """An HTTP client with connection pooling. More detail."""\n    def send(self):\n        """Send one request."""\ndef helper():\n    """Transform input values. More detail."""\n');
    assert.equal(value.sourceDescription, undefined);
    const client = value.definitions.find(item => item.name === 'Client');
    assert.deepEqual(client.declarationDescription, { text: 'An HTTP client with connection pooling.', kind: 'type-doc', line: 8, endLine: 8 });
    assert.equal(value.definitions.find(item => item.name === 'send').declarationDescription, undefined);
    assert.equal(value.definitions.find(item => item.name === 'helper').declarationDescription.text, 'Transform input values.');
    assert.deepEqual(value.declaredExports, ['Client']);
});

test('Python file fallback labels a representative public class without promoting it to a folder role', async () => {
    const { structuralFilePreviews } = await import('../dist/query/structural-file-previews.js');
    const { structuralSummary, missingStructuralRole } = await import('../dist/query/structural-map-model.js');
    const text = 'import typing\nclass BaseClient:\n    """Shared request implementation."""\nclass Client(BaseClient):\n    """An HTTP client with pooling. More detail."""\n';
    const node = extractCode({ path: 'pkg/_client.py', text, contentHash: createHash('sha256').update(text).digest('hex') }).node;
    const [preview] = structuralFilePreviews([node]);
    assert.equal(preview.summary, '대표 타입 Client — An HTTP client with pooling.');
    assert.deepEqual(preview.summaryEvidence, [{ path: 'pkg/_client.py', line: 5 }]);
    assert.equal(structuralSummary([node], [], 'pkg'), missingStructuralRole);
});

test('Python inline suites never borrow the next top-level declaration docstring', () => {
    const value = attributes('api.py', 'def helper(): pass\ndef public():\n    """The public operation."""\n    pass\n');
    assert.equal(value.definitions.find(item => item.name === 'helper').declarationDescription, undefined);
    assert.equal(value.definitions.find(item => item.name === 'public').declarationDescription.text, 'The public operation.');
});

test('Python URL documentation selects prose after assignment and assert examples', () => {
    const value = attributes('pkg/urls.py', `class URL:
    """
    url = httpx.URL("HTTPS://jo%40email.com:a%20secret@müller.de:1234/pa%20th?search=ab#anchorlink")

    assert url.scheme == "https"
    assert url.username == "jo@email.com"
    assert url.password == "a secret"

    The components of a URL are broken down like this:

       https://jo%40email.com:a%20secret@müller.de:1234/pa%20th?search=ab#anchorlink
    [scheme]   [  username  ] [password] [ host ][port][ path ] [ query ] [fragment]
    """
`);
    assert.deepEqual(value.definitions[0].declarationDescription, { text: 'The components of a URL are broken down like this:', kind: 'type-doc', line: 9, endLine: 9 });
});

test('Python doctest-only documentation never becomes prose', () => {
    const value = attributes('api.py', 'class Example:\n    """\n    >>> x = 1\n    >>> x + 1\n    2\n    """\n');
    assert.equal(value.definitions[0].declarationDescription, undefined);
});
