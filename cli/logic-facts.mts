import { uiRootAnnotations } from './logic-ui-roots.mjs';
import { definitionTypes, argumentCount, hasPrototypeAccess } from './logic-facts-types.mjs';
import type { Node } from 'web-tree-sitter';
import type { SourceInput } from '../dist/adapters/types.js';
import type { LogicFacts, LogicDefinition, LogicCall } from '../dist/adapters/logic-types.js';
import { annotations, bindings, children, callTarget, callableTypes, callTypes, classTypes, definitionName, descendants, field, functionTypes, identifier, lexicalRange, ownerName, staticDefinition, unsupportedCallableTypes } from './logic-facts-ast.mjs';
import { exportedNames, pythonNamespaceExports } from './logic-facts-exports.mjs';
import { logicImports } from './logic-facts-imports.mjs';

export function extractLogicFacts(input: SourceInput, language: string, root: Node): LogicFacts {
    const definitions: LogicDefinition[] = [], calls: LogicCall[] = [], classes: { name: string; bases: string[]; annotations: string[]; line: number; }[] = [];
    if (root.hasError) {
        let line = 1;
        const pending = [root];
        while (pending.length) {
            const node = pending.pop(); if (!node) break;
            if (node.type === 'ERROR' || node.isMissing) { line = node.startPosition.row + 1; break; }
            pending.push(...children(node).filter(child => child.hasError || child.isMissing).toReversed());
        }
        return { version: 1, path: input.path, language, contentHash: input.contentHash, definitions, calls, imports: [], classes, topBindings: [], diagnostics: [{ code: 'logic-parse-error', path: input.path, line, message: 'Syntax tree contains unsupported or malformed syntax; affected definitions and calls are omitted' }], supported: true };
    }
    const callableIds = new Map<number, string>();
    const exports = exportedNames(root);
    const pending: { node: Node; parent: string; owner: string; }[] = [{ node: root, parent: '', owner: '' }];
    while (pending.length) {
        const current = pending.pop(); if (!current) break;
        const { node } = current, type = node.type;
        if (type === 'ERROR' || node.isMissing || unsupportedCallableTypes.has(type)) continue;
        let { parent, owner } = current;
        if (classTypes.has(type)) {
            owner = ownerName(node);
            const base = field(node, 'superclass') ?? field(node, 'bases') ?? children(node).find(child => ['class_heritage', 'extends_clause', 'base_list', 'delegation_specifiers', 'delegation_specifier', 'super_interfaces'].includes(child.type));
            classes.push({ name: owner, annotations: annotations(node), bases: base ? descendants(base, child => ['identifier', 'type_identifier', 'user_type'].includes(child.type)).map(child => child.text) : [], line: node.startPosition.row + 1 });
        }
        if (functionTypes.has(type)) {
            if (node.hasError) continue;
            if (language === 'go' && field(node, 'receiver')) owner = descendants(field(node, 'receiver') ?? node, child => child.type === 'type_identifier')[0]?.text ?? '<receiver>';
            const name = definitionName(node), id = `logic:${input.path}:${name}:${node.startIndex}`;
            const exported = exports.has(name) || (language === 'go' ? /^[A-Z]/u.test(name) : ['python', 'kotlin'].includes(language) ? !name.startsWith('_') : node.parent?.type === 'export_statement' || children(node).some(child => ['visibility_modifier', 'modifiers', 'modifier'].includes(child.type) && /\b(?:pub|public)\b/u.test(child.text)));
            definitions.push({ ...definitionTypes(node, language), id, name, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1, start: node.startIndex, end: node.endIndex, parent, ...lexicalRange(node, language), owner, static: staticDefinition(node, language, owner), exported, exportNames: exports.get(name) ?? (exported ? [name] : []), bindings: bindings(node), annotations: annotations(node) });
            callableIds.set(node.id, id); parent = id;
        }
        for (const child of children(node).toReversed()) pending.push({ node: child, parent, owner });
    }
    const moduleId = `logic:${input.path}:<module>:0`;
    const scan: { node: Node; caller: string; }[] = [{ node: root, caller: moduleId }];
    while (scan.length) {
        const current = scan.pop(); if (!current) break;
        const { node } = current, type = node.type;
        if (type === 'ERROR' || node.isMissing || callableTypes.has(type) && !callableIds.has(node.id)) continue;
        const caller = callableIds.get(node.id) ?? current.caller;
        if (callTypes.has(type) && !node.hasError) {
            const target = callTarget(node), argumentsNode = field(node, 'arguments') ?? children(node).find(child => ['call_suffix', 'value_arguments'].includes(child.type));
            const route = ['get', 'post', 'put', 'patch', 'delete', 'route', 'add_route', 'add_url_rule'].includes(target.name) && !!argumentsNode && descendants(argumentsNode, child => ['string', 'string_literal'].includes(child.type)).length > 0;
            const callbackIds = route && argumentsNode ? children(argumentsNode).flatMap(child => {
                const id = callableIds.get(child.id); if (id) return [id];
                if (!identifier(child)) return [];
                const currentDefinition = definitions.find(item => item.id === caller);
                if (currentDefinition?.bindings.includes(child.text)) return [];
                const matches = definitions.filter(item => item.name === child.text && !item.owner && (!item.parent || item.parent === caller) && item.scopeStart <= node.startIndex && node.startIndex < item.scopeEnd);
                return matches.length === 1 && matches[0] ? [matches[0].id] : [];
            }) : [];
            const count = argumentCount(node);
            calls.push({ ...(count === undefined ? {} : { argumentCount: count }), caller, ...target, line: node.startPosition.row + 1, endLine: node.endPosition.row + 1, start: node.startIndex, callbackIds, route });
        }
        for (const child of children(node).toReversed()) scan.push({ node: child, caller });
    }
    const uiRoots = ['javascript', 'typescript'].includes(language) ? uiRootAnnotations(root, logicImports(root, language)) : [];
    const mainGuard = language === 'python' ? descendants(root, node => node.type === 'if_statement').find(node => /^__name__\s*==\s*['"]__main__['"]$/u.test(field(node, 'condition')?.text ?? '')) : undefined;
    if (calls.some(call => call.caller === moduleId)) definitions.unshift({ id: moduleId, name: '<module>', line: 1, endLine: root.endPosition.row + 1, start: 0, end: root.endIndex, parent: '', scopeStart: 0, scopeEnd: root.endIndex, owner: '', static: true, exported: false, exportNames: [], bindings: [], annotations: [...(mainGuard ? [`python-main-guard@${mainGuard.startPosition.row + 1}`] : []), ...uiRoots] });
    const namespaceExports = language === 'python' ? pythonNamespaceExports(root) : undefined;
    return { ...(['javascript', 'typescript'].includes(language) && hasPrototypeAccess(root) ? { mutableReceivers: true } : {}), ...(namespaceExports === undefined ? {} : { namespaceExports }), version: 1, path: input.path, language, contentHash: input.contentHash, definitions, calls, imports: logicImports(root, language), classes, topBindings: bindings(root), diagnostics: [], supported: true };
}
