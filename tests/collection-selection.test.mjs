import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';

test('one catalog projects multiple collections with distinct layer identities and typed views', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-collections-')));
    try {
        execFileSync('git', ['init', '-q', root]);
        mkdirSync(join(root, '.lattice'));
        writeFileSync(join(root, 'runtime.json'), JSON.stringify([{ id: 'a', name: 'Live', kind: 'service' }]));
        writeFileSync(join(root, 'catalog.json'), JSON.stringify({ revision: 'r1', title: 'Catalog root', entries: [{ id: 'a', name: 'Planned', kind: 'service', targetIds: ['b'] }, { id: 'b', name: 'Queue', kind: 'queue' }], groups: [{ id: 'team', name: 'Team' }] }));
        writeFileSync(join(root, '.lattice/lens.json'), JSON.stringify({
            schemaVersion: 1, name: 'Layers', kinds: [
                { id: 'service', label: 'Services', files: ['runtime.json'], layer: 'live' },
                { id: 'content', label: 'Catalog', files: [], selections: [{ files: ['catalog.json'], records: '/entries', kindField: 'kind', layer: 'planned' }] },
                { id: 'group', label: 'Groups', files: ['catalog.json'], records: '/groups', layer: 'planned' },
                { id: 'catalog', label: 'Catalog roots', files: [], selections: [{ files: ['catalog.json'], records: '', idField: 'revision', nameField: 'title', layer: 'planned', references: false }] },
            ], views: [{ id: 'inventory', type: 'table', label: 'Inventory', columns: [{ id: 'name', label: 'Name', value: { op: 'get', from: 'node', path: ['name'] } }] }]
        }));
        const result = buildRepository({ root });
        assert.deepEqual(result.graph.nodes.map(node => node.id).sort(), ['live:a', 'planned:a', 'planned:b', 'planned:r1', 'planned:team']);
        assert.equal(result.graph.nodes.find(node => node.id === 'planned:b').kind, 'queue');
        assert.equal(result.graph.nodes.find(node => node.id === 'planned:a').attributes.originalId, 'a');
        assert.ok(result.graph.edges.some(edge => edge.source === 'planned:a' && edge.target === 'planned:b'));
        assert.equal(result.graph.nodes.find(node => node.id === 'planned:r1').attributes.originalId, 'r1');
        assert.equal(result.graph.nodes.find(node => node.id === 'planned:r1').name, 'Catalog root');
        assert.equal(result.graph.views[0].query.rows.length, 5);
        assert.equal(result.graph.inputs.length, 2);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
