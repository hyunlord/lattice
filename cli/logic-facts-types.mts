import type { Node } from 'web-tree-sitter';
import type { LogicDefinition, LogicReceiver } from '../dist/adapters/logic-types.js';
import { callableTypes, children, classTypes, descendants, field, identifier, lexicalRange } from './logic-facts-ast.mjs';

const simpleType = (node: Node | null | undefined): string => {
    const text = node?.text.replace(/^:\s*/u, '').replace(/^&(?:'\w+\s+)?(?:mut\s+)?/u, '').trim() ?? '';
    return /^[\p{L}_][\p{L}\p{N}_]*(?:(?:::|\.)[\p{L}_][\p{L}\p{N}_]*)*$/u.test(text) && !['var', 'dynamic', 'any', 'object'].includes(text) ? text : '';
};
function modifiers(node: Node): string[] {
    return children(node).filter(child => ['modifiers', 'modifier', 'visibility_modifier'].includes(child.type)).flatMap(child => child.text.split(/\s+/u));
}
export function definitionTypes(node: Node, language: string): Pick<LogicDefinition, 'nonVirtual' | 'arity' | 'receivers'> {
    const flags = modifiers(node);
    let owner = node.parent;
    while (owner && !classTypes.has(owner.type)) owner = owner.parent;
    const ownerFlags = owner ? modifiers(owner) : [];
    const interfaceOwner = owner?.type === 'interface_declaration' || owner?.children.some(child => child?.text === 'interface');
    const nonVirtual = language === 'rust' && owner?.type === 'impl_item' && !field(owner, 'trait') || flags.includes('private') || flags.includes('final') || ownerFlags.includes('final') || ownerFlags.includes('sealed') || language === 'csharp' && !flags.some(flag => ['virtual', 'override', 'abstract'].includes(flag)) && !interfaceOwner || language === 'kotlin' && !flags.some(flag => ['open', 'override', 'abstract'].includes(flag)) && !interfaceOwner;
    const parameters = field(node, 'parameters') ?? children(node).find(child => child.type === 'function_value_parameters');
    const params = parameters ? children(parameters) : [];
    const unsupported = params.some(param => /\b(?:params|vararg)\b|\.\.\./u.test(param.text) || ['rest_pattern', 'list_splat_pattern', 'dictionary_splat_pattern'].includes(param.type));
    const ordinary = params.filter(param => !['self_parameter', 'type_parameters'].includes(param.type));
    const arity = parameters && !unsupported ? { min: ordinary.filter(param => !field(param, 'value') && !children(param).some(child => child.type === 'equals_value_clause') && !param.text.includes('=') && param.type !== 'optional_parameter').length, max: ordinary.length } : undefined;
    return { nonVirtual, ...(arity ? { arity } : {}), receivers: receiverTypes(node, language) };
}
export function argumentCount(node: Node): number | undefined {
    let args = field(node, 'arguments') ?? children(node).find(child => ['call_suffix', 'value_arguments'].includes(child.type));
    if (args?.type === 'call_suffix') args = children(args).find(child => child.type === 'value_arguments');
    if (!args) return undefined;
    const values = children(args);
    if (values.some(value => ['spread_element', 'list_splat', 'dictionary_splat', 'keyword_argument'].includes(value.type) || children(value).some(child => ['name_colon', 'name_equals'].includes(child.type)) || /^\w+\s*=/u.test(value.text))) return undefined;
    return values.length;
}
function receiverTypes(node: Node, language: string): LogicReceiver[] {
    const found: LogicReceiver[] = [], counts = new Map<string, number>(), assigned = new Set<string>();
    const pending = [...children(node)];
    while (pending.length) {
        const item = pending.pop(); if (!item || callableTypes.has(item.type) || classTypes.has(item.type)) continue;
        const isParam = ['parameter', 'formal_parameter', 'required_parameter', 'optional_parameter'].includes(item.type);
        const isLocal = ['variable_declarator', 'let_declaration'].includes(item.type) || language === 'kotlin' && item.type === 'property_declaration';
        if (isParam || isLocal) {
            const declaration = language === 'kotlin' && isLocal ? children(item).find(child => child.type === 'variable_declaration') ?? item : item;
            const name = field(declaration, 'name') ?? field(declaration, 'pattern') ?? children(declaration).find(identifier);
            if (name && identifier(name)) {
                counts.set(name.text, (counts.get(name.text) ?? 0) + 1);
                let typeNode = field(declaration, 'type') ?? (isParam || language === 'kotlin' ? children(declaration).find(child => ['user_type', 'type_annotation'].includes(child.type)) : field(item.parent ?? item, 'type'));
                if (typeNode?.type === 'implicit_type') typeNode = undefined;
                const initializer = field(item, 'value') ?? children(item).find(child => child.type === 'equals_value_clause')?.namedChildren[0] ?? (language === 'kotlin' ? children(item).find(child => child.type === 'call_expression') : undefined);
                let constructed = '';
                if (initializer && ['object_creation_expression', 'new_expression'].includes(initializer.type) && !children(initializer).some(child => ['class_body', 'class_declaration'].includes(child.type))) constructed = simpleType(field(initializer, 'type') ?? field(initializer, 'constructor'));
                if (language === 'kotlin' && initializer?.type === 'call_expression') constructed = simpleType(children(initializer)[0]);
                const declared = simpleType(typeNode);
                const type = ['csharp', 'java', 'kotlin'].includes(language) && declared ? declared : constructed || declared;
                if (type) found.push({ name: name.text, type, constructed: !!constructed && constructed === type, start: isParam ? node.startIndex : item.endIndex, ...(isParam ? { scopeStart: node.startIndex, scopeEnd: node.endIndex } : lexicalRange(item, language)) });
            }
        }
        if (['assignment_expression', 'assignment', 'augmented_assignment_expression', 'update_expression', 'postfix_unary_expression', 'prefix_unary_expression'].includes(item.type)) {
            const target = field(item, 'left') ?? field(item, 'argument') ?? children(item)[0];
            if (target && identifier(target)) assigned.add(target.text);
        }
        if (['catch_clause', 'for_in_statement', 'for_in_clause', 'catch_formal_parameter'].includes(item.type)) {
            const binding = field(item, 'parameter') ?? field(item, 'left') ?? field(item, 'name');
            if (binding) for (const id of descendants(binding, identifier)) counts.set(id.text, (counts.get(id.text) ?? 0) + 1);
        }
        if (item.type === 'argument' && /^(?:ref|out)\s/u.test(item.text)) for (const id of children(item).filter(identifier)) assigned.add(id.text);
        pending.push(...children(item));
    }
    if (!found.length) return [];
    const nested = [...children(node)];
    while (nested.length) {
        const item = nested.pop(); if (!item) continue;
        if (['assignment_expression', 'assignment', 'augmented_assignment_expression', 'update_expression', 'postfix_unary_expression', 'prefix_unary_expression'].includes(item.type)) {
            const target = field(item, 'left') ?? field(item, 'argument') ?? children(item)[0];
            if (target && identifier(target)) assigned.add(target.text);
        }
        if (item.type === 'argument' && /^(?:ref|out)\s/u.test(item.text)) for (const id of children(item).filter(identifier)) assigned.add(id.text);
        nested.push(...children(item));
    }
    return found.filter(item => counts.get(item.name) === 1 && !assigned.has(item.name));
}

export function hasPrototypeAccess(root: Node): boolean {
    const pending = [root];
    while (pending.length) {
        const node = pending.pop(); if (!node) continue;
        if (['member_expression', 'subscript_expression'].includes(node.type) && /(?:\.\s*prototype\b|\[\s*['"]prototype['"]\s*\]|\.\s*setPrototypeOf\b)/u.test(node.text)) return true;
        pending.push(...children(node));
    }
    return false;
}
