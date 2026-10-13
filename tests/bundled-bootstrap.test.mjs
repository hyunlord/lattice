import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Script, createContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
import { bootstrapScript, viewerArchivePlan } from '../tools/viewer-archives.mjs';

const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const bootstrap = bootstrapScript(transpile('../viewer/packed-hash.ts'), transpile('../viewer/asset-bootstrap.ts'));
class DetailEvent extends Event {
    constructor(type, options) { super(type); this.detail = options?.detail; }
}

async function start(modules, transform = bytes => bytes) {
    const plan = viewerArchivePlan(modules), events = [], messages = [], objects = new Map();
    let context, finish;
    const done = new Promise(resolve => { finish = resolve; });
    class Element extends EventTarget {
        dataset = {};
        setAttribute() { }
        remove() { events.push('remove'); }
    }
    const document = {
        baseURI: 'https://example.test/project/', currentScript: null,
        querySelector(selector) { return selector.includes('lattice-generation') ? { content: 'generation-a' } : { nonce: 'approved' }; },
        getElementById: () => ({ replaceChildren(message) { messages.push(message.textContent); finish(); } }),
        createElement: () => new Element(),
        head: { append(script) {
            events.push('append');
            assert.equal(script.nonce, 'approved');
            objects.get(script.src).text().then(source => {
                document.currentScript = script;
                new Script(source).runInContext(context);
                script.dispatchEvent(new Event('load'));
                setImmediate(finish);
            }).catch(error => { messages.push(error.message); script.dispatchEvent(new Event('error')); });
        } },
    };
    context = createContext({
        document, crypto: webcrypto, TextDecoder, Uint8Array, Blob, AbortSignal, DecompressionStream,
        Event, CustomEvent: DetailEvent, Error,
        HTMLScriptElement: { supports: () => true },
        URL: class extends URL {
            static createObjectURL(blob) { const url = `blob:${objects.size}`; objects.set(url, blob); events.push('publish'); return url; }
            static revokeObjectURL(url) { assert.ok(objects.has(url)); events.push('revoke'); }
        },
        fetch: async url => {
            assert.equal(url.searchParams.get('generation'), 'generation-a');
            if (url.pathname.endsWith('manifest.json')) return new Response(JSON.stringify({ version: plan.version, entry: 'app.js', packs: plan.packs.map(pack => pack.entry) }));
            const pack = plan.packs.find(pack => url.pathname.endsWith(pack.entry.path));
            assert.ok(pack); return new Response(transform(pack.bytes));
        },
    });
    new Script(bootstrap).runInContext(context);
    await done;
    await new Promise(resolve => setImmediate(resolve));
    return { context, events, messages, plan };
}

test('verified bundle publishes one script and keeps dynamic factories lazy', async () => {
    const state = await start([
        ['app.js', 'globalThis.initial=true;globalThis.later=()=>import("./lazy.js");'],
        ['lazy.js', 'globalThis.lazyRuns=(globalThis.lazyRuns??0)+1;export const value=7;'],
    ]);
    assert.equal(state.plan.version, 2);
    assert.deepEqual(state.messages, []);
    assert.equal(state.context.initial, true);
    assert.equal(state.context.lazyRuns, undefined);
    assert.equal((await state.context.later()).value, 7);
    assert.deepEqual(state.events, ['publish', 'append', 'remove', 'revoke']);
});

test('bundle entry failure is visible and releases its temporary script URL', async () => {
    const state = await start([['app.js', 'throw new Error("entry failed");export const value=1;']]);
    assert.match(state.messages.join(''), /entry failed/u);
    assert.deepEqual(state.events, ['publish', 'append', 'remove', 'revoke']);
});

test('corrupted bundle publishes no script and executes no module', async () => {
    const state = await start([['app.js', 'globalThis.executed=true;export const value=1;']], bytes => {
        const corrupted = Uint8Array.from(bytes); corrupted[corrupted.length - 1] ^= 1; return corrupted;
    });
    assert.match(state.messages.join(''), /integrity mismatch/u);
    assert.equal(state.context.executed, undefined);
    assert.deepEqual(state.events, []);
});

test('bundle preserves repeated content-addressed chunks in original order', async () => {
    const value = 'x'.repeat(262144 * 4);
    const state = await start([['app.js', `globalThis.value=${JSON.stringify(value)};export const size=${value.length};`]]);
    assert.ok(new Set(state.plan.packs.map(pack => pack.entry.path)).size < state.plan.packs.length);
    assert.deepEqual(state.messages, []);
    assert.equal(state.context.value, value);
    assert.deepEqual(state.events, ['publish', 'append', 'remove', 'revoke']);
});
