import type { Edge, NodeDraft, Source } from '../core/model.js';
import type { CodeModule } from './code.js';
import type { SourceInput } from './types.js';
import type { LogicFacts, LogicDiagnostic } from './logic-types.js';
import { logicResolver } from './logic-resolve.js';
import { logicEntries } from './logic-entries.js';

export function analyzeLogic(facts: readonly LogicFacts[], modules: readonly CodeModule[], manifestNodes: readonly NodeDraft[] = [], metadata: readonly SourceInput[] = []) {
    const supported = facts.filter(fact => fact.supported && !fact.diagnostics.some(item => item.code === 'logic-parse-error' || item.code === 'logic-parse-limit'));
    const modulesByPath = new Map(modules.map(module => [module.node.sources[0]?.path, module]));
    const sourceFor = (fact: LogicFacts, line: number, endLine: number, pointer: string): Source => {
        const source = modulesByPath.get(fact.path)?.node.sources[0];
        return { ...source, path: fact.path, line, endLine, pointer, contentHash: fact.contentHash, ...(source?.url ? { url: source.url.replace(/#L\d+(?:-L\d+)?$/u, `#L${line}`) } : {}) };
    };
    const entries = logicEntries(supported, manifestNodes, metadata, sourceFor);
    const resolve = logicResolver(supported, modules, manifestNodes);
    const nodes: NodeDraft[] = [], edges: Edge[] = [], diagnostics: LogicDiagnostic[] = facts.flatMap(fact => fact.diagnostics);
    let unresolved = 0;
    for (const fact of supported) {
        const unresolvedExamples: string[] = [];
        let fileUnresolved = 0, firstUnresolvedLine = 1;
        const moduleId = modulesByPath.get(fact.path)?.node.id ?? `module:${fact.path}`;
        for (const definition of fact.definitions) {
            const source = sourceFor(fact, definition.line, definition.endLine, `/logic/definitions/${definition.start}`);
            nodes.push({ id: definition.id, kind: 'function', name: definition.name, attributes: { language: fact.language, module: moduleId, qualifiedName: [definition.owner, definition.name].filter(Boolean).join('.'), lexicalParent: definition.parent, owner: definition.owner, static: definition.static, exported: definition.exported, evidence: 'static-ast', entrypoints: (entries.get(definition.id) ?? []).map(entry => ({ category: entry.category, rule: entry.rule, source: { ...entry.source } })) }, sources: [source] });
            edges.push({ id: `contains:${moduleId}:${definition.id}`, kind: 'contains', source: moduleId, target: definition.id, directed: true, field: source.pointer, attributes: { evidence: 'static-ast' }, sources: [source] });
        }
        for (const call of fact.calls) {
            const target = resolve(fact, call);
            if (!target) { unresolved++; fileUnresolved++; if (fileUnresolved === 1) firstUnresolvedLine = call.line; if (unresolvedExamples.length < 5) unresolvedExamples.push(`${call.receiver ? call.receiver + '.' : ''}${call.name || '<dynamic>'} (line ${call.line})`); continue; }
            const source = sourceFor(fact, call.line, call.endLine, `/logic/calls/${call.start}`);
            edges.push({ id: `calls:${call.caller}:${target.definition.id}:${call.start}`, kind: 'calls', source: call.caller, target: target.definition.id, directed: true, field: source.pointer, attributes: { resolution: 'exact', evidence: 'static-call', name: call.name, receiver: call.receiver }, sources: [source] });
        }
        if (fileUnresolved) diagnostics.push({ code: 'unresolved-call', path: fact.path, line: firstUnresolvedLine, message: `${fileUnresolved} callsites have no unique lexical or explicitly imported static target: ${unresolvedExamples.join(', ')}` });
    }
    return { nodes, edges, diagnostics, coveredModuleIds: supported.filter(fact => !fact.diagnostics.some(item => item.code === 'logic-parse-error' || item.code === 'logic-parse-limit')).map(fact => modulesByPath.get(fact.path)?.node.id ?? `module:${fact.path}`), stats: { files: supported.length, definitions: nodes.length, callsites: supported.reduce((sum, fact) => sum + fact.calls.length, 0), resolved: edges.filter(edge => edge.kind === 'calls').length, unresolved } };
}
