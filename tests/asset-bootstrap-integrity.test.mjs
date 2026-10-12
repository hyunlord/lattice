import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';
import ts from 'typescript';
import { archiveModules, bootstrapScript } from '../tools/viewer-archives.mjs';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const source = bootstrapScript(transpile('../viewer/packed-hash.ts'), transpile('../viewer/asset-bootstrap.ts'));
const [pack] = archiveModules([['app.js', 'globalThis.executed = true;']]);

function start(crypto, bytes = pack.bytes) {
    const events = [], maps = [], messages = [];
    let finish;
    const done = new Promise(resolve => { finish = resolve; });
    const main = { replaceChildren(message) { messages.push(message.textContent); finish(); } };
    const context = createContext({
        crypto, Error, TextDecoder, Uint8Array, Blob, AbortSignal,
        URL: class extends URL { static createObjectURL() { events.push('module'); return 'blob:verified'; } },
        DecompressionStream: class extends DecompressionStream { constructor(format) { super(format); events.push('decode'); } },
        HTMLScriptElement: { supports: () => true },
        document: {
            baseURI: 'https://example.test/map/',
            querySelector: () => null,
            getElementById: () => main,
            createElement: () => ({ setAttribute() { }, addEventListener() { } }),
            head: { append(map) { maps.push(JSON.parse(map.textContent)); } },
        },
        fetch: async url => {
            const body = url.pathname.endsWith('manifest.json') ? JSON.stringify({ version: 1, entry: 'app.js', packs: [pack.entry] }) : bytes;
            return new Response(body);
        },
    });
    // This VM tests the integrity boundary, not browser import-map execution.
    // A verified archive reaches module import and fails there without VM modules enabled.
    new Script(source).runInContext(context);
    return { events, maps, messages, done };
}

test('bootstrap prefers native SHA-256 and waits for verification before interpreting modules', async () => {
    let release, nativeCalls = 0;
    const pending = new Promise(resolve => { release = resolve; });
    const state = start({
        subtle: {
            async digest(algorithm, bytes) {
                nativeCalls++; assert.equal(algorithm, 'SHA-256');
                await pending; return webcrypto.subtle.digest(algorithm, bytes);
            }
        }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nativeCalls, 1);
    assert.deepEqual(state.events, []);
    assert.deepEqual(state.maps, []);
    release(); await state.done;
    assert.deepEqual(state.events, ['decode', 'module']);
    assert.equal(state.maps[0].imports['lattice-viewer/app.js'], 'blob:verified');
    assert.doesNotMatch(state.messages.join(''), /integrity mismatch/u);
});

for (const [name, crypto] of [['missing crypto', undefined], ['missing subtle', {}]]) {
    test(`bootstrap verifies the same archive with synchronous fallback when ${name}`, async () => {
        const state = start(crypto); await state.done;
        assert.deepEqual(state.events, ['decode', 'module']);
        assert.equal(state.maps.length, 1);
    });
}

for (const [name, crypto] of [['native', webcrypto], ['fallback', undefined]]) {
    test(`bootstrap rejects corrupted bytes before decoding with ${name} SHA-256`, async () => {
        const bytes = Uint8Array.from(pack.bytes); bytes[bytes.length - 1] ^= 1;
        const state = start(crypto, bytes); await state.done;
        assert.match(state.messages.join(''), /Viewer asset integrity mismatch/u);
        assert.deepEqual(state.events, []); assert.deepEqual(state.maps, []);
    });
}

test('bootstrap fails visibly rather than falling back when native digest rejects', async () => {
    const state = start({ subtle: { async digest() { throw new Error('native digest rejected'); } } });
    await state.done;
    assert.match(state.messages.join(''), /native digest rejected/u);
    assert.deepEqual(state.events, []); assert.deepEqual(state.maps, []);
});
