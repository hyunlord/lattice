import type { Node } from 'web-tree-sitter';

export const functionTypes = new Set(['function_declaration', 'function_definition', 'function_item', 'method_declaration', 'method_definition', 'arrow_function', 'function_expression', 'generator_function_declaration', 'generator_function', 'local_function_statement']);
export const unsupportedCallableTypes = new Set(['func_literal', 'lambda_literal', 'annotated_lambda', 'lambda_expression', 'anonymous_method_expression', 'closure_expression', 'lambda']);
export const callableTypes = new Set([...functionTypes, ...unsupportedCallableTypes]);
export const classTypes = new Set(['class_declaration', 'class_definition', 'struct_item', 'impl_item', 'object_declaration', 'struct_declaration', 'interface_declaration']);
export const callTypes = new Set(['call_expression', 'call', 'method_invocation', 'invocation_expression']);
export const field = (node: Node, name: string): Node | null => node.childForFieldName(name);
export const children = (node: Node): readonly Node[] => node.namedChildren.filter((child): child is Node => child !== null);
export function descendants(node: Node, accept: (node: Node) => boolean): Node[] {
    const result: Node[] = [], pending = [node];
    while (pending.length) { const next = pending.pop(); if (!next || unsupportedCallableTypes.has(next.type)) continue; if (accept(next)) result.push(next); pending.push(...children(next).toReversed()); }
    return result;
}
export const identifier = (node: Node): boolean => ['identifier', 'simple_identifier', 'property_identifier', 'type_identifier', 'package_identifier', 'field_identifier'].includes(node.type);
export function simpleName(node: Node | null): string {
    if (!node) return '';
    return identifier(node) ? node.text : '';
}
export function definitionName(node: Node): string {
    const named = field(node, 'name');
    if (named) return named.text;
    if (node.type === 'function_declaration') return children(node).find(identifier)?.text ?? '';
    const parent = node.parent;
    if (parent && ['variable_declarator', 'assignment', 'assignment_expression', 'pair', 'public_field_definition'].includes(parent.type)) return simpleName(field(parent, 'name') ?? field(parent, 'left') ?? field(parent, 'key'));
    return `<callback@${node.startPosition.row + 1}:${node.startPosition.column + 1}>`;
}
export function ownerName(node: Node): string {
    const named = field(node, 'name') ?? field(node, 'type');
    return named?.text ?? children(node).find(identifier)?.text ?? '';
}
export function staticDefinition(node: Node, language: string, owner: string): boolean {
    if (!owner) return true;
    if (language === 'kotlin') {
        let ancestor = node.parent;
        while (ancestor && !classTypes.has(ancestor.type)) ancestor = ancestor.parent;
        if (ancestor?.type === 'object_declaration') return true;
    }
    if (language === 'rust') return !descendants(field(node, 'parameters') ?? node, n => n.type === 'self_parameter').length;
    const prefixes = node.children.filter((child): child is Node => child !== null).filter(child => child.startIndex < (field(node, 'body')?.startIndex ?? node.endIndex));
    return prefixes.some(child => child.type === 'static' || (['modifiers', 'modifier'].includes(child.type) && child.children.some(token => token?.text === 'static')) || child.type === 'modifier' && child.text === 'static') || language === 'python' && node.parent?.type === 'decorated_definition' && children(node.parent).some(child => child.type === 'decorator' && child.text === '@staticmethod');
}
export function annotations(node: Node): string[] {
    const parent = node.parent?.type === 'decorated_definition' ? node.parent : node;
    const bodyStart = field(node, 'body')?.startIndex ?? node.endIndex;
    return descendants(parent, child => child.startIndex < bodyStart && ['annotation', 'marker_annotation', 'decorator'].includes(child.type)).map(child => (field(child, 'name') ?? children(child)[0])?.text ?? child.text);
}
export function bindings(node: Node): string[] {
    const result = new Set<string>();
    const params = field(node, 'parameters') ?? children(node).find(child => child.type === 'function_value_parameters');
    if (params) for (const id of descendants(params, identifier)) result.add(id.text);
    const body = field(node, 'body') ?? children(node).find(child => child.type === 'function_body') ?? node;
    const pending = [...children(body)];
    while (pending.length) {
        const next = pending.pop(); if (!next) continue;
        if (callableTypes.has(next.type) || classTypes.has(next.type)) continue;
        const initializer = field(next, 'value') ?? field(next, 'right');
        if (initializer && (functionTypes.has(initializer.type) || initializer.type === 'call_expression' && field(initializer, 'function')?.text === 'require')) continue;
        const target = ['variable_declarator', 'let_declaration', 'assignment', 'assignment_expression', 'short_var_declaration', 'var_spec', 'const_spec', 'for_in_clause', 'for_statement', 'local_variable_declaration', 'parameter'].includes(next.type) ? field(next, 'name') ?? field(next, 'pattern') ?? field(next, 'left') : null;
        if (target && ['member_expression', 'member_access_expression', 'attribute', 'selector_expression', 'field_expression'].includes(target.type)) result.add(target.text);
        else if (target) for (const id of descendants(target, identifier)) result.add(id.text);
        pending.push(...children(next));
    }
    return [...result].sort();
}
export function callTarget(node: Node): { name: string; receiver: string; } {
    if (node.type === 'method_invocation') return { name: field(node, 'name')?.text ?? '', receiver: field(node, 'object')?.text ?? '' };
    let target = field(node, 'function') ?? children(node)[0];
    if (target?.type === 'generic_function') target = children(target)[0];
    if (!target) return { name: '', receiver: '' };
    if (identifier(target)) return { name: target.text, receiver: '' };
    if (['member_expression', 'attribute', 'selector_expression', 'field_expression', 'member_access_expression'].includes(target.type)) {
        const receiver = field(target, 'object') ?? field(target, 'value') ?? field(target, 'operand') ?? field(target, 'expression') ?? children(target)[0];
        const name = field(target, 'property') ?? field(target, 'attribute') ?? field(target, 'field') ?? field(target, 'name') ?? children(target).at(-1);
        return { name: name?.text ?? '', receiver: receiver?.text ?? '' };
    }
    if (target.type === 'navigation_expression') {
        const receiver = children(target)[0], suffix = children(target).at(-1);
        const name = suffix ? children(suffix).find(identifier)?.text : undefined;
        return { name: name ?? '', receiver: receiver?.text ?? '' };
    }
    if (target.type === 'scoped_identifier') return { name: children(target).at(-1)?.text ?? '', receiver: children(target).slice(0, -1).map(child => child.text).join('::') };
    return { name: '', receiver: '' };
}

export function lexicalRange(node: Node, language: string): { scopeStart: number; scopeEnd: number; } {
    let parent = node.parent;
    while (parent) {
        if (callableTypes.has(parent.type) || ['program', 'module', 'source_file', 'compilation_unit'].includes(parent.type) || language !== 'python' && ['statement_block', 'block', 'class_body', 'declaration_list'].includes(parent.type)) return { scopeStart: parent.startIndex, scopeEnd: parent.endIndex };
        parent = parent.parent;
    }
    return { scopeStart: 0, scopeEnd: node.endIndex };
}
