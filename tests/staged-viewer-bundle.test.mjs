import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script, createContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';
import { viewerArchivePlan } from '../tools/viewer-archives.mjs';

const modules = [
    ['app.js', 'import { value } from "./base.js";globalThis.initial=value;globalThis.later=()=>import("./lazy.js");'],
    ['base.js', 'export const value={name:"shared"};'],
    ['lazy.js', 'import {value} from "./base.js";globalThis.runs=(globalThis.runs??0)+1;export {value};'],
];
const text = (plan, stage) => Buffer.concat(plan.packs.filter(pack => pack.entry.stage === stage).map(pack => gunzipSync(pack.bytes))).toString();
function fixture(transform = value => value, transportError) {
    const plan = viewerArchivePlan(modules);
    assert.equal(plan.version, 3);
    const events = []; let requests = 0;
    const context = createContext({ Event, CustomEvent, document: { currentScript: undefined } });
    const execute = (source, listener) => { context.document.currentScript = { dataset: {}, dispatchEvent: listener }; new Script(source).runInContext(context); };
    execute(text(plan, 'initial'), event => {
        events.push(event);
        if (event.type === 'lattice-assets-ready') event.detail(async () => {
            requests++;
            if (transportError) throw transportError;
            let register;
            execute(text(plan, 'deferred'), event => { register = event.detail; });
            return transform(register);
        });
    });
    return { context, events, requests: () => requests };
}
test('staged plan puts only static closure in initial chunks and keeps bounded complete output', () => {
    const plan = viewerArchivePlan(modules);
    assert.equal(plan.version, 3);
    assert.deepEqual(plan.initial, ['app.js', 'base.js']);
    assert.deepEqual(plan.deferred, ['lazy.js']);
    assert.doesNotMatch(text(plan, 'initial'), /define\("lazy"/u);
    assert.match(text(plan, 'deferred'), /define\("lazy"/u);
    for (const pack of plan.packs) { assert.ok(pack.entry.encoded <= 262144); assert.ok(pack.entry.decoded <= 262144); }
});
test('staged runtime loads once on demand and preserves shared namespace identity', async () => {
    const value = fixture();
    assert.equal(value.requests(), 0); assert.equal(value.context.runs, undefined);
    const [a, b] = await Promise.all([value.context.later(), value.context.later()]);
    assert.equal(value.requests(), 1); assert.equal(a, b); assert.equal(a.value, value.context.initial);
    assert.equal(value.context.runs, 1); assert.equal(Object.isFrozen(a), true);
});
test('failed deferred transport is sticky and preserves error identity', async () => {
    const error = new Error('transport unavailable'), value = fixture(undefined, error);
    for (let i = 0; i < 2; i++) await assert.rejects(value.context.later(), actual => actual === error);
    assert.equal(value.requests(), 1);
});
test('incomplete or duplicate deferred registration never merges partial factories', async () => {
    for (const mutate of [() => define => { }, register => define => { register(define); register(define); }, () => define => define('app', [], () => { })]) {
        const value = fixture(mutate);
        await assert.rejects(value.context.later(), /batch|Duplicate|module/u);
        await assert.rejects(value.context.later());
        assert.equal(value.context.runs, undefined); assert.equal(value.requests(), 1);
    }
});
test('no dynamic modules retains v2 and static cycles retain v1', () => {
    assert.equal(viewerArchivePlan([['app.js', 'export const value=1;']]).version, 2);
    assert.equal(viewerArchivePlan([['app.js', 'import "./peer.js";'], ['peer.js', 'import "./app.js";']]).version, 1);
});
test('initial import microtask sees synchronous handoff; no handoff fails visibly', async () => {
    const plan = viewerArchivePlan([['app.js', 'globalThis.pending=import("./lazy.js");'], ['lazy.js', 'export const value=5;']]);
    const events = [], context = createContext({ Event, CustomEvent, document: { currentScript: undefined } });
    let requests = 0;
    context.document.currentScript = {
        dispatchEvent(event) {
            events.push(event);
            if (event.type === 'lattice-assets-ready') event.detail(async () => {
                requests++;
                let register;
                context.document.currentScript = { dispatchEvent(event) { register = event.detail; } };
                new Script(text(plan, 'deferred')).runInContext(context);
                return register;
            });
        }
    };
    new Script(text(plan, 'initial')).runInContext(context);
    assert.equal(requests, 0); assert.equal((await context.pending).value, 5); assert.equal(requests, 1);
    for (const install of [() => { }, event => event.detail(null), event => { event.detail(() => { }); event.detail(() => { }); }]) {
        const failures = [], isolated = createContext({ Event, CustomEvent, document: { currentScript: { dispatchEvent(event) { if (event.type === 'lattice-assets-ready') install(event); else failures.push(event); } } } });
        const safe = viewerArchivePlan(modules);
        new Script(text(safe, 'initial')).runInContext(isolated);
        assert.match(failures[0].detail.message, /handoff/u);
    }
});
test('lexical compiler helpers conservatively retain v2', () => {
    const plan = viewerArchivePlan([['app.js', 'export * from "./base.js";globalThis.later=()=>import("./lazy.js");'], ['base.js', 'export const value=1;'], ['lazy.js', 'export const value=2;']]);
    assert.equal(plan.version, 2);
});
test('cycles below dynamic roots still use native v1 archives', () => {
    const plan = viewerArchivePlan([['app.js', 'globalThis.later=()=>import("./a.js");'], ['a.js', 'import "./b.js";'], ['b.js', 'import "./a.js";']]);
    assert.equal(plan.version, 1);
});
test('different deferred IDs share registration and cached factory errors', async () => {
    const plan = viewerArchivePlan([
        ['app.js', 'globalThis.a=()=>import("./a.js");globalThis.b=()=>import("./b.js");globalThis.bad=()=>import("./bad.js");'],
        ['a.js', 'export const value={};'], ['b.js', 'import {value} from "./a.js";export {value};'],
        ['bad.js', 'globalThis.badRuns=(globalThis.badRuns??0)+1;throw new Error("factory failure");export const value=1;'],
    ]);
    let requests = 0;
    const context = createContext({ Event, CustomEvent, document: { currentScript: undefined } });
    context.document.currentScript = {
        dispatchEvent(event) {
            if (event.type === 'lattice-assets-ready') event.detail(async () => {
                requests++; let register;
                context.document.currentScript = { dispatchEvent(event) { register = event.detail; } };
                new Script(text(plan, 'deferred')).runInContext(context); return register;
            });
        }
    };
    new Script(text(plan, 'initial')).runInContext(context);
    const [a, b] = await Promise.all([context.a(), context.b()]);
    assert.equal(requests, 1); assert.equal(a.value, b.value);
    let first;
    await assert.rejects(context.bad(), error => { first = error; return /factory failure/u.test(error.message); });
    await assert.rejects(context.bad(), error => error === first);
    assert.equal(context.badRuns, 1); assert.equal(requests, 1);
});
