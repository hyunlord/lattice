import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createContext, Script } from 'node:vm';
import { bundleModules } from '../tools/viewer-bundle.mjs';

function execute(modules) {
    const source = bundleModules(modules);
    assert.equal(typeof source, 'string');
    const events = [];
    const context = createContext({
        Event, CustomEvent,
        document: { currentScript: { dispatchEvent(event) { events.push(event); } } },
    });
    new Script(source).runInContext(context);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'lattice-assets-ready');
    return context;
}

test('compiler bundle preserves DAG exports, reexports, lazy identity and single execution', async () => {
    const context = execute([
        ['app.js', 'import { value } from "./reexport.js";globalThis.initial=value;globalThis.later=()=>import("./lazy.js");'],
        ['base.js', 'export const value={name:"shared"};'],
        ['reexport.js', 'export { value } from "./base.js";'],
        ['lazy.js', 'import { value } from "./base.js";globalThis.runs=(globalThis.runs??0)+1;export { value };'],
    ]);
    assert.equal(context.runs, undefined);
    const [first, second] = await Promise.all([context.later(), context.later()]);
    assert.equal(first, second);
    assert.equal(Object.isFrozen(first), true);
    assert.throws(() => { first.value = 4; }, TypeError);
    assert.equal(first.value, context.initial);
    assert.equal(context.runs, 1);
});

test('compiler bundle preserves asynchronous rejected imports and caches factory failure', async () => {
    const context = execute([
        ['app.js', 'globalThis.later=()=>import("./broken.js");'],
        ['broken.js', 'globalThis.runs=(globalThis.runs??0)+1;throw new Error("factory failed");export const value=1;'],
    ]);
    const first = context.later();
    assert.equal(context.runs, undefined);
    await assert.rejects(first, /factory failed/u);
    await assert.rejects(context.later(), /factory failed/u);
    assert.equal(context.runs, 1);
});

for (const [label, modules] of [
    ['cycle', [['app.js', 'import "./peer.js";export function ready(){return 1;}'], ['peer.js', 'import {ready} from "./app.js";export const value=ready();']]],
    ['top-level await', [['app.js', 'await Promise.resolve();export const value=1;']]],
    ['import meta', [['app.js', 'export const value=import.meta.url;']]],
    ['nonliteral import', [['app.js', 'export const later=name=>import(name);']]],
    ['mutable exported variable', [['app.js', 'export let value=1;export function change(){value++;}']]],
    ['mutable exported alias', [['app.js', 'let value=1;export {value};']]],
]) {
    test(`compiler bundle delegates ${label} to the existing native archive path`, () => {
        assert.equal(bundleModules(modules), null);
    });
}

test('compiler bundle reports entry failure through its script without global AMD names', () => {
    const events = [];
    const source = bundleModules([['app.js', 'throw new Error("entry failed");export const value=1;']]);
    assert.equal(typeof source, 'string');
    const context = createContext({ Event, CustomEvent, document: { currentScript: { dispatchEvent(event) { events.push(event); } } } });
    new Script(source).runInContext(context);
    assert.equal(events[0].type, 'lattice-assets-error');
    assert.match(events[0].detail.message, /entry failed/u);
    assert.equal(context.define, undefined);
    assert.equal(context.require, undefined);
});

test('compiler bundle preserves UTF-8 source text and omits unreachable modules', () => {
    const context = execute([
        ['app.js', 'globalThis.text="나무 🌳";export const value="\uD800";'],
        ['unused.js', 'throw new Error("unreachable");export const value=1;'],
    ]);
    assert.equal(context.text, '나무 🌳');
});

test('compiler bundle keeps dependency side-effect order and namespace/default/export-star values', () => {
    const context = execute([
        ['app.js', 'import first from "./first.js";import * as names from "./barrel.js";globalThis.result=[first,names.second,names.named];globalThis.order.push("app");'],
        ['first.js', 'globalThis.order=["first"];export default "default-value";'],
        ['second.js', 'import "./first.js";globalThis.order.push("second");export const second=2;export const named={value:3};'],
        ['barrel.js', 'export * from "./second.js";'],
    ]);
    assert.deepEqual(Array.from(context.order), ['first', 'second', 'app']);
    assert.equal(context.result[0], 'default-value');
    assert.equal(context.result[1], 2);
    assert.equal(context.result[2].value, 3);
});

for (const [label, source] of [
    ['dynamic import options', 'export const later=()=>import("./peer.js",{with:{type:"json"}});'],
    ['static import attributes', 'import value from "./peer.js" with {type:"json"};export {value};'],
]) {
    test(`compiler bundle refuses ${label} rather than discarding semantics`, () => {
        assert.equal(bundleModules([['app.js', source], ['peer.js', 'export default 1;']]), null);
    });
}

for (const [label, modules] of [
    ['ambiguous export-star', [['app.js', 'import * as value from "./barrel.js";globalThis.value=value;'], ['barrel.js', 'export * from "./a.js";export * from "./b.js";'], ['a.js', 'export const value=1;'], ['b.js', 'export const value=2;']]],
    ['missing named import', [['app.js', 'import {missing} from "./peer.js";globalThis.value=missing;'], ['peer.js', 'export const value=1;']]],
    ['missing named reexport', [['app.js', 'export {missing} from "./peer.js";'], ['peer.js', 'export const value=1;']]],
]) {
    test(`compiler bundle retains native linking for ${label}`, () => {
        assert.equal(bundleModules(modules), null);
    });
}
