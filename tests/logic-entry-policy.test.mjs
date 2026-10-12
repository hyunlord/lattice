import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareLogicParser, parseLogicFacts } from '../bin/logic-parser.mjs';
import { analyzeLogic } from '../dist/adapters/logic-analysis.js';
import { extractCode } from '../dist/adapters/code.js';
import { logicEntrypoints, rankedLogicFunctions, logicOverviewMetadata } from '../dist/query/logic-model.js';

test('package namespace reexports expose Python functions and class APIs without exposing nested helpers', async () => {
    const inputs = [['src/pkg/__init__.py', 'from .core import Command\nfrom .decorators import command\n'], ['src/pkg/core.py', 'class Command:\n def main(self):\n  pass\n def _hidden(self):\n  pass\n'], ['src/pkg/decorators.py', 'def command():\n def internal():\n  pass\n return internal\n'], ['examples/main.py', 'def main():\n pass\n']].map(([path, text]) => ({ path, text, contentHash: 'a'.repeat(64) }));
    await prepareLogicParser(['python']);
    const result = analyzeLogic(inputs.map(input => parseLogicFacts(input, 'python')), inputs.map(extractCode));
    assert(result.nodes.find(node => node.sources[0].path === 'examples/main.py').attributes.entrypoints.some(entry => entry.category === 'executable'));
    const entries = logicEntrypoints(result).items;
    assert.deepEqual(entries.map(item => item.node.name).sort(), ['command', 'main']);
    assert(entries.every(item => item.entrypoints.every(entry => entry.category === 'public-api')));
});

test('default function focus ranks product executable then API then exact incoming usage', () => {
    const node = (id, path, category) => ({ id, kind: 'function', name: id, attributes: { entrypoints: category ? [{ category, rule: 'fixture', source: { path, line: 1, pointer: '/', contentHash: 'h' } }] : [] }, sources: [{ path, line: 1, pointer: '/', contentHash: 'h' }] });
    const nodes = [node('example', 'examples/main.rs', 'executable'), node('build', 'build.rs', 'executable'), node('api', 'src/lib.rs', 'public-api'), node('run', 'src/main.rs', 'executable'), node('helper', 'src/helper.rs')];
    const edges = [{ id: 'call', kind: 'calls', source: 'api', target: 'helper', directed: true, attributes: { resolution: 'exact' }, sources: [] }];
    assert.deepEqual(rankedLogicFunctions({ nodes, edges }).map(node => node.id), ['run', 'api', 'helper']);
    assert.deepEqual(logicEntrypoints({ nodes, edges }).items.map(item => item.node.id), ['run', 'api']);
});

test('automatic overview badges only executable modules and defers a useful function focus', async () => {
    const { buildLoopMap } = await import('../dist/query/loop-map-model.js');
    const source = path => ({ path, line: 1, pointer: '/', contentHash: 'a'.repeat(64) });
    const module = (id, path) => ({ id, kind: 'module', name: path, attributes: {}, sources: [source(path)] });
    const fn = (id, path, category, module) => ({ id, kind: 'function', name: id, attributes: { module, entrypoints: [{ category, rule: 'fixture', source: source(path) }] }, sources: [source(path)] });
    const nodes = [module('app', 'src/main.rs'), module('lib', 'lib/api.rs'), fn('run', 'src/main.rs', 'executable', 'app'), fn('api', 'lib/api.rs', 'public-api', 'lib')];
    const map = buildLoopMap(nodes, [], [], { kinds: [] }, 'demo', { projection: 'overview', logic: logicOverviewMetadata({ nodes, edges: [] }) });
    assert.equal(map.defaultFocus, 'run');
    assert.deepEqual(map.structuralEntryStageIds, ['folder:src']);
    assert.equal(map.nodes.some(node => node.id === 'run'), false);
});

test('public API discovery excludes overload signatures and implicit nested namespaces', async () => {
    const inputs = [['pkg/__init__.py', 'from .api import run\n'], ['pkg/api.py', 'from typing import overload\n@overload\ndef run(value: str): ...\ndef run(value):\n return value\n'], ['pkg/internal/__init__.py', 'def hidden():\n pass\n']].map(([path, text]) => ({ path, text, contentHash: 'a'.repeat(64) }));
    await prepareLogicParser(['python']);
    const result = analyzeLogic(inputs.map(input => parseLogicFacts(input, 'python')), inputs.map(extractCode));
    assert.deepEqual(logicEntrypoints(result).items.map(item => [item.node.name, item.node.sources[0].line]), [['run', 4]]);
});

test('legacy module main evidence remains executable without parsed function nodes', async () => {
    const { buildLoopMap } = await import('../dist/query/loop-map-model.js');
    const node = (id, path) => ({ id, kind: 'module', name: path, attributes: { entryPoints: [{ name: 'main', line: 1 }] }, sources: [{ path, line: 1, pointer: '/', contentHash: 'a'.repeat(64) }] });
    const map = buildLoopMap([node('main', 'src/main.go'), node('example', 'examples/main.go'), node('build', 'build.rs')], [], [], { kinds: [] }, 'demo');
    assert.deepEqual(map.structuralEntryStageIds, ['folder:src']);
});

test('explicit namespace exports restrict inferred public imports', async () => {
    const inputs = [['pkg/__init__.py', 'from .api import run, helper\n__all__ = ["run"]\n'], ['pkg/api.py', 'def run():\n pass\ndef helper():\n pass\n']].map(([path, text]) => ({ path, text, contentHash: 'a'.repeat(64) }));
    await prepareLogicParser(['python']);
    const result = analyzeLogic(inputs.map(input => parseLogicFacts(input, 'python')), inputs.map(extractCode));
    assert.deepEqual(logicEntrypoints(result).items.map(item => item.node.name), ['run']);
});

test('bounded function focus retains incoming and outgoing call cards', async () => {
    const { buildFunctionFocus } = await import('../dist/query/loop-map-model.js');
    const nodes = ['caller', 'center', 'callee'].map(id => ({ id, name: id, kind: 'function', attributes: {}, sources: [] }));
    const edges = [['caller', 'center'], ['center', 'callee']].map(([source, target]) => ({ id: source + target, source, target, directed: true, kind: 'calls', attributes: { resolution: 'exact' }, sources: [] }));
    const model = buildFunctionFocus(nodes, edges, { kinds: [] }, 'demo', 'center');
    assert.equal(model.defaultFocus, 'center');
    assert.deepEqual(model.nodes.find(node => node.id === 'center').relationGroups.map(group => [group.side, group.items.map(item => item.id)]), [['incoming', ['caller']], ['outgoing', ['callee']]]);
});
