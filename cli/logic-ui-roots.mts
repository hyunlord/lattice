import type { Node } from 'web-tree-sitter';
import type { LogicImport } from '../dist/adapters/logic-types.js';
import { callableTypes, classTypes, children, descendants, field } from './logic-facts-ast.mjs';
/** UI mount sites are alternative reading starts, not inferred component call edges. */
export function uiRootAnnotations(root: Node, imports: readonly LogicImport[]): readonly string[] {
    const topLevel = (node: Node): boolean => {
        let parent = node.parent;
        while (parent && parent !== root) { if (callableTypes.has(parent.type) || classTypes.has(parent.type)) return false; parent = parent.parent; }
        return true;
    };
    const bindings = imports.filter(item => ['react-dom', 'react-dom/client'].includes(item.specifier));
    const wrappers = new Set(imports.filter(item => item.specifier === 'react').flatMap(item => ['StrictMode', 'Fragment'].includes(item.imported) ? [item.local] : item.namespace || item.imported === 'default' ? [`${item.local}.StrictMode`, `${item.local}.Fragment`] : []));
    const constructors = new Set(bindings.filter(item => ['createRoot', 'hydrateRoot'].includes(item.imported)).map(item => item.local));
    const namespaces = new Set(bindings.filter(item => item.namespace || item.imported === 'default').map(item => item.local));
    const create = (node: Node | null | undefined): boolean => {
        if (!node || node.type !== 'call_expression') return false;
        const fn = field(node, 'function');
        return !!fn && (constructors.has(fn.text) || fn.type === 'member_expression' && namespaces.has(field(fn, 'object')?.text ?? '') && ['createRoot', 'hydrateRoot'].includes(field(fn, 'property')?.text ?? ''));
    };
    const roots = new Set(descendants(root, node => node.type === 'variable_declarator').filter(node => topLevel(node) && create(field(node, 'value'))).map(node => field(node, 'name')?.text ?? ''));
    const result: string[] = [];
    for (const call of descendants(root, node => node.type === 'call_expression')) {
        if (!topLevel(call)) continue;
        const fn = field(call, 'function'), args = field(call, 'arguments');
        if (!fn || !args) continue;
        const owner = field(fn, 'object'), method = field(fn, 'property')?.text;
        const mount = create(call) || method === 'render' && !!owner && (roots.has(owner.text) || namespaces.has(owner.text) || create(owner));
        if (!mount) continue;
        const jsx = children(args).find(node => ['jsx_element', 'jsx_self_closing_element'].includes(node.type));
        let opening = jsx?.type === 'jsx_element' ? children(jsx).find(node => node.type === 'jsx_opening_element') : jsx;
        const wrapper = opening ? field(opening, 'name')?.text : undefined;
        if (jsx && wrappers.has(wrapper ?? '')) {
            const nested = children(jsx).find(node => ['jsx_element', 'jsx_self_closing_element'].includes(node.type));
            opening = nested?.type === 'jsx_element' ? children(nested).find(node => node.type === 'jsx_opening_element') : nested;
        }
        const name = opening ? field(opening, 'name')?.text : undefined;
        if (name && /^[A-Z]/u.test(name)) result.push(`ui-root@${call.startPosition.row + 1}:${name}`);
    }
    return result;
}
