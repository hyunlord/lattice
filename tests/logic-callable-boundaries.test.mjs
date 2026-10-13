import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractionCache } from '../bin/extraction-cache.mjs';
import { decodeLogicFacts } from '../bin/logic-facts-decode.mjs';
import { logicParserVersion, parseLogicFacts } from '../bin/logic-parser.mjs';

const facts = (language, text) => parseLogicFacts({ path: `fixture.${language}`, text, contentHash: createHash('sha256').update(text).digest('hex') }, language);
const pairs = fact => fact.calls.map(call => [fact.definitions.find(definition => definition.id === call.caller)?.name ?? '<module>', call.name]);
for (const [language, code] of [
    ['go', 'package main\nfunc deferred() {}\nfunc direct() {}\nfunc outer(){ callback := func(){ deferred() }; direct(); _ = callback }'],
    ['kotlin', 'fun deferred() {}\nfun direct() {}\nfun outer(){ val callback = { deferred() }; direct() }'],
    ['csharp', 'class App { static void Deferred(){} static void Direct(){} static void Outer(){ System.Action callback = () => Deferred(); Direct(); } }'],
    ['rust', 'fn deferred() {} fn direct() {} fn outer(){ let callback = || deferred(); direct(); }'],
    ['python', 'def deferred(): pass\ndef direct(): pass\ndef outer():\n    callback = lambda: deferred()\n    direct()\n'],
    ['java', 'class App { static void deferred(){} static void direct(){} static void outer(){ Runnable callback = () -> deferred(); direct(); } }'],
]) test(`${language} does not assign deferred anonymous calls to the enclosing function`, () => {
    const fact = facts(language, code);
    assert.deepEqual(fact.diagnostics, []);
    assert.deepEqual(pairs(fact), [[language === 'csharp' ? 'Outer' : 'outer', language === 'csharp' ? 'Direct' : 'direct']]);
});

test('C# anonymous methods and nested named declarations stay outside enclosing facts', () => {
    const fact = facts('csharp', 'class App { static void Direct(){} static void Outer(){ System.Action callback = delegate(){ void Nested(){ Direct(); } Nested(); }; Direct(); } }');
    assert.deepEqual(fact.diagnostics, []);
    assert.deepEqual(pairs(fact), [['Outer', 'Direct']]);
    assert.equal(fact.definitions.some(definition => definition.name === 'Nested'), false);
});

test('deferred local bindings and imports cannot leak into their enclosing function', () => {
    const fact = facts('rust', 'fn outer(){ let callback = || { use crate::worker::run; let direct = replacement; fn nested(){} }; direct(); }');
    assert.deepEqual(fact.diagnostics, []);
    assert.deepEqual(fact.imports, []);
    assert.equal(fact.definitions.some(definition => definition.name === 'nested'), false);
    assert.equal(fact.definitions.find(definition => definition.name === 'outer').bindings.includes('direct'), false);
});

test('mapped JavaScript arrows, function expressions and named nested functions retain their own caller identity', () => {
    const fact = facts('javascript', 'function helper(){} function outer(){ const arrow = () => helper(); const expression = function(){helper()}; function nested(){helper()} helper(); }');
    assert.deepEqual(pairs(fact), [['arrow', 'helper'], ['expression', 'helper'], ['nested', 'helper'], ['outer', 'helper']]);
});

test('mapped JavaScript callable locals do not leak require imports or CommonJS exports', () => {
    const fact = facts('javascript', 'function helper(){} const callback = () => { const worker = require("./worker"); module.exports = helper; }; function outer(){worker.run()}');
    assert.deepEqual(fact.definitions.find(definition => definition.name === 'helper').exportNames, []);
    const imported = fact.imports.find(item => item.local === 'worker');
    const callback = fact.definitions.find(definition => definition.name === 'callback');
    assert.ok(imported.scopeStart >= callback.start);
    assert.ok(imported.scopeEnd <= callback.end);
});


test('corrected callable ownership cannot reuse the previous parser semantic cache', t => {
    const root = mkdtempSync(join(tmpdir(), 'lattice-callable-cache-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const text = 'def helper(): pass\ndef outer():\n    callback = lambda: helper()\n';
    const source = { path: 'app.py', text, contentHash: createHash('sha256').update(text).digest('hex') };
    const correct = parseLogicFacts(source, 'python'), outer = correct.definitions.find(definition => definition.name === 'outer');
    const stale = { ...correct, calls: [{ caller: outer.id, name: 'helper', receiver: '', line: 3, endLine: 3, start: 61, callbackIds: [], route: false }] };
    const cache = extractionCache(root);
    cache.extract(source, { format: 'logic', selector: logicParserVersion.replace(/\/logic-\d+\//u, '/logic-1/') }, () => stale, decodeLogicFacts);
    const result = cache.extract(source, { format: 'logic', selector: logicParserVersion }, () => parseLogicFacts(source, 'python'), decodeLogicFacts);
    assert.deepEqual(result.calls, []);
    assert.equal(cache.stats.parsed, 2);
    assert.equal(cache.stats.reused, 0);
});
