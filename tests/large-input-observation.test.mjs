import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { observeRepository } from '../bin/observation.mjs';

test('unconfigured observation records oversized inputs while preserving other source files', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'lattice-large-input-')));
    try {
        execFileSync('git', ['init', '-q', root]);
        writeFileSync(join(root, 'large.cs'), 'x'.repeat(10 * 1024 * 1024 + 1));
        writeFileSync(join(root, 'main.py'), 'def main():\n    return 1\n');
        const result = observeRepository({ root, noLens: true });
        assert.equal(result.selected.some(entry => entry.path === 'main.py'), true);
        assert.deepEqual(result.inputDiagnostics.map(({ code, path, bytes }) => ({ code, path, bytes })), [{ code: 'oversized-input', path: 'large.cs', bytes: 10 * 1024 * 1024 + 1 }]);
        assert.equal(result.selected.some(entry => entry.path === 'large.cs'), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
});
