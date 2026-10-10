import test from 'node:test';
import assert from 'node:assert/strict';
import { queryGraph } from '../bin/mcp-queries.mjs';
import { parseArguments, toolDefinitions, McpArgumentError } from '../bin/mcp-schema.mjs';
import { normalizeView, automaticViews } from '../dist/query/views-model.js';
const source = { path: 'records.json', line: 1, pointer: '/0', contentHash: 'source' };
const node = (id, layer = 'design', kind = 'record', extra = {}) => ({ id, kind, name: id, attributes: { layer, tags: ['a', 'b'], ...extra }, sources: [source], contentHash: id });
const edge = (id, from, to, directed = true) => ({ id, kind: 'uses', source: from, target: to, directed, field: '', sources: [source] });
const finding = (id, targetIds, extra = {}) => ({ id, ruleId: 'rule', severity: 'warning', targetIds, metrics: {}, message: 'Measured', basis: 'computed', sources: [source], ...extra });
const graph = { schemaVersion: 1, hash: 'graph', repository: { name: 'test', dirty: false, sourceFingerprint: 'source' }, nodes: [node('a'), node('b'), node('c'), node('hidden', 'design', 'helper'), node('runtime', 'runtime')], edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('ca', 'c', 'a'), edge('aa', 'a', 'a'), edge('ac', 'a', 'c', false), edge('counterpart', 'a', 'runtime', false)], facets: [{ id: 'f', nodeId: 'a', key: 'rank', value: 1, ruleId: 'rank', sources: [source] }, { id: 'g', nodeId: 'b', key: 'rank', value: '1', ruleId: 'rank', sources: [source] }], findings: [finding('f1', ['a'], { intent: 'authored', implementation: 'observed' }), finding('f2', ['hidden']), finding('f3', ['runtime'])], views: [], snapshots: [], lensDigest: null, adapterVersions: {}, inputs: [] };
const presentation = { defaultLayer: 'design', kinds: [{ id: 'helper', hidden: true }] };
const link = (route, params = {}) => 'https://example.test/#' + route + '?' + new URLSearchParams(params);
const query = (name, args = {}) => queryGraph(name, parseArguments(name, args), graph, presentation, link);
test('MCP find combines typed facet, tags, kind and text without merging layers', () => {
    const result = query('lattice_find', { kind: 'record', q: 'a', tags: ['a', 'b'], facets: { rank: 1 } });
    assert.deepEqual(result.items.map(item => item.id), ['a']);
    assert.equal(query('lattice_find', { facets: { rank: '1' } }).items[0].id, 'b');
    assert.equal(query('lattice_find', { tags: ['absent'] }).total, 0);
    assert.equal(query('lattice_find', { layer: 'runtime' }).total, 1);
});
test('MCP overview counts visible nodes but retains hidden-target findings like web home', () => {
    const result = query('lattice_overview');
    assert.equal(result.counts.nodes, 3);
    assert.equal(result.counts.findings, 2);
    assert.equal(result.distribution.items[0].count, 3);
    assert.deepEqual(result.facetDistributions.items[0].values.items.map(bucket => [bucket.value, bucket.count]), [['1', 1], [1, 1]]);
});
test('MCP node pages directional evidence and retains cross-layer counterparts', () => {
    const result = query('lattice_node', { id: 'a', limit: 1 });
    assert.equal(result.outgoing.total, 2);
    assert.equal(result.incoming.total, 2);
    assert.equal(result.undirected.total, 2);
    assert.equal(result.undirected.truncated, true);
    assert.equal(result.findings.items[0].intent, 'authored');
    assert.equal(query('lattice_node', { id: 'runtime' }).layer, 'runtime');
});
test('MCP trace terminates cycles, respects direction and reports paginated path order', () => {
    const result = query('lattice_trace', { from: 'a', to: 'c', limit: 1 });
    assert.equal(result.pathLength, 1);
    assert.equal(result.nodes.total, 2);
    assert.equal(result.nodes.truncated, true);
    assert.equal(query('lattice_trace', { from: 'a', hops: 10 }).visited, 3);
    assert.equal(query('lattice_trace', { from: 'runtime', to: 'a', layer: 'runtime' }).found, false);
});
test('MCP matrix cells reproduce shared web projection and carry source evidence', () => {
    const result = query('lattice_matrix');
    const nodes = graph.nodes.slice(0, 3), edges = graph.edges.slice(0, 5);
    const projection = normalizeView(automaticViews(nodes, edges)[0], nodes, edges);
    assert.deepEqual(result.cells.items.map(cell => [cell.row, cell.column, cell.count]), projection.cells.map(cell => [cell.row, cell.column, cell.count]));
    assert.deepEqual(result.cells.items[0].sources.items, [source]);
});
test('MCP schemas reject unknown fields and wrong types while allowing later pages', () => {
    assert.equal(toolDefinitions.length, 11);
    assert.throws(() => parseArguments('lattice_trace', { from: 'a', hops: 11 }), McpArgumentError);
    assert.throws(() => parseArguments('lattice_find', { limit: 201 }), McpArgumentError);
    assert.throws(() => parseArguments('lattice_find', { unknown: 1 }), McpArgumentError);
    assert.throws(() => parseArguments('lattice_node', {}), McpArgumentError);
    assert.equal(parseArguments('lattice_find', { offset: 500 }).offset, 500);
});
test('MCP findings distinguish warnings without gates from failed gates', () => {
    const result = query('lattice_findings', { severity: 'warning', rule: 'rule', node: 'a', gate: 'none' });
    assert.deepEqual(result.items.map(item => item.id), ['f1']);
    assert.equal(result.items[0].basis, 'computed');
    assert.deepEqual(result.items[0].sources.items, [source]);
    assert.equal(query('lattice_findings', { gate: 'fail' }).total, 0);
});
test('MCP result pagination does not hide total or invent a final page', () => {
    const result = query('lattice_find', { offset: 1, limit: 1 });
    assert.deepEqual(result.items.map(item => item.id), ['b']);
    assert.equal(result.total, 3);
    assert.equal(result.nextOffset, 2);
    assert.equal(result.truncated, true);
});
test('MCP links preserve encoded node identities and actual matrix viewer route', () => {
    const id = 'kind:한글/인용?#% 空';
    const result = queryGraph('lattice_node', { id }, { ...graph, nodes: [node(id)], edges: [], facets: [], findings: [] }, presentation, link);
    assert.equal(decodeURIComponent(new URL(result.link).hash.split('?')[0].slice('#/node/'.length)), id);
    assert.match(query('lattice_matrix').link, /#\/views\/auto-kind-matrix\?layer=design&origin=auto$/);
});
test('MCP diff shares web identities and retains cross-layer incident changes', async () => {
    const { webDiff } = await import('../bin/mcp-diff.mjs');
    const before = { ...graph, nodes: [node('old', 'design', 'record', { originalId: 'stable', identityNamespace: 'old' }), node('runtime', 'runtime')], edges: [edge('link-old', 'old', 'runtime', false)], facets: [], findings: [] };
    const after = { ...before, nodes: [node('new', 'design', 'record', { originalId: 'stable', identityNamespace: 'new' }), node('runtime', 'runtime')], edges: [{ ...edge('link-new', 'new', 'runtime', false), attributes: { label: 'changed' } }] };
    // Names are source content, not identity namespaces.
    before.nodes[0].name = 'same'; after.nodes[0].name = 'same';
    const result = webDiff(before, after, presentation, {});
    assert.equal(result.nodes.added.total + result.nodes.removed.total + result.nodes.changed.total, 0);
    assert.equal(result.edges.changed.total, 1);
    assert.equal(result.edges.changed.items[0].before.source, 'old');
    assert.equal(result.edges.changed.items[0].after.source, 'new');
});
test('MCP diff applies the after-selected default layer to both revisions', async () => {
    const { webDiff } = await import('../bin/mcp-diff.mjs');
    const before = { ...graph, nodes: [node('runtime', 'runtime')], edges: [], facets: [], findings: [] };
    const result = webDiff(before, graph, presentation, {});
    assert.equal(result.layer, 'design');
    assert.equal(result.nodes.removed.total, 0);
    assert.equal(result.nodes.added.total, 3);
});
test('overview keeps large finding evidence out of summaries while detail pages nested arrays', () => {
    const references = Array.from({ length: 500 }, (_, index) => ({ index, evidence: [index, index + 1] }));
    const large = { ...graph, nodes: [node('a', 'design', 'record', { references })], edges: [], facets: [], findings: [finding('many', ['a'], { metrics: { references, totalReferences: 500, nullable: null } })] };
    const overview = queryGraph('lattice_overview', { limit: 1 }, large, presentation, link);
    assert.equal(overview.findings.items[0].targetCount, 1);
    assert.equal('metrics' in overview.findings.items[0], false);
    const detail = queryGraph('lattice_node', { id: 'a', limit: 1 }, large, presentation, link);
    assert.equal(detail.node.attributes.references.total, 500);
    assert.equal(detail.node.attributes.references.items.length, 1);
    assert.equal(detail.node.attributes.references.items[0].evidence.total, 2);
    const findings = queryGraph('lattice_findings', { limit: 1 }, large, presentation, link);
    assert.equal(findings.items[0].metrics.references.total, 500);
    assert.equal(findings.items[0].metrics.references.nextOffset, 1);
    assert.equal(findings.items[0].metrics.totalReferences, 500);
    assert.equal(findings.items[0].metrics.nullable, null);
});
