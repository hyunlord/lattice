import test from 'node:test';
import assert from 'node:assert/strict';
class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = new Map(); this.isConnected = true; this.text = ''; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text + this.children.map(child => child.textContent).join(''); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.text = ''; this.children = children; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); }
    focus() { }
}
const elements = (root, tag) => [root, ...root.children.flatMap(child => elements(child, tag))].filter(item => item.tagName === tag);
const source = { path: 'src/main.ts', line: 1, pointer: '', contentHash: 'a'.repeat(64) };
const node = (id, name, attributes = {}) => ({ id, name, kind: 'module', attributes, sources: [source], contentHash: 'b'.repeat(64) });
const selected = node('main', 'Main', { partner: ['friend', { next: 'other', literal: 'plain text' }] }), friend = node('friend', 'Friendly module'), other = node('other', 'Other module');
const graph = (nodes, edges = [], facets = []) => ({ schemaVersion: 1, hash: 'c'.repeat(64), repository: { name: 'example', dirty: false, sourceFingerprint: 'd'.repeat(64) }, nodes, edges, facets, findings: [], views: [] });
const empty = { total: 0, pages: [] }, pages = key => ({ total: 1, pages: [{ parts: [{ path: key, key }] }] });
test('bounded detail keeps human relationship sections before raw properties and resolves nested summary references', async t => {
    const previous = globalThis.document;
    globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => { const item = new Element('#text'); item.textContent = text; return item; } };
    t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
    const { renderNodeDetail } = await import('../viewer/node-detail.js');
    const edge = { id: 'edge', kind: 'uses', source: 'main', target: 'friend', directed: true, field: '', attributes: { label: 'Shares a service' }, sources: [source] };
    const group = graph([selected, friend], Array.from({ length: 20 }, (_, index) => ({ ...edge, id: `edge-${index}` })));
    const referenceCalls = [], data = new Map([['human-out', group], ['human-out-last', graph([selected, friend], [{ ...edge, id: 'edge-20' }])], ['human-in', graph([selected, other], [{ ...edge, id: 'other-edge', source: 'other', target: 'main' }])]]);
    const host = new Element('main');
    renderNodeDetail(host, {
        loader: { page: async (_index, descriptor, page) => data.get(descriptor.pages[page].parts[0].key), label: async (_index, id) => { referenceCalls.push(id); return [friend, other].find(node => node.id === id); } }, index: {},
        record: { graph: graph([selected]), facets: empty, findings: empty, relations: { incoming: empty, outgoing: empty, undirected: empty }, presentationRelations: [{ label: 'Used partners', pages: { total: 21, pages: [...pages('human-out').pages, ...pages('human-out-last').pages] } }, { label: 'Provided to', pages: pages('human-in') }] },
        presentation: { kinds: [], detail: { summaryFields: [{ label: 'Partners', path: ['partner'] }], relationships: [{ label: 'Used partners', edgeKinds: ['uses'], direction: 'outgoing' }, { label: 'Provided to', edgeKinds: ['uses'], direction: 'incoming' }], rawAttributes: 'collapsed' } },
        snapshots: [], params: new URLSearchParams(), current: () => true, nodeHref: id => '#/node/' + id, homeHref: () => '#/home', sources: () => new Element('sources'), finding: () => new Element('finding'), layerLabel: value => value, kindLabel: value => value, facetLabel: value => value, valueLabel: (_key, value) => String(value), functionLogic: () => { }
    });
    await new Promise(resolve => setImmediate(resolve));
    const sections = host.children.filter(item => item.tagName === 'section'), headings = sections.map(item => elements(item, 'h2')[0]?.textContent);
    assert.deepEqual(headings.slice(0, 4), ['요약', 'Used partners · 21', 'Provided to · 1', '원본 출처']);
    const summary = sections[0], links = elements(summary, 'a').map(item => [item.textContent, item.href]);
    assert.deepEqual(links, [['Friendly module', '#/node/friend'], ['Other module', '#/node/other']]);
    assert.ok(summary.textContent.includes('plain text')); assert.deepEqual(referenceCalls.sort(), ['friend', 'other', 'plain text']);
    assert.ok(sections[1].textContent.includes('Friendly module')); assert.ok(sections[1].textContent.includes('Shares a service')); assert.ok(sections[2].textContent.includes('Other module'));
    assert.equal(elements(sections[1], 'li').length, 20);
    elements(sections[1], 'button').find(item => item.textContent === '다음').onclick();
    await new Promise(resolve => setImmediate(resolve)); assert.equal(elements(sections[1], 'li').length, 1);
    assert.ok(!headings.some(heading => /^(분류|관련 발견|나가는 연결|들어오는 연결|방향 없는 연결) · 0$/.test(heading)));

});
