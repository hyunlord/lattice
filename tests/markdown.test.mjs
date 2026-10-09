import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as lattice from '../dist/index.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('Markdown extracts headings and hierarchy while ignoring code fences and indented code', () => {
    const result = lattice.extractMarkdown(input('docs/a.md', '# Title\n\n```md\n# Fake\n[x](missing.md)\n```\n\n    # Also fake\n\nSection\n-------\n## Child\n'));
    assert.deepEqual(result.nodes.filter(n => n.kind === 'heading').map(n => n.attributes['text']), ['Title', 'Section', 'Child']);
    assert.deepEqual(result.nodes.filter(n => n.kind === 'heading').map(n => n.sources[0].line), [1, 10, 12]);
    assert.equal(result.links.length, 0);
    assert.equal(result.edges.length, 3);
    assert.equal(result.edges.find(e => e.target.endsWith('#child')).source, 'document:docs/a.md#title');
});

test('duplicate heading anchors do not collide with explicitly numbered headings', () => {
    const result = lattice.extractMarkdown(input('a.md', '# A\n# A\n# A-1\n# A\n# 한글 제목\n'));
    const headings = result.nodes.filter(n => n.kind === 'heading');
    assert.equal(new Set(headings.map(n => n.id)).size, 5);
    assert.equal(headings.at(-1).attributes['anchor'], '한글-제목');
});

test('Markdown links preserve sources, support reference definitions and skip inline code', () => {
    const result = lattice.extractMarkdown(input('docs/a.md', '# A\n[inline](other.md#part) and [ref][guide]\n`[fake](bad.md)`\n[guide]: <../README.md> "Title"\n[balanced](other_(copy).md)\n'));
    assert.deepEqual(result.links.map(link => link.target), ['other.md#part', '../README.md', 'other_(copy).md']);
    assert.deepEqual(result.links.map(link => link.source.line), [2, 2, 5]);
    assert.ok(result.links.every(link => link.sourceId === 'document:docs/a.md#a'));
});

test('document link resolution separates external URLs and diagnoses broken relative anchors', () => {
    const documents = [
        lattice.extractMarkdown(input('docs/a.md', '# A\n[b](../b.md#part) [self](#a) [missing](../b.md#absent) [web](https://example.org) [escape](../../outside.md)')),
        lattice.extractMarkdown(input('b.md', '# Part')),
    ];
    const result = lattice.resolveDocumentLinks(documents);
    assert.equal(result.edges.filter(e => e.kind === 'link').length, 2);
    assert.equal(result.externalLinks.length, 1);
    assert.deepEqual(result.diagnostics.map(d => d.code).sort(), ['broken-link', 'invalid-link']);
    assert.deepEqual(lattice.resolveDocumentLinks([...documents].reverse()), result);
});

test('ADR status and decision remain generic document attributes with source locations', () => {
    const result = lattice.extractMarkdown(input('docs/adr/0001-choice.md', '# Choose a format\n\n## Status\nAccepted\n\n## Decision\nUse a shared graph.\n'));
    const document = result.nodes.find(n => n.kind === 'document');
    assert.equal(document.attributes['status'], 'Accepted');
    assert.equal(document.attributes['decision'], 'Use a shared graph.');
    assert.equal(document.sources[0].line, 1);
});

test('comments do not create headings or links and fenced code can contain shorter fence runs', () => {
    const result = lattice.extractMarkdown(input('a.md', '<!--\n# Fake\n[x](bad.md)\n-->\n# Real\n````\n```\n# Still code\n````\n[ok](#real)'));
    assert.deepEqual(result.nodes.filter(n => n.kind === 'heading').map(n => n.name), ['Real']);
    assert.deepEqual(result.links.map(link => link.target), ['#real']);
});

test('document resolution handles encoded paths, root paths and malformed or unsafe targets', () => {
    const docs = [
        lattice.extractMarkdown(input('docs/a.md', '# A\n[x](../space%20name.md?view=1#part) [root](/space%20name.md#part) [bad](%xx) [unsafe](javascript:alert(1))')),
        lattice.extractMarkdown(input('space name.md', '# Part')),
    ];
    const result = lattice.resolveDocumentLinks(docs);
    assert.equal(result.edges.filter(e => e.kind === 'link').length, 2);
    assert.equal(result.diagnostics.length, 2);
    assert.ok(result.diagnostics.every(d => d.code === 'invalid-link'));
    assert.throws(() => lattice.resolveDocumentLinks([docs[0], docs[0]]), { name: 'DataInputError' });
});

test('literal underscores in headings keep their linkable anchors', () => {
    const document = lattice.extractMarkdown(input('a.md', '# snake_case\n[go](#snake_case)'));
    assert.equal(document.nodes.find(n => n.kind === 'heading').attributes['anchor'], 'snake_case');
    assert.equal(lattice.resolveDocumentLinks([document]).diagnostics.length, 0);
});

test('multiline inline-code spans cannot emit fake links', () => {
    const document = lattice.extractMarkdown(input('a.md', '`code begins\n[fake](missing.md)\ncode ends`\n[real](#)'));
    assert.deepEqual(document.links.map(link => link.target), ['#']);
    assert.equal(document.links[0].source.line, 4);
});

test('reference definitions reject trailing junk but accept valid titles', () => {
    const document = lattice.extractMarkdown(input('a.md', '[bad]: target.md junk\n[good]: target.md "title"\n[bad] [good]'));
    assert.deepEqual(document.links.map(link => link.target), ['target.md']);
    assert.equal(document.links[0].source.line, 3);
});

test('large unresolved bracket sequences do not change later link extraction', () => {
    const document = lattice.extractMarkdown(input('a.md', '['.repeat(20_000) + ']'.repeat(20_000) + '\n[ok](#)'));
    assert.deepEqual(document.links.map(link => link.target), ['#']);
});

test('unclosed code spans do not cross paragraph boundaries', () => {
    const document = lattice.extractMarkdown(input('a.md', '`unclosed\n\n[real](#)\n\n`'));
    assert.deepEqual(document.links.map(link => link.target), ['#']);
});
