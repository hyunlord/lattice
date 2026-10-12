import test from 'node:test';
import assert from 'node:assert/strict';
import { queryGraph } from '../bin/mcp-queries.mjs';
import { parseArguments, toolDefinitions, McpArgumentError } from '../bin/mcp-schema.mjs';
const sources = Array.from({ length: 7 }, (_, index) => ({ path: 'src/start.ts', line: index + 1, endLine: index + 2, pointer: `/body/${index}`, contentHash: 'source', snippet: 'RAW_SOURCE_SENTINEL'.repeat(100) }));
const node = (id, layer = 'code') => ({ id, kind: 'function', name: `Label ${id}`, contentHash: id, attributes: { layer, description: 'Human description. '.repeat(40), arbitrary: 'RAW_ATTRIBUTE_SENTINEL'.repeat(100), intent: { raw: 'RAW_INTENT_SENTINEL' }, entrypoints: Array.from({ length: 5 }, () => ({ category: 'public-api', rule: 'export', source: sources[0] })) }, sources });
const graph = { schemaVersion: 1, hash: 'graph', repository: { name: 'fixture', dirty: false, sourceFingerprint: 'source' }, nodes: [node('c'), node('a'), node('b'), node('other', 'other')], edges: [{ id: 'edge', kind: 'calls', source: 'a', target: 'b', directed: true, field: '', sources, attributes: { resolution: 'exact', arbitrary: 'RAW_EDGE_SENTINEL' } }], facets: [{ id: 'facet', nodeId: 'a', key: 'rank', value: { raw: 'RAW_FACET_SENTINEL' }, ruleId: 'rank', sources }], findings: [{ id: 'finding', ruleId: 'rule', severity: 'warning', targetIds: ['a'], metrics: { raw: 'RAW_METRIC_SENTINEL' }, message: 'RAW_FINDING_SENTINEL', basis: 'computed', sources }], views: [], snapshots: [], lensDigest: null, adapterVersions: {}, inputs: [] };
const presentation = { defaultLayer: 'code' };
const link = (route, params = {}) => `https://example.test/#${route}?${new URLSearchParams(params)}`;
const query = (name, args = {}) => queryGraph(name, parseArguments(name, args), graph, presentation, link);
const metadata = ({ items, preview, ...rest }) => rest;
const tools = ['lattice_find', 'lattice_entrypoints', 'lattice_node'];

for (const name of tools) {
    test(`${name} advertises an optional boolean compact argument`, () => {
        // Given the public tools/list definition, when inspecting compact, then it is optional.
        const definition = toolDefinitions.find(tool => tool.name === name);
        assert.equal(definition.inputSchema.properties.compact.type, 'boolean');
        assert.equal(definition.inputSchema.required.includes('compact'), false);
        assert.equal(definition.inputSchema.additionalProperties, false);
    });
    test(`${name} rejects invalid compact types and unrelated arguments`, () => {
        // Given otherwise valid arguments, when parsing invalid input, then no coercion occurs.
        const args = name === 'lattice_node' ? { id: 'a' } : {};
        for (const compact of ['true', 1, null, [], {}]) assert.throws(() => parseArguments(name, { ...args, compact }), error => error instanceof McpArgumentError && /compact: expected boolean/.test(error.message));
        assert.throws(() => parseArguments(name, { ...args, compact: true, unrelated: 1 }), /unrelated: unknown argument/);
    });
    test(`${name} preserves the full legacy response when compact is false`, () => {
        // Given a default response, when opting out explicitly, then every field is unchanged.
        const args = name === 'lattice_node' ? { id: 'a', limit: 2 } : { limit: 2 };
        const expected = query(name, args);
        assert.deepEqual(query(name, { ...args, compact: false }), expected);
    });
}

for (const name of ['lattice_find', 'lattice_entrypoints']) {
    test(`${name} preserves selection, ordering and continuation on compact later pages`, () => {
        // Given a paginated full selection, when compacting, then IDs and page metadata match.
        const args = { offset: 1, limit: 1 }, full = query(name, args);
        const compact = query(name, { ...args, compact: true });
        assert.deepEqual(metadata(compact), metadata(full));
        const identity = item => (name === 'lattice_entrypoints' ? item.node : item).id;
        assert.deepEqual(compact.items.map(identity), full.items.map(identity));
        assert.equal(compact.total, 3);
        assert.equal(compact.nextOffset, 2);
    });
}

