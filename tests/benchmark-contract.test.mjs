import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { checkBenchmarkContract, repositorySpecializations } from '../tools/check-benchmarks.mjs';
const repos = [{ repository: 'sample/distinct-project', commit: 'abc123fixed' }, { repository: 'pallets/click', commit: 'xyz987fixed' }, { repository: 'dotnet/runtime', commit: 'ghi456fixed' }];
test('benchmark guard rejects identifiers, pinned SHAs and repository-specific literals', () => {
    for (const text of ['const name="distinct-project";', '// sample/distinct-project', '// abc123fixed', 'const repository="click";', 'const repository="runtime";']) assert(repositorySpecializations('sample.ts', text, repos).length > 0);
});
test('benchmark guard permits standard DOM events and ordinary runtime terminology', () => {
    assert.deepEqual(repositorySpecializations('sample.ts', "button.addEventListener('click', open); button.removeEventListener('click', open); button.click(); // Static calls are not runtime execution.\nimport './runtime.js';", repos), []);
});

test('click exemption covers only standard event arguments, never repository paths or identifiers', () => {
    for (const text of ['const root="/repos/click/src";', 'const click = repository;', '// special case for click', 'button.addEventListener("click", () => load("/repos/click"));', 'register("click", open);']) assert(repositorySpecializations('sample.ts', text, repos).length > 0, text);
    assert(repositorySpecializations('viewer/click.ts', 'export {};', repos).length > 0);
});

test('benchmark guard checks repository paths independently of checkout location', () => {
    const parent = mkdtempSync(join(tmpdir(), 'lattice-guard-')), root = join(parent, 'click');
    try {
        for (const path of ['src', 'cli', 'viewer', 'browser']) mkdirSync(join(root, path), { recursive: true });
        symlinkSync(resolve('docs'), join(root, 'docs'), 'dir');
        writeFileSync(join(root, 'src/model.ts'), 'export const version = 1;');
        assert.doesNotThrow(() => checkBenchmarkContract(root));
        writeFileSync(join(root, 'viewer/click.ts'), 'export {};');
        assert.throws(() => checkBenchmarkContract(root), /Benchmark-specific production code/);
    } finally { rmSync(parent, { recursive: true, force: true }); }
});
