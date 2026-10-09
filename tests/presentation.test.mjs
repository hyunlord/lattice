import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, parseLens } from '../dist/index.js';

function project(config) {
    const text = JSON.stringify({ schemaVersion: 1, name: 'Presentation', ...config });
    const source = { path: '.lattice/lens.json', text, contentHash: createHash('sha256').update(text).digest('hex') };
    return applyLens([], parseLens(source), source).presentation;
}

test('kind metadata reaches presentation without exposing record selection rules', () => {
    assert.deepEqual(project({ kinds: [{ id: 'entry', label: 'Entries', files: ['data/*.json'], records: '/entries', idField: 'key', nameField: 'title', references: false, columns: ['title', 'cost'], hidden: true }] }), {
        kinds: [{ id: 'entry', label: 'Entries', columns: ['title', 'cost'], hidden: true }],
    });
});

test('explicit presentation overrides individual metadata fields and retains extra kinds and order', () => {
    assert.deepEqual(project({
        kinds: [{ id: 'entry', label: 'Entries', files: [], columns: ['cost'], hidden: true }, { id: 'fallback', label: 'Fallback', files: [] }],
        presentation: { name: 'Configured', kinds: [{ id: 'synthetic', label: 'Synthetic' }, { id: 'entry', columns: [], hidden: false }] },
    }), { name: 'Configured', kinds: [{ id: 'synthetic', label: 'Synthetic' }, { id: 'entry', columns: [], hidden: false, label: 'Entries' }, { id: 'fallback', label: 'Fallback' }] });
});

test('fully explicit presentation retains its exact JSON representation', () => {
    const presentation = { description: 'Existing map', kinds: [{ columns: ['name'], label: 'Override', id: 'entry', hidden: false }], name: 'Legacy', facets: { status: { label: 'Status' } } };
    const result = project({ kinds: [{ id: 'entry', label: 'Entries', files: [], columns: ['cost'], hidden: true }], presentation });
    assert.equal(JSON.stringify(result), JSON.stringify(presentation));
    assert.deepEqual(project({ kinds: [] }), {});
});
