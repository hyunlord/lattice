import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractCode, resolveModuleLinks } from '../dist/index.js';
const module = (path, text = '') => extractCode({ path, text, contentHash: createHash('sha256').update(text).digest('hex') });

test('C# namespace imports fan out over declarations with alias/static and scoped namespace provenance', () => {
    const result = resolveModuleLinks([
        module('App.cs', 'global using Game.Model;\nusing Alias = global::Game.Model.Hero;\nusing static Game.Model.Tools;\nnamespace Game { using Model; class App {} }'),
        module('Hero.cs', 'namespace Game.Model; public class Hero {}'),
        module('Tools.cs', 'namespace Game { namespace Model { public static class Tools {} } }'),
    ]);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => [edge.target, edge.sources[0].line]), [
        ['module:Hero.cs', 1], ['module:Tools.cs', 1], ['module:Hero.cs', 2], ['module:Tools.cs', 3], ['module:Hero.cs', 4], ['module:Tools.cs', 4],
    ]);
});

test('C# skips resource using, comments and all literal forms, retaining unresolved declarations', () => {
    const source = module('App.cs', `// using Fake.One;
/* using Fake.Two; */
class App { string a = @"using Fake.Three; ""using Fake.Four;"; string b = """using Fake.Five;""";
void Run() { using var resource = Open(); using (var x = Open()) {} } }
using Missing.Namespace;`);
    assert.deepEqual(source.imports.map(item => item.specifier), ['Missing.Namespace']);
    assert.equal(resolveModuleLinks([source]).diagnostics[0].code, 'external-or-unresolved-module');
});

test('Rust mod and grouped uses resolve crate, self, super, inline scopes and aliases', () => {
    const result = resolveModuleLinks([
        module('src/lib.rs', 'mod model;\nmod view;\nuse crate::model::{Hero, self, Tools as Kit};\nmod inline { use super::model::Hero; }'),
        module('src/model.rs', 'pub struct Hero; pub struct Tools;'),
        module('src/view/mod.rs', 'mod child;\nuse super::model::Hero;\nuse self::child::*;'),
        module('src/view/child.rs', 'use crate::model::Tools;'),
    ]);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.edges.map(edge => [edge.target, edge.sources[0].line]), [
        ['module:src/model.rs', 1], ['module:src/view/mod.rs', 2],
        ['module:src/model.rs', 3], ['module:src/model.rs', 3], ['module:src/model.rs', 3], ['module:src/model.rs', 4],
        ['module:src/view/child.rs', 1], ['module:src/model.rs', 2], ['module:src/view/child.rs', 3], ['module:src/model.rs', 1],
    ]);
});

test('Rust ignores strings, nested comments and lifetimes, and keeps ambiguity/missing/external imports explicit', () => {
    const source = module('src/lib.rs', `/* outer /* inner */ use fake::No; */
const TEXT: &str = r###"use fake::Text;"###;
fn borrow<'a>(x: &'a str) {}
mod both;
use crate::missing::Thing;
use serde::Serialize;
mod missing;`);
    const result = resolveModuleLinks([source, module('src/both.rs'), module('src/both/mod.rs')]);
    assert.deepEqual(source.imports.map(item => item.specifier), ['both', 'crate::missing::Thing', 'serde::Serialize', 'missing']);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.diagnostics.map(item => item.code), ['ambiguous-module', 'unresolved-local-module', 'external-or-unresolved-module', 'unresolved-local-module']);
});

test('Rust does not invent edges for undeclared files, custom paths or macro token bodies', () => {
    const result = resolveModuleLinks([
        module('src/lib.rs', '#[path = "other.rs"] mod custom;\nuse crate::orphan::Thing;\nexample!(use fake::Thing;);'),
        module('src/custom.rs'), module('src/orphan.rs'),
    ]);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.diagnostics.map(item => [item.specifier, item.code]), [
        ['custom', 'unresolved-local-module'], ['crate::orphan::Thing', 'unresolved-local-module'],
    ]);
});

test('native metadata survives cache decoding and keeps source joins identical', async () => {
    const { parseModule } = await import('../bin/decode.mjs');
    const modules = [
        module('A.cs', 'using Game;'), module('B.cs', 'namespace Game; class Hero {}'),
        module('src/lib.rs', 'mod models; use crate::models::Hero;'), module('src/models.rs', 'pub struct Hero;'),
    ];
    const decoded = modules.map(value => parseModule(JSON.parse(JSON.stringify(value))));
    assert.deepEqual(decoded, modules);
    assert.deepEqual(resolveModuleLinks(decoded), resolveModuleLinks(modules));
});

test('Rust root-level items resolve through super without treating unknown root names as imports', () => {
    const result = resolveModuleLinks([
        module('src/lib.rs', 'pub struct Root; mod child;'),
        module('src/child.rs', 'use super::Root; use crate::Missing;'),
    ]);
    assert.deepEqual(result.edges.map(edge => edge.target), ['module:src/child.rs', 'module:src/lib.rs']);
    assert.deepEqual(result.diagnostics.map(item => item.specifier), ['crate::Missing']);
});
