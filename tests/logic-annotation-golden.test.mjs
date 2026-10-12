import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { canonicalJson } from '../dist/core/canonical.js';
import { parseLogicFacts } from '../bin/logic-parser.mjs';

const inputs = JSON.parse(readFileSync(new URL('./fixtures/logic-annotation-inputs.json', import.meta.url), 'utf8'));
const golden = JSON.parse(readFileSync(new URL('./fixtures/logic-annotation-golden.json', import.meta.url), 'utf8'));
const hash = text => createHash('sha256').update(text).digest('hex');
for (const { language, path, text } of inputs) {
    test(`annotation pruning preserves complete baseline LogicFacts for ${language}`, () => {
        // Given a literal pre-change golden, when parsing its source, then the complete facts hash stays identical.
        const expected = golden.fixtures.find(fixture => fixture.path === path);
        assert.equal(hash(text), expected.inputHash);
        const facts = parseLogicFacts({ path, text, contentHash: expected.inputHash }, language);
        assert.equal(facts.supported, true);
        assert.deepEqual(facts.diagnostics, []);
        assert.ok(facts.definitions.length > 0);
        assert.equal(hash(canonicalJson(facts)), expected.factsHash);
    });
}
