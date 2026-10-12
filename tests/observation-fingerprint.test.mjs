import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from '../dist/index.js';
import { digest } from '../bin/storage.mjs';
const implementation = await import('../bin/observation-fingerprint.mjs');
const input = (path, contentHash = path) => ({ path, contentHash, text: 'not fingerprinted' });
test('input list serialization reuses only identical ordered input identities and digest values', () => {
    assert.equal(typeof implementation.InputDigestList, 'function');
    const list = new implementation.InputDigestList(), a = input('a'), b = input('한글/"b');
    const first = list.encode([a, b]);
    assert.equal(first.canonical, canonicalJson([a, b].map(({ path, contentHash }) => ({ path, contentHash }))));
    assert.strictEqual(list.encode([a, b]), first);
    for (const changed of [[b, a], [a], [a, b, a], [a, { ...b }]]) assert.notStrictEqual(list.encode(changed), first);
    const beforeMutation = list.encode([a, b]); b.contentHash = 'changed';
    assert.notStrictEqual(list.encode([a, b]), beforeMutation);
    const beforePath = list.encode([a, b]); b.path = 'renamed';
    assert.notStrictEqual(list.encode([a, b]), beforePath);
});
test('memoized lists preserve the complete canonical fingerprint and fresh auxiliary fields', () => {
    assert.equal(typeof implementation.observationFingerprint, 'function');
    const list = new implementation.InputDigestList(), code = new implementation.InputDigestList();
    const inputs = [input('한글/"a'), input('z\n')], codeInputs = [inputs[1]];
    const fields = { repository: { commit: null, dirty: false, name: 'root', remoteUrl: null }, lens: null, inputDiagnostics: [], interpretations: [], draftInterpretations: [], media: null, graft: { path: 'graft/index', contentHash: 'one' } };
    const expected = (value, withCode) => digest(canonicalJson({ ...value, inputs: inputs.map(({ path, contentHash }) => ({ path, contentHash })), ...(withCode ? { codeInputs: codeInputs.map(({ path, contentHash }) => ({ path, contentHash })) } : {}) }));
    for (const withCode of [false, true]) {
        const run = value => implementation.observationFingerprint(value, list.encode(inputs), withCode ? code.encode(codeInputs) : undefined);
        assert.equal(run(fields), expected(fields, withCode));
        for (const field of ['repository', 'lens', 'interpretations', 'draftInterpretations', 'media', 'graft', 'inputDiagnostics']) {
            const changed = { ...fields, [field]: { changed: field } };
            assert.equal(run(changed), expected(changed, withCode)); assert.notEqual(run(changed), run(fields));
        }
    }
});
