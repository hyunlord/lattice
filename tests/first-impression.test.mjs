import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFirstImpression } from '../dist/query/first-impression-model.js';
const source = path => ({ path, line: 1, pointer: '', contentHash: 'a'.repeat(64) });
const node = (id, kind = 'module', attributes = {}) => ({ id, kind, name: id, attributes, sources: [source(`${id}.ts`)], contentHash: 'b'.repeat(64) });
const edge = (source, target, kind = 'imports', attributes = {}) => ({ id: `${source}:${target}`, source, target, kind, directed: true, field: '', sources: [{ path: `${source}.ts`, line: 2, pointer: '', contentHash: 'a'.repeat(64) }], attributes });
const graph = (nodes, edges = []) => ({ hash: 'snapshot', repository: { name: 'fixture', dirty: false, sourceFingerprint: 'source' }, nodes, edges });
const project = g => { const pages = new Map(); const model = buildFirstImpression(g, (path, value) => pages.set(path, value)); return { model, pages }; };
test('bounded projection groups actual cross-folder dependencies deterministically and retains every member', () => {
    const nodes = Array.from({ length: 24 }, (_, i) => node(`folder${i % 3}/m${String(i).padStart(2, '0')}`));
    const edges = nodes.slice(1).map((n, i) => edge(nodes[i].id, n.id));
    const a = project(graph(nodes, edges)), b = project(graph([...nodes].reverse(), [...edges].reverse()));
    assert.deepEqual(a, b);
    assert.ok(a.model.components.length >= 5 && a.model.components.length <= 9);
    assert.equal(a.model.fileCount, 24);
    const members = [...a.pages.values()].flatMap(page => page.members ?? []);
    assert.equal(new Set(members.map(m => m.id)).size, 24);
    assert.equal(members.length, 24);
    assert.ok(a.model.components.some(c => c.fileCount > 1));
    assert.ok(a.model.dependencies.every(d => d.importingFileCount > 0));
});
test('disconnected modules stay separate with an honest remainder and nonblank inventory', () => {
    const { model, pages } = project(graph(Array.from({ length: 14 }, (_, i) => node(`m${i}`))));
    assert.equal(model.componentCount, 14);
    assert.equal(model.components.length, 9);
    assert.equal(model.remainder.componentCount, 5);
    assert.equal(pages.get(model.remainder.path).components.length, 5);
    assert.equal(model.dependencies.length, 0);
    assert.ok(model.components.every(c => c.description && c.basis === 'inventory'));
    assert.equal(model.purpose.basis, 'inventory');
    assert.equal(model.flows.length, 0);
});
test('source purpose, public names, exact flow edges and auxiliary exclusions are explicit', () => {
    const entry = node('start', 'function', { module: 'main', entrypoints: [{ category: 'executable', rule: 'main', source: source('main.ts') }] });
    const nodes = [node('main', 'module', { language: 'typescript', publicNames: [{ name: 'Launch', uses: 2 }] }), node('tests/helper'), entry, node('callee', 'function'), node('estimated', 'function'), { ...node('intro', 'document', { sourceDescription: { kind: 'package-metadata', text: 'Source-backed repository purpose.' } }), sources: [source('package.json')] }];
    const { model } = project(graph(nodes, [edge('start', 'callee', 'calls', { resolution: 'exact' }), edge('start', 'estimated', 'calls', { resolution: 'estimated' })]));
    assert.equal(model.purpose.text, 'Source-backed repository purpose.');
    assert.equal(model.components[0].basis, 'public-names');
    assert.equal(model.auxiliaryFileCount, 1);
    assert.equal(model.entrypoints[0].category, 'executable');
    assert.equal(model.flows[0].edges.length, 1);
    assert.equal(model.flows[0].edges[0].target, 'callee');
    assert.equal(model.stack[0].name, 'typescript');
});
test('declared packages provide cohesive units and dependency counts distinguish declarations from importers', () => {
    const files = Array.from({ length: 12 }, (_, i) => node(`src/m${i}`));
    const packages = Array.from({ length: 6 }, (_, i) => node(`p${i}`, 'package', { buildSystem: 'npm', manifestPath: `p${i}/package.json`, root: `p${i}`, memberIds: files.slice(i * 2, i * 2 + 2).map(n => n.id) }));
    const { model } = project(graph([...files, ...packages], [edge('src/m0', 'src/m2'), { ...edge('src/m0', 'src/m3'), id: 'repeat' }, edge('p0', 'p1', 'imports', { importScope: 'project' })]));
    assert.equal(model.components.length, 6);
    assert.equal(model.components[0].title, 'p0');
    assert.equal(model.dependencies.length, 1);
    assert.equal(model.dependencies[0].importingFileCount, 1);
    assert.equal(model.dependencies[0].declarationCount, 1);
    assert.ok(model.stack.some(f => f.name === 'npm' && f.basis === 'manifest'));
});
test('large disconnected inventory uses bounded source-bound remainder pages and tiny repositories stay tiny', () => {
    const { model, pages } = project(graph(Array.from({ length: 200 }, (_, i) => node(`m${i}`))));
    assert.equal(model.components.length, 9);
    let path = model.remainder.path, remaining = 0;
    while (path) { const page = pages.get(path); assert.equal(page.graphHash, 'snapshot'); assert.ok(page.components.length <= 32); remaining += page.components.length; path = page.nextPath; }
    assert.equal(remaining, 191);
    assert.equal(project(graph([node('single')])).model.components.length, 1);
    assert.equal(project(graph([])).model.components.length, 0);
});
test('large declared packages remain intact and package-only links survive projection', () => {
    const left = Array.from({ length: 40 }, (_, i) => node(`left/m${i}`)), right = [node('right/m')];
    const packages = [node('left', 'package', { buildSystem: 'cargo', manifestPath: 'left/Cargo.toml', root: 'left', memberIds: left.map(n => n.id) }), node('right', 'package', { buildSystem: 'cargo', manifestPath: 'right/Cargo.toml', root: 'right', memberIds: right.map(n => n.id) })];
    const { model } = project(graph([...left, ...right, ...packages], [edge('left', 'right', 'imports', { importScope: 'project' })]));
    assert.equal(model.componentCount, 2);
    assert.equal(model.components[0].fileCount, 40);
    assert.equal(model.dependencies[0].declarationCount, 1);
});
test('namespace-targeted imports contribute real cohesion and preserve distinct importing file counts', () => {
    const files = Array.from({ length: 18 }, (_, i) => node(`n${Math.floor(i / 2)}/m${i}`));
    const packages = Array.from({ length: 9 }, (_, i) => node(`namespace${i}`, 'package', { category: 'namespace', memberIds: files.slice(i * 2, i * 2 + 2).map(n => n.id) }));
    const edges = packages.slice(1).map((n, i) => edge(files[i * 2].id, n.id));
    const { model } = project(graph([...files, ...packages], edges));
    assert.ok(model.componentCount <= 9);
    assert.ok(model.dependencies.length > 0);
    assert.ok(model.dependencies.every(d => d.importingFileCount === 1));
});
test('validated claims attach only to exact component source membership; legacy or partial claims cannot replace facts', () => {
    const nodes = [node('a'), node('b')], g = graph(nodes), writes = () => { };
    const claim = { text: 'Cited statement.', citations: [{ path: 'a.ts', contentHash: 'a'.repeat(64), startLine: 1, endLine: 1, excerpt: 'source', url: 'https://example.test/a.ts#L1' }] };
    const notes = [{ targetId: 'a', sources: [{ path: 'a.ts', contentHash: 'a'.repeat(64), line: 1 }], validatedClaims: [claim] }];
    const model = buildFirstImpression(g, writes, { interpretations: notes });
    assert.equal(model.components.find(c => c.id === 'component:a').claims[0].text, 'Cited statement.');
    assert.equal(model.components.find(c => c.id === 'component:b').claims, undefined);
    assert.equal(model.components[0].claims[0].citations[0].excerpt, undefined);
    assert.equal(buildFirstImpression(g, writes, { interpretations: [{ ...notes[0], sources: [{ ...notes[0].sources[0], contentHash: 'stale' }] }] }).components[0].claims, undefined);
});
test('long source paths remain within the lazy page byte budget', () => {
    const nodes = Array.from({ length: 90 }, (_, i) => node(`${'nested/'.repeat(90)}${i}`));
    const { pages } = project(graph(nodes));
    assert.ok([...pages.values()].every(page => Buffer.byteLength(JSON.stringify(page)) < 256 * 1024));
});
test('root introduction prefers substantive description over linked learning navigation and repository wrapper', async () => {
    const { extractMarkdown } = await import('../dist/adapters/markdown.js');
    const text = '# Sample App\n\n**Learn how this app was designed in the [design case study](docs/design.md).**\n\nThis is the repository for the [Sample](https://example.test) app.\n\n**Sample** is an application for tracking reading progress.\nIt stores reading lists locally.\n';
    const input = { path: 'README.md', text, contentHash: 'a'.repeat(64) };
    const result = extractMarkdown(input).nodes[0].attributes.sourceDescription;
    assert.equal(result.text, 'Sample is an application for tracking reading progress.');
    assert.equal(result.line, 7);
    assert.equal(result.endLine, 8);
    const fallback = extractMarkdown({ ...input, text: '# Sample\n\nLearn how to serialize data with [the guide](guide.md).\n' }).nodes[0].attributes.sourceDescription;
    assert.equal(fallback.text, 'Learn how to serialize data with the guide.');
});
test('clearly auxiliary benchmark packages remain accessible after product components', () => {
    const files = [...Array.from({ length: 10 }, (_, i) => node(`p${i}/src/main/K.kt`)), ...Array.from({ length: 20 }, (_, i) => node(`benchmarks/src/main/K${i}.kt`))];
    const packages = [...Array.from({ length: 10 }, (_, i) => node(`pkg${i}`, 'package', { buildSystem: 'gradle', manifestPath: `p${i}/build.gradle.kts`, root: `p${i}`, memberIds: [files[i].id] })), node('bench', 'package', { buildSystem: 'gradle', manifestPath: 'benchmarks/build.gradle.kts', root: 'benchmarks', memberIds: files.slice(10).map(n => n.id) })];
    const { model, pages } = project(graph([...files, ...packages]));
    assert.ok(model.components.every(c => c.title !== 'bench'));
    assert.ok(pages.get(model.remainder.path).components.some(c => c.title === 'bench'));
    assert.equal(model.fileCount, 30);
});
