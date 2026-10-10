import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text = '') => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('CommonJS literal imports and module.exports reexports resolve with exact call evidence', () => {
    for (const extension of ['js', 'cjs', 'ts', 'cts']) {
        const source = module(`index.${extension}`, `const a = require('./lib/a');\nmodule.exports = require("./lib/b");\nfunction load() { return require(\n './lib/a'\n); }\nrequire('external-package');`);
        const result = resolveModuleLinks([source, module('lib/a.js'), module('lib/b/index.js')]);
        assert.deepEqual(result.edges.map(edge => [edge.target, edge.sources[0].line, edge.attributes.importForm]), [
            ['module:lib/a.js', 1, 'require'], ['module:lib/b/index.js', 2, 'require'], ['module:lib/a.js', 3, 'require'],
        ]);
        assert.deepEqual(result.diagnostics.map(item => [item.specifier, item.code]), [['external-package', 'external-or-unresolved-module']]);
    }
});

test('dynamic require is diagnosed without edges; comments, strings, templates and property calls are not calls', () => {
    const source = module('index.js', `// require('./a')\nconst text = "require('./a')";\nconst template = \`require('./a')\`;\nobj.require('./a'); require.resolve('./a');\nrequire(name);\nrequire('./' + name);\nrequire(\`./a\`);\nrequire('./a', options);\nmodule.exports = require('./a');`);
    const result = resolveModuleLinks([source, module('a.js')]);
    assert.deepEqual(result.edges.map(edge => edge.sources[0].line), [9]);
    assert.deepEqual(result.diagnostics.map(item => [item.code, item.source.line]), [5, 6, 7, 8].map(line => ['dynamic-module-reference', line]));
});

test('explicit require bindings suppress uncertain loader calls instead of inventing dependencies', () => {
    for (const text of [
        `function load(require) { return require('./a'); }`,
        `const require = custom; require('./a');`,
        `const load = require => require('./a');`,
        `const { require } = custom; require('./a');`,
        `import require from './custom'; require('./a');`,
    ]) {
        const result = resolveModuleLinks([module('index.js', text), module('a.js')]);
        assert.equal(result.edges.length, 0);
        assert.ok(result.diagnostics.some(item => item.code === 'shadowed-module-reference'));
    }
});

test('CommonJS shares selected-source resolution without relaxing ESM or ambiguous target boundaries', () => {
    const result = resolveModuleLinks([
        module('index.ts', `import './esm';\nmodule.exports = { run: require('./local.js') };\nrequire('./missing');\nrequire('./choice');`),
        module('esm.ts'), module('local.ts'), module('choice.ts'), module('choice.js'),
    ]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:esm.ts', 'module:local.ts']);
    assert.deepEqual(result.diagnostics.map(item => [item.specifier, item.code]), [
        ['./missing', 'unresolved-local-module'], ['./choice', 'ambiguous-module'],
    ]);
});
