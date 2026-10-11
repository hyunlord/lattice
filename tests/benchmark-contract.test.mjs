import assert from 'node:assert/strict';
import test from 'node:test';
import { repositorySpecializations } from '../tools/check-benchmarks.mjs';
const repos = [{ repository: 'sample/distinct-project', commit: 'abc123fixed' }, { repository: 'pallets/click', commit: 'xyz987fixed' }, { repository: 'dotnet/runtime', commit: 'ghi456fixed' }];
test('benchmark guard rejects identifiers, pinned SHAs and repository-specific literals', () => {
    for (const text of ['const name="distinct-project";', '// sample/distinct-project', '// abc123fixed', 'const repository="click";', 'const repository="runtime";']) assert(repositorySpecializations('sample.ts', text, repos).length > 0);
});
test('benchmark guard permits standard DOM events and ordinary runtime terminology', () => {
    assert.deepEqual(repositorySpecializations('sample.ts', "button.addEventListener('click', open); button.removeEventListener('click', open); // Static calls are not runtime execution.\nimport './runtime.js';", repos), []);
});
