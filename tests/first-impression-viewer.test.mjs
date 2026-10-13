import test from 'node:test';
import assert from 'node:assert/strict';
import { firstImpression } from '../viewer/first-impression-data.js';
import { renderFirstImpression } from '../viewer/first-impression.js';
class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.text = ''; this.classList = { add() { } }; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    prepend(...children) { this.children.unshift(...children); }
    append(...children) { this.children.push(...children); }
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
test('summary renders real call branches, labelled fallbacks and detailed navigation without fetching graph', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    t.mock.method(globalThis, 'fetch', () => { throw new Error('First paint must not fetch'); });
    const host = new Element('main');
    renderFirstImpression(host, model, { overview: { repository: { name: 'Example' }, layers: [{ id: 'configured', label: 'Configured lens' }], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    assert.ok(host.textContent.includes('Processes structured input')); assert.ok(host.textContent.includes('Components & connections')); assert.ok(host.textContent.includes('Where does it start?'));
    const flow = elements(host, 'ul').find(item => item.className === 'fi-flow'); assert.deepEqual(flow.children.map(item => item.textContent), ['main → parse', 'main → read']);
    const links = elements(host, 'a'); assert.ok(links.some(item => item.href.includes('view=map'))); assert.ok(links.some(item => item.href.includes('layer=configured')));
    assert.ok(host.textContent.includes('representative public names')); assert.ok(!host.textContent.includes('summary needed'));
});
test('compact component disclosure keeps full prose while duplicate starts and declaration-only links stay clear', t => {
    const previous = globalThis.document; globalThis.document = { createElement: tag => new Element(tag) };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const host = new Element('main'), duplicate = { ...model.entrypoints[0], id: 'other-main', source: { ...source, path: 'src/worker.ts' } };
    renderFirstImpression(host, { ...model, entrypoints: [...model.entrypoints, duplicate], dependencies: [{ source: 'part', target: 'part', importingFileCount: 0, declarationCount: 3, sources: [source] }] }, { overview: { repository: { name: 'Example' }, layers: [], limitations: [] }, sources: () => new Element('evidence'), params: new URLSearchParams('lang=en') });
    assert.ok(elements(host, 'details').some(item => item.className === 'fi-component'));
    assert.ok(host.textContent.includes('main · main.ts')); assert.ok(host.textContent.includes('main · worker.ts'));
    assert.ok(host.textContent.includes('3 declarations')); assert.ok(!host.textContent.includes('0 files'));
    assert.ok(host.textContent.includes('Static call: main → parse'));
});
