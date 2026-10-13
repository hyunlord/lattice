import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { repositorySpecializations } from '../tools/check-benchmarks.mjs';
import { javascriptEvidence } from '../dist/adapters/code-evidence.js';

test('expanded corpus identities remain forbidden in production', () => {
    const repositories = JSON.parse(readFileSync(new URL('../docs/benchmarks/l11/repositories.json', import.meta.url), 'utf8')).repositories;
    for (const entry of repositories) assert(repositorySpecializations('sample.ts', `const target = '${entry.repository}';`, repositories).length > 0);
});

test('unknown external test-like APIs remain explicitly uncertain and require callback shape', () => {
    for (const packageName of ['vitest', 'another-runner']) {
        assert.deepEqual(javascriptEvidence(`import { test as verify } from '${packageName}';\nverify('works', () => {});`).verificationNames, [{ name: 'works', line: 2, kind: 'test-registration-candidate' }]);
        assert.deepEqual(javascriptEvidence(`import { test } from '${packageName}';\ntest('not a registration');`).verificationNames, []);
    }
    assert.deepEqual(javascriptEvidence("import {test} from './predicate';\ntest('ordinary local call', () => {});").verificationNames, []);
});
