import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildFirstImpression } from '../dist/query/first-impression-model.js';
import { discoverBuildPackages } from '../dist/adapters/build-manifests.js';
import { extractMarkdown } from '../dist/adapters/markdown.js';
const input = (path, text) => ({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });
const source = path => ({ path, line: 1, pointer: '', contentHash: 'a'.repeat(64) });
const module = (path, attributes = {}) => ({ id: path, kind: 'module', name: path, attributes, sources: [source(path)], contentHash: 'b'.repeat(64) });
const graph = (nodes, edges = []) => ({ hash: 'c'.repeat(64), repository: { name: 'fixture', dirty: false, sourceFingerprint: 'd'.repeat(64) }, nodes, edges, facets: [] });
test('real manifest adapter dependencies remain declared first-impression connections', () => {
    const modules = [module('a/main.ts'), module('b/main.ts')];
    const manifest = discoverBuildPackages([input('a/package.json', '{"name":"alpha","dependencies":{"beta":"workspace:*"}}'), input('b/package.json', '{"name":"beta"}')], modules);
    assert.equal(manifest.edges.filter(e => e.kind === 'depends-on').length, 1);
    const model = buildFirstImpression(graph([...modules, ...manifest.nodes.map(n => ({ ...n, contentHash: 'e'.repeat(64) }))], manifest.edges), () => { });
    assert.equal(model.dependencyCount, 1);
    assert.equal(model.dependencies[0].declarationCount, 1);
    assert.equal(model.dependencies[0].importingFileCount, 0);
    assert.equal(model.dependencies[0].sources[0].path, 'a/package.json');
    const manyModules = Array.from({ length: 9 }, (_, i) => module(`p${i}/main.ts`));
    const manyInputs = manyModules.map((_, i) => input(`p${i}/package.json`, JSON.stringify({ name: `p${i}`, ...(i < 8 ? { dependencies: { [`p${i + 1}`]: 'workspace:*' } } : {}) })));
    const manyPackages = discoverBuildPackages(manyInputs, manyModules);
    const cohesive = buildFirstImpression(graph([...manyModules, ...manyPackages.nodes.map(n => ({ ...n, contentHash: 'e'.repeat(64) }))], manyPackages.edges), () => { });
    assert.equal(cohesive.componentCount, 7, 'actual declared edges also drive affinity grouping');
    assert.ok(cohesive.dependencies.every(edge => edge.declarationCount > 0));
});
test('license boilerplate falls back to public names or inventory', () => {
    const text = 'Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an AS IS BASIS.';
    const model = buildFirstImpression(graph([module('release.sh', { sourceDescription: { kind: 'module-doc', text }, publicNames: [{ name: 'release', uses: 1 }] }), module('build.sh', { sourceDescription: { kind: 'module-doc', text } })]), () => { });
    assert.equal(model.components.find(c => c.id === 'component:release.sh').basis, 'public-names');
    assert.equal(model.components.find(c => c.id === 'component:build.sh').basis, 'inventory');
});
test('first impression uses the bounded root introductory paragraph without changing the old sentence contract', () => {
    const text = '# Reader\n\nReader is a mobile app. It presents daily science news and saves reading lists.\nIt synchronizes starred articles across devices.\n';
    const extracted = extractMarkdown(input('README.md', text));
    assert.equal(extracted.nodes[0].attributes.sourceDescription.text, 'Reader is a mobile app.');
    const model = buildFirstImpression(graph(extracted.nodes.map(n => ({ ...n, contentHash: 'a'.repeat(64) }))), () => { });
    assert.equal(model.purpose.text, 'Reader is a mobile app. It presents daily science news and saves reading lists. It synchronizes starred articles across devices.');
    assert.equal(model.purpose.sources[0].line, 3);
    assert.equal(model.purpose.sources[0].endLine, 4);
});
test('all legal layers round-trip their own membership through actual packed HTTP transport', async t => {
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { createServer } = await import('node:http');
    const { createPackedExport } = await import('../bin/export-packs.mjs');
    const { writeOverview } = await import('../bin/export-overview.mjs');
    const { parseOverview } = await import('../viewer/overview-data.js');
    const { createPackedLoader } = await import('../viewer/packed-data.js');
    const layers = ['', 'default', '한국어', 'source code', 'source/code'];
    const nodes = layers.map((layer, index) => module(`file${index}.ts`, { layer }));
    const directory = mkdtempSync(join(tmpdir(), 'first-impression-layer-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const writer = createPackedExport(directory), direct = new Map();
    writeOverview(graph(nodes), { kinds: [] }, (path, text) => direct.set(path, text), { json: writer.json }); writer.finish();
    const overview = parseOverview(JSON.parse(direct.get('overview.json')));
    const paths = overview.layers.map(layer => layer.firstImpression.components[0].membershipPath);
    assert.equal(new Set(paths).size, layers.length);
    const server = createServer((request, response) => {
        try { response.end(readFileSync(join(directory, new URL(request.url, 'http://fixture').pathname))); }
        catch (error) { if (error.code !== 'ENOENT') throw error; response.writeHead(404).end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const loader = createPackedLoader(`http://127.0.0.1:${server.address().port}/`, '?generation=7');
    for (const [index, path] of paths.entries()) { const page = await loader.json(path); assert.equal(page.graphHash, overview.hash); assert.equal(page.members[0].id, nodes[index].id); }
});
