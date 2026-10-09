import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text = '') => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('relative imports with dotted basenames resolve selected TypeScript files and directory indexes', () => {
    const result = resolveModuleLinks([
        module('src/app.ts', "import '../engine/model.types';\nimport './locale.fr';\nimport './feature.v2';"),
        module('engine/model.types.ts'), module('src/locale.fr.ts'), module('src/feature.v2/index.ts'),
    ]);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:engine/model.types.ts', 'module:src/locale.fr.ts', 'module:src/feature.v2/index.ts']);
    assert.deepEqual(result.edges.map(edge => edge.sources[0].line), [1, 2, 3]);
});

test('dotted resolution retains ambiguity, explicit extensions, JS aliases, and selected-source boundaries', () => {
    const result = resolveModuleLinks([
        module('src/app.ts', "import './choice.types';\nimport './literal.ts';\nimport './compiled.js';\nimport './absent.types';\nimport '../../outside.types';"),
        module('src/choice.types.ts'), module('src/choice.types.tsx'),
        module('src/literal.ts.ts'), module('src/compiled.ts'), module('outside.types.ts'),
    ]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:src/compiled.ts']);
    assert.deepEqual(result.diagnostics.map(item => [item.specifier, item.code]), [
        ['./choice.types', 'ambiguous-module'], ['./literal.ts', 'unresolved-local-module'],
        ['./absent.types', 'unresolved-local-module'], ['../../outside.types', 'unresolved-local-module'],
    ]);
});
