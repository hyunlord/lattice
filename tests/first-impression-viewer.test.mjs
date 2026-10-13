import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpression } from '../viewer/first-impression-data.js';
import { renderFirstImpression } from '../viewer/first-impression.js';
class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.text = ''; this.style = {}; this.classList = { add() { } }; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    insertBefore(child, reference) { this.children.splice(this.children.indexOf(reference), 0, child); }
    prepend(...children) { this.children.unshift(...children); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    addEventListener() { }
    removeAttribute(key) { this.attributes.delete(key); }
    remove() { this.removed = true; }
    setAttribute(key, value) { this.attributes.set(key, value); }
}
const elements = (root, tag) => [root, ...root.children.flatMap(child => elements(child, tag))].filter(item => item.tagName === tag);
const hash = 'a'.repeat(64), source = { path: 'src/main.ts', line: 1, pointer: '', contentHash: hash };
const component = { id: 'part', title: 'Parser', description: 'Public names: parse, read', basis: 'public-names', fileCount: 2, memberPreview: [{ id: 'file', name: 'main', path: source.path }], sources: [source], membershipPath: `first-impression/${hash}/default/members-0-0.json` };
const model = { schemaVersion: 1, graphHash: hash, purpose: { text: 'Processes structured input', basis: 'source-description', sources: [source] }, components: [component], componentCount: 1, fileCount: 2, auxiliaryFileCount: 0, dependencies: [], dependencyCount: 0, unprojectedDependencyCount: 0, entrypoints: [{ id: 'main', name: 'main', category: 'executable', source }], entrypointCount: 1, flows: [{ rootId: 'main', basis: 'static-call-graph', truncated: false, nodes: [{ id: 'main', name: 'main' }, { id: 'parse', name: 'parse' }, { id: 'read', name: 'read' }], edges: [{ id: 'a', source: 'main', target: 'parse', sources: [source] }, { id: 'b', source: 'main', target: 'read', sources: [source] }] }], stack: [{ name: 'TypeScript', basis: 'language', fileCount: 2, sources: [source] }] };
test('first impression boundary rejects foreign generations and malformed source evidence', () => {
    assert.equal(firstImpression(model, hash), true);
    assert.equal(firstImpression(model, 'b'.repeat(64)), false);
    assert.equal(firstImpression({ ...model, components: [{ ...component, membershipPath: 'https://outside.example/file' }] }, hash), false);
    assert.equal(firstImpression({ ...model, purpose: { ...model.purpose, sources: [{ path: 'missing-evidence' }] } }, hash), false);
});
test('summary renders a real call path, labelled fallbacks and detailed navigation without fetching graph', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    t.mock.method(globalThis, 'fetch', () => { throw new Error('First paint must not fetch'); });
    const host = new Element('main');
    renderFirstImpression(host, model, { overview: { repository: { name: 'Example' }, layers: [{ id: 'configured', label: 'Configured lens' }], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    assert.ok(host.textContent.includes('Processes structured input')); assert.ok(host.textContent.includes('Components & connections')); assert.ok(host.textContent.includes('Where does it start?'));
    const flow = elements(host, 'ul').find(item => item.className === 'fi-flow'); assert.deepEqual(flow.children.map(item => item.textContent), ['main → parse']);
    const links = elements(host, 'a'); assert.ok(links.some(item => item.href.includes('view=map'))); assert.ok(links.some(item => item.href.includes('layer=configured')));
    assert.ok(host.textContent.includes('representative public names')); assert.ok(!host.textContent.includes('summary needed'));
});
test('compact component disclosure keeps full prose while duplicate starts and declaration-only links stay clear', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const host = new Element('main'), duplicate = { ...model.entrypoints[0], id: 'other-main', source: { ...source, path: 'src/worker.ts' } };
    renderFirstImpression(host, { ...model, entrypoints: [...model.entrypoints, duplicate], dependencies: [{ source: 'part', target: 'part', importingFileCount: 0, declarationCount: 3, sources: [source] }] }, { overview: { repository: { name: 'Example' }, layers: [], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    assert.ok(elements(host, 'details').some(item => item.className === 'fi-component'));
    assert.ok(host.textContent.includes('main · main.ts')); assert.ok(host.textContent.includes('main · worker.ts'));
    assert.ok(host.textContent.includes('3 declarations')); assert.ok(!host.textContent.includes('0 files'));
    assert.ok(host.textContent.includes('Static call: main → parse'));
});
test('diagram precedes supporting cards and keeps citations local when no verified URL exists', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const seen = [];
    const claim = { text: 'Requests and parsing', citations: [{ path: 'dirty.ts', contentHash: hash, startLine: 3, endLine: 5 }] };
    const host = new Element('main');
    renderFirstImpression(host, { ...model, components: [{ ...component, titleClaim: claim, claims: [claim] }] }, { overview: { repository: { name: 'Example', remoteUrl: 'https://github.com/example/project', commit: 'abc' }, layers: [], limitations: [] }, sources: items => { seen.push(...items); return new Element('evidence'); }, params: new URLSearchParams('lang=en') });
    const root = host.children[0];
    assert.ok(root.children.findIndex(item => item.className === 'fi-structure') < root.children.findIndex(item => item.className === 'fi-layout'));
    assert.ok(elements(host, 'svg').length);
    assert.ok(seen.filter(item => item.path === 'dirty.ts').every(item => !item.url));
});
test('high file counts retain distinct dependency stroke widths', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const host = new Element('main');
    const second = { ...component, id: 'second', title: 'Reader' };
    renderFirstImpression(host, { ...model, components: [component, second], dependencies: [{ source: 'part', target: 'second', importingFileCount: 51, declarationCount: 0, sources: [source] }, { source: 'second', target: 'part', importingFileCount: 80, declarationCount: 0, sources: [source] }] }, { overview: { repository: { name: 'Example' }, layers: [], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    const lines = elements(host, 'polyline');
    assert.equal(lines.length, 2);
    assert.ok(Number(lines[0].attributes.get('stroke-width')) > Number(lines[1].attributes.get('stroke-width')));
});
test('diagram rejects executable and non-web source URLs while retaining local evidence text', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const claim = { text: 'Requests', citations: [{ path: 'claim.ts', startLine: 2, endLine: 3, contentHash: hash, url: 'javascript:alert(1)' }] };
    const host = new Element('main');
    renderFirstImpression(host, { ...model, components: [{ ...component, titleClaim: claim, claims: [claim] }, { ...component, id: 'local', sources: [{ ...source, path: 'local.ts', url: 'file:///private/local.ts' }] }] }, { overview: { repository: { name: 'Example' }, layers: [], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    assert.ok(elements(host, 'a').every(item => !/^(?:javascript|file|data):/u.test(item.href)));
    assert.ok(elements(host, 'button').some(item => item.title?.includes('claim.ts:2')));
    assert.ok(elements(host, 'button').some(item => item.title?.includes('local.ts:1')));
});

test('diagram folds auxiliary parts below the product drawing and keeps one evidence control per box', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const claim = { text: 'Parse input', citations: [{ path: 'src/parse.ts', startLine: 4, endLine: 9, contentHash: hash }] };
    const seen = [], host = new Element('main');
    renderFirstImpression(host, { ...model, components: [{ ...component, titleClaim: claim, claims: [claim] }, { ...component, id: 'tools', title: 'Release tasks', category: 'auxiliary' }], dependencies: [{ source: 'tools', target: 'part', importingFileCount: 3, declarationCount: 0, sources: [source] }] }, { overview: { repository: { name: 'Example' }, layers: [], limitations: [] }, sources: items => { seen.push(...items); return new Element('evidence'); }, params: new URLSearchParams('lang=en') });
    const boxes = elements(host, 'article').filter(item => item.className === 'fi-diagram-box');
    assert.equal(boxes.length, 1);
    assert.equal(elements(host, 'polyline').length, 0);
    const icon = elements(boxes[0], 'button').filter(item => item.className === 'fi-evidence-icon');
    assert.equal(icon.length, 1);
    assert.match(icon[0].attributes.get('aria-label'), /AI evidence/);
    assert.ok(!boxes[0].textContent.includes('AI name source'));
    assert.ok(seen.some(item => item.path === 'src/parse.ts' && item.line === 4 && item.endLine === 9));
    const folded = elements(host, 'details').find(item => item.className === 'fi-auxiliary');
    assert.ok(folded);
    assert.ok(!folded.open);
    assert.match(folded.textContent, /Tools & configuration/);
    assert.match(folded.textContent, /Release tasks/);
});
