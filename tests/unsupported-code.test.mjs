import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRepository } from '../bin/build.mjs';

test('unsupported source languages retain file inventory and explicit limits without inferred calls', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-unsupported-')));
    try {
        execFileSync('git', ['init', '--quiet', root]);
        writeFileSync(join(root, 'native.c'), 'int main() { return work(); }');
        writeFileSync(join(root, 'library.cpp'), 'void run() { work(); }');
        writeFileSync(join(root, 'index.js'), 'export function run() {}');
        const result = buildRepository({ root, noLens: true });
        for (const path of ['native.c', 'library.cpp']) {
            const node = result.graph.nodes.find(node => node.id === `module:${path}`);
            assert.equal(node?.attributes.extraction, 'file-only');
            assert.ok(!result.graph.edges.some(edge => edge.kind === 'calls' && edge.sources.some(source => source.path === path)));
        }
        assert.deepEqual(result.presentation.inputDiagnostics.filter(item => item.code === 'unsupported-language').map(item => [item.language, item.fileCount]), [['c', 1], ['cpp', 1]]);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