test('compact node bounds descriptions and source spans while full pages recover omitted evidence', () => {
    // Given long attributes and seven source records, when compacting, then only bounded evidence is emitted.
    const full = query('lattice_node', { id: 'a' });
    const compact = query('lattice_node', { id: 'a', compact: true });
    assert.deepEqual(Object.keys(compact.node).sort(), ['id', 'kind', 'name', 'layer', 'contentHash', 'summary', 'sources', 'omitted'].sort());
    assert.deepEqual([compact.node.id, compact.node.kind, compact.node.name, compact.node.layer], ['a', 'function', 'Label a', 'code']);
    assert.equal(compact.node.summary, full.node.attributes.description.slice(0, 240));
    assert.deepEqual(compact.node.omitted, { attributes: Object.keys(full.node.attributes).length, summaryCharacters: full.node.attributes.description.length - 240, sources: 4 });
    assert.deepEqual(metadata(compact.node.sources), metadata(full.node.sources));
    assert.deepEqual(compact.node.sources.items, sources.slice(0, 3).map(({ path, line, endLine, contentHash }) => ({ path, line, endLine, contentHash })));
    assert.doesNotMatch(JSON.stringify(compact), /RAW_/);
    assert.equal(full.node.sources.items[0].snippet, sources[0].snippet);
    assert.equal(full.node.attributes.arbitrary, graph.nodes[1].attributes.arbitrary);
    assert.deepEqual(query('lattice_node', { id: 'a', offset: 3, limit: 4 }).node.sources.items, sources.slice(3));
});

test('compact node retains relation identities and collection pages with disclosed field omission', () => {
    // Given incident edges, facets and findings, when compacting, then navigation survives without raw payloads.
    const full = query('lattice_node', { id: 'a', limit: 1 });
    const compact = query('lattice_node', { id: 'a', limit: 1, compact: true });
    for (const key of ['incoming', 'outgoing', 'undirected', 'facets', 'findings']) {
        assert.deepEqual(metadata(compact[key]), metadata(full[key]));
        assert.deepEqual(compact[key].items.map(item => item.id), full[key].items.map(item => item.id));
        for (const [index, item] of compact[key].items.entries()) assert.equal(item.omittedFields, Object.keys(full[key].items[index]).filter(key => !(key in item)).length);
    }
    assert.deepEqual(Object.keys(compact.outgoing.items[0]).sort(), ['id', 'kind', 'source', 'target', 'directed', 'targetLayer', 'resolution', 'omittedFields'].sort());
    assert.deepEqual(Object.keys(compact.facets.items[0]).sort(), ['id', 'nodeId', 'key', 'omittedFields'].sort());
    assert.deepEqual(Object.keys(compact.findings.items[0]).sort(), ['id', 'ruleId', 'severity', 'omittedFields'].sort());
    assert.equal('intent' in compact, false);
    assert.equal('implementation' in compact, false);
    assert.equal(compact.omittedFields, 2);
    assert.equal(compact.outgoing.items[0].resolution, 'exact');
});

test('compact entrypoints bound classifications without changing ranked identities', () => {
    // Given five source-backed classifications, when compacting, then three remain and omissions are counted.
    const full = query('lattice_entrypoints'), compact = query('lattice_entrypoints', { compact: true });
    assert.deepEqual(compact.items.map(item => item.node.id), full.items.map(item => item.node.id));
    for (const item of compact.items) {
        assert.equal(item.entrypoints.length, 3);
        assert.equal(item.omittedEntrypoints, 2);
        assert.deepEqual(item.packageIds, []);
        assert.equal(item.omittedPackageIds, 0);
        assert.deepEqual(item.entrypoints[0], { category: 'public-api', rule: 'export', source: { path: 'src/start.ts', line: 1, endLine: 2, contentHash: 'source' } });
    }
    assert.doesNotMatch(JSON.stringify(compact), /RAW_/);
});

test('compact find uses the same bounded node projection and keeps node links', () => {
    // Given find results, when compacting, then each result remains addressable with its full source label.
    const full = query('lattice_find'), compact = query('lattice_find', { compact: true });
    for (const [index, item] of compact.items.entries()) {
        assert.equal(item.name, full.items[index].name);
        assert.equal(item.link, full.items[index].link);
        assert.equal(item.summary.length, 240);
        assert.equal(item.sources.items.length, 3);
        assert.equal(item.omitted.sources, 4);
        assert.equal('attributes' in item, false);
    }
});

