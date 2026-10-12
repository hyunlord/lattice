import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { archiveModules, bootstrapScript } from '../tools/viewer-archives.mjs';

test('viewer archives rewrite only AST import targets and preserve bounded deterministic content', () => {
    const modules = [['app.js', 'import { value } from "./other.js"; export { value } from "./other.js"; const text="./other.js"; import("./other.js");'], ['other.js', 'export let value=1; export function update(){value++;}']];
    const packs = archiveModules(modules); assert.deepEqual(archiveModules(modules), packs);
    const records = packs.flatMap(pack => {
        assert.ok(pack.bytes.length <= 262144); assert.equal(createHash('sha256').update(pack.bytes).digest('hex'), pack.entry.hash);
        const decoded = gunzipSync(pack.bytes); assert.ok(decoded.length <= 262144); assert.equal(decoded.length, pack.entry.decoded); return JSON.parse(decoded);
    });
    assert.match(records[0][1], /from "lattice-viewer\/other.js"/u); assert.match(records[0][1], /const text="\.\/other.js"/u); assert.match(records[0][1], /import\("lattice-viewer\/other.js"\)/u);
});
test('viewer archive build rejects unsupported import forms and oversized individual modules', () => {
    for (const source of ['import(name)', 'import.meta.url', 'import "https://host/script.js"', 'import "./missing.js"']) assert.throws(() => archiveModules([['app.js', source]]), /Unsupported/u);
    assert.throws(() => archiveModules([['app.js', ' '.repeat(262144)]]), /split it/u);
});

test('archived modules preserve native cycles, live bindings and lazy execution', () => {
    const packs = archiveModules([
        ['app.js', 'import { count, increment, peer } from "./a.js"; import { read } from "./b.js"; export const before=[count,read(),peer()];increment();export const after=read();export async function lazy(){return (await import("./lazy.js")).value;}'],
        ['a.js', 'import { value } from "./b.js";export let count=1;export function increment(){count++;}export function peer(){return value;}'],
        ['b.js', 'import { count } from "./a.js";export const value=7;export function read(){return count;}'],
        ['lazy.js', 'globalThis.executed=true;export const value=9;']
    ]);
    const records = packs.flatMap(pack => JSON.parse(gunzipSync(pack.bytes)));
    const program = `import {SourceTextModule,createContext} from 'node:vm';import assert from 'node:assert/strict';const context=createContext({});const modules=new Map();const records=${JSON.stringify(records)};const linker=id=>modules.get(id);for(const [name,source]of records)modules.set('lattice-viewer/'+name,new SourceTextModule(source,{context,importModuleDynamically:async id=>{const module=linker(id);if(module.status==='unlinked')await module.link(linker);await module.evaluate();return module;}}));const app=linker('lattice-viewer/app.js');await app.link(linker);await app.evaluate();assert.deepEqual(Array.from(app.namespace.before),[1,1,7]);assert.equal(app.namespace.after,2);assert.equal(context.executed,undefined);assert.equal(await app.namespace.lazy(),9);assert.equal(context.executed,true);`;
    const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--input-type=module', '-e', program], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
});
test('classic bootstrap uses existing hash implementation without an initial module import', () => {
    const source = bootstrapScript('export function packedHash(bytes){return bytes;}', 'import {packedHash} from "./packed-hash.js"; void import("lattice-viewer/app.js");');
    assert.doesNotMatch(source, /import \{/u); assert.doesNotMatch(source, /export function/u); assert.match(source, /import\("lattice-viewer/u);
});
