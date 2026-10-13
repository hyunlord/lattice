import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, openSync, writeSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createGraph } from '../dist/index.js';
import { digest } from '../bin/storage.mjs';

test('repeated full evidence loads under a bounded heap without dropping graph data', t => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-evidence-heap-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const sources = Array.from({ length: 300 }, (_, i) => ({ path: 'src/module.ts', line: i + 1, pointer: `/function/${i}`, contentHash: 'a'.repeat(64), revision: 'r'.repeat(40), url: `https://example.invalid/source/${i}` }));
    const graph = createGraph({ repository: { name: 'fixture', dirty: false, sourceFingerprint: 'b'.repeat(64) }, lensDigest: null, adapterVersions: {}, inputs: [], edges: [], facets: [], findings: [], views: [], snapshots: [], nodes: Array.from({ length: 1000 }, (_, i) => ({ id: `node:${i}`, kind: 'module', name: `Module ${i}`, attributes: {}, sources })) }, digest);
    const path = join(root, 'graph.json'), fd = openSync(path, 'w');
    try {
        writeSync(fd, '{'); let separator = '';
        for (const [key, value] of Object.entries(graph)) {
            writeSync(fd, `${separator}${JSON.stringify(key)}:`); separator = ',';
            if (Array.isArray(value)) {
                writeSync(fd, '[');
                for (let i = 0; i < value.length; i++) writeSync(fd, `${i ? ',' : ''}${JSON.stringify(value[i])}`);
                writeSync(fd, ']');
            } else writeSync(fd, JSON.stringify(value));
        }
        writeSync(fd, '}');
    } finally { closeSync(fd); }
    const reader = new URL('../bin/storage.mjs', import.meta.url).href;
    const script = `import {readGraph} from ${JSON.stringify(reader)}; const graph=readGraph(process.argv[1],{memoize:false}); console.log(JSON.stringify({hash:graph.hash,nodes:graph.nodes.length,sources:graph.nodes.reduce((n,node)=>n+node.sources.length,0)}));`;
    const result = spawnSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '-e', script, path], { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { hash: graph.hash, nodes: 1000, sources: 300000 });
});