test('compact empty pages preserve totals and never fabricate a summary', () => {
    // Given no description or source evidence, when compacting, then missing evidence stays missing.
    const sparse = { ...graph, nodes: [{ ...node('bare'), attributes: { layer: 'code' }, sources: [] }], edges: [], facets: [], findings: [] };
    const result = queryGraph('lattice_node', { id: 'bare', compact: true }, sparse, presentation, link);
    assert.equal(result.node.summary, null);
    assert.deepEqual(result.node.omitted, { attributes: 1, summaryCharacters: 0, sources: 0 });
    assert.deepEqual(result.node.sources.items, []);
    assert.equal(query('lattice_find', { compact: true, offset: 100 }).items.length, 0);
    assert.equal(query('lattice_find', { compact: true, offset: 100 }).total, 3);
});

test('compact counts all omitted source records even on a later source page', () => {
    // Given a later source page, when compacting, then total omission is distinct from slice omission.
    const full = query('lattice_node', { id: 'a', offset: 2, limit: 4 });
    const compact = query('lattice_node', { id: 'a', offset: 2, limit: 4, compact: true });
    assert.deepEqual(metadata(compact.node.sources), metadata(full.node.sources));
    assert.deepEqual(compact.node.sources.items.map(source => source.line), [3, 4, 5]);
    assert.equal(compact.node.omitted.sources, 4);
    for (const key of ['incoming', 'outgoing', 'undirected', 'facets', 'findings']) assert.deepEqual(compact[key].items, []);
});

test('compact package membership and classification text disclose their exact omissions', () => {
    // Given many memberships and a long classification, when compacting, then retained prefixes are explicit.
    const start = node('start');
    start.attributes.entrypoints = [{ category: 'public-api', rule: 'x'.repeat(300), source: sources[0] }];
    const packages = Array.from({ length: 5 }, (_, index) => ({ id: `pkg${index}`, kind: 'package', name: `Package ${index}`, contentHash: 'pkg', attributes: { layer: 'code', memberIds: ['start'] }, sources: [] }));
    const grouped = { ...graph, nodes: [start, ...packages], edges: [], facets: [], findings: [] };
    const result = queryGraph('lattice_entrypoints', { compact: true }, grouped, presentation, link);
    assert.deepEqual(result.items[0].packageIds, ['pkg0', 'pkg1', 'pkg2']);
    assert.equal(result.items[0].omittedPackageIds, 2);
    assert.equal(result.items[0].entrypoints[0].rule, 'x'.repeat(240));
    assert.equal(result.items[0].entrypoints[0].omittedRuleCharacters, 60);
    assert.equal(result.items[0].omittedEntrypoints, 0);
});

for (const args of [{}, { offset: 2, limit: 4 }, { offset: 3, limit: 4 }, { offset: 6, limit: 4 }]) {
    test(`compact source preview discloses same-page omissions at ${JSON.stringify(args)}`, () => {
        // Given an ordinary source page, when capped, then preview metadata supplies a complete full-page request.
        const full = query('lattice_node', { id: 'a', ...args });
        const compact = query('lattice_node', { id: 'a', ...args, compact: true });
        assert.deepEqual(compact.node.sources.preview, { limit: 3, omittedInPage: Math.max(0, full.node.sources.items.length - 3), fullRequest: { name: 'lattice_node', arguments: { id: 'a', layer: 'code', offset: args.offset ?? 0, limit: args.limit ?? 50, compact: false } } });
        const request = compact.node.sources.preview.fullRequest;
        assert.deepEqual(query(request.name, request.arguments).node.sources, full.node.sources);
        assert.equal(compact.node.sources.nextOffset, full.node.sources.nextOffset);
    });
}

test('compact relations preserve estimated resolution and do not invent missing confidence', () => {
    // Given exact, estimated and unclassified edges, when compacting, then their distinctions remain explicit.
    const edges = ['exact', 'estimated', 'unresolved-receiver', null].map((resolution, index) => ({ ...graph.edges[0], id: `edge${index}`, attributes: resolution === null ? {} : { resolution } }));
    const result = queryGraph('lattice_node', { id: 'a', compact: true }, { ...graph, edges }, presentation, link);
    assert.deepEqual(result.outgoing.items.map(edge => edge.resolution), ['exact', 'estimated', 'unresolved-receiver', null]);
    assert.equal(result.outgoing.items[0].omittedFields, 3);
});
