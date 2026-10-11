import type { Node } from 'web-tree-sitter';
import { bindings, children, descendants, field, callableTypes, identifier } from './logic-facts-ast.mjs';

export function exportedNames(root: Node): ReadonlyMap<string, readonly string[]> {
    const result = new Map<string, string[]>();
    const commonjsShadowed = bindings(root).some(name => ['module', 'exports'].includes(name));
    const add = (local: string, exported: string) => { if (local && exported) result.set(local, [...(result.get(local) ?? []), exported]); };
    for (const node of descendants(root, child => child.type === 'export_statement' || child.type === 'assignment_expression')) {
        if (node.type === 'export_statement') {
            if (field(node, 'source')) continue;
            const isDefault = node.children.some(child => child?.type === 'default');
            const declaration = field(node, 'declaration'), value = field(node, 'value');
            const name = declaration ? field(declaration, 'name') : value;
            if (name && identifier(name)) add(name.text, isDefault ? 'default' : name.text);
            for (const specifier of descendants(node, child => child.type === 'export_specifier')) add(field(specifier, 'name')?.text ?? '', (field(specifier, 'alias') ?? field(specifier, 'name'))?.text ?? '');
        } else {
            if (commonjsShadowed) continue;
            let ancestor = node.parent;
            while (ancestor && !callableTypes.has(ancestor.type)) ancestor = ancestor.parent;
            if (ancestor) continue;
            const left = field(node, 'left'), right = field(node, 'right');
            if (!left || !right) continue;
            if (left.text === 'module.exports') {
                if (identifier(right)) add(right.text, 'default');
                if (right.type === 'object') for (const property of children(right)) {
                    if (property.type === 'shorthand_property_identifier') add(property.text, property.text);
                    else { const value = field(property, 'value'), key = field(property, 'key'); if (value && key && identifier(value)) add(value.text, key.text); }
                }
            } else if (left.type === 'member_expression') {
                const object = field(left, 'object'), property = field(left, 'property');
                if (['exports', 'module.exports'].includes(object?.text ?? '') && property && identifier(right)) add(right.text, property.text);
            }
        }
    }
    return result;
}
