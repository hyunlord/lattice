import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { applyLens, extractJson, parseLens } from '../dist/index.js';

const input = (path, value) => { const text = JSON.stringify(value, null, 2); return { path, text, contentHash: createHash('sha256').update(text).digest('hex') }; };
const get = (from, ...path) => ({ op: 'get', from, path });
const data = input('records.json', [{ id: 'a', intended: 'planned', actual: 'supported' }]);
const finding = { id: 'description', query: {}, metrics: {}, template: 'Description' };
const run = (rules, derived = []) => {
    const lens = input('.lattice/lens.json', { schemaVersion: 1, name: 'Descriptions', kinds: [], derived, findings: rules });
    return applyLens(extractJson(data), parseLens(lens), lens);
};

test('finding descriptions compose target-derived expressions and retain their input evidence', () => {
    const describe = key => ({ op: 'join', input: { op: 'map', input: get('vars', 'targetValues'), value: get('item', 'derived', key) }, separator: ', ' });
    const result = run([{ ...finding, intent: describe('plan'), implementation: describe('support') }], [
        { id: 'plan', scope: 'node', value: get('node', 'intended') },
        { id: 'support', scope: 'node', value: get('node', 'actual') },
    ]).findings[0];
    assert.equal(result.intent, 'planned');
    assert.equal(result.implementation, 'supported');
    for (const pointer of ['/0/intended', '/0/actual']) assert.ok(result.sources.some(source => source.path === data.path && source.pointer === pointer && source.contentHash === data.contentHash));
    const narrativeOnly = run([{ ...finding, intent: { op: 'join', input: get('graph', 'nodes', '*', 'intended'), separator: ', ' } }]).findings[0];
    assert.ok(narrativeOnly.sources.some(source => source.path === data.path && source.pointer === '/0/intended'));
});

test('finding descriptions preserve literals and omit unknown expression results', () => {
    const results = run([
        { ...finding, intent: 'Literal intent', implementation: '' },
        { ...finding, id: 'missing', intent: get('vars', 'missing'), implementation: { op: 'literal', value: null } },
        { ...finding, id: 'null', intent: null },
    ]).findings;
    assert.equal(results[0].intent, 'Literal intent');
    assert.equal(results[0].implementation, '');
    for (const result of results.slice(1)) {
        assert.equal(Object.hasOwn(result, 'intent'), false);
        assert.equal(Object.hasOwn(result, 'implementation'), false);
    }
});

test('finding descriptions reject invalid configurations and non-text results at their lens field', () => {
    for (const key of ['intent', 'implementation']) for (const value of [42, false, [], {}, { op: 'literal', value: ['text'] }, { op: 'literal', value: 3 }]) {
        const rule = { ...finding, [key]: value };
        const lens = input('.lattice/lens.json', { schemaVersion: 1, name: 'Invalid', kinds: [], findings: [rule] });
        const expectedLine = lens.text.split('\n').findIndex(line => line.includes(`"${key}":`)) + 1;
        assert.throws(() => applyLens(extractJson(data), parseLens(lens), lens), error => error.name === 'DataInputError' && error.path === lens.path && error.line === expectedLine && error.reason.includes(`/findings/0/${key}`));
    }
});
