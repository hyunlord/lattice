import type { Node } from 'web-tree-sitter';
import type { LogicImport } from '../dist/adapters/logic-types.js';
import { children, descendants, field, functionTypes, identifier, lexicalRange } from './logic-facts-ast.mjs';
const literal = (node: Node | null): string => node ? node.text.replace(/^[rubf]*["']|["']$/giu, '') : '';

export function logicImports(root: Node, language: string): LogicImport[] {
    const result: LogicImport[] = [];
    const requireShadows: { scopeStart: number; scopeEnd: number; }[] = [];
    const hasRequire = (node: Node | null): boolean => !!node && descendants(node, child => identifier(child) && child.text === 'require').length > 0;
    if (['javascript', 'typescript'].includes(language)) for (const node of descendants(root, child => functionTypes.has(child.type) || ['variable_declarator', 'assignment_expression', 'catch_clause', 'import_statement', 'class_declaration'].includes(child.type))) {
        if (functionTypes.has(node.type)) {
            if (hasRequire(field(node, 'parameters'))) requireShadows.push({ scopeStart: node.startIndex, scopeEnd: node.endIndex });
            if (field(node, 'name')?.text === 'require') requireShadows.push(node.type.includes('declaration') ? lexicalRange(node, language) : { scopeStart: node.startIndex, scopeEnd: node.endIndex });
        } else if (node.type === 'catch_clause') {
            if (hasRequire(field(node, 'parameter'))) requireShadows.push({ scopeStart: node.startIndex, scopeEnd: node.endIndex });
        } else if (node.type === 'import_statement') {
            const clause = children(node).find(child => child.type === 'import_clause');
            if (clause && hasRequire(clause)) requireShadows.push(lexicalRange(node, language));
        } else if (hasRequire(field(node, 'name') ?? field(node, 'left'))) {
            if (node.parent?.type === 'variable_declaration') {
                let scope = node.parent.parent;
                while (scope?.parent && !functionTypes.has(scope.type) && scope.type !== 'program') scope = scope.parent;
                if (scope) requireShadows.push({ scopeStart: scope.startIndex, scopeEnd: scope.endIndex });
            } else requireShadows.push(lexicalRange(node, language));
        }
    }
    const requireShadowed = (node: Node): boolean => requireShadows.some(scope => scope.scopeStart <= node.startIndex && node.startIndex < scope.scopeEnd);
    const add = (node: Node, local: string, imported: string, specifier: string, namespace = false, exported = false) => { if (local && specifier) result.push({ local, imported, specifier, namespace, ...(exported ? { exported: true } : {}), ...lexicalRange(node, language), line: node.startPosition.row + 1 }); };
    for (const node of descendants(root, n => ['import_statement', 'import_from_statement', 'import_declaration', 'import_header', 'use_declaration', 'mod_item', 'import_spec', 'variable_declarator', 'extern_crate_declaration'].includes(n.type))) {
        if (['javascript', 'typescript'].includes(language)) {
            if (node.type === 'import_statement') {
                const specifier = literal(field(node, 'source'));
                for (const spec of descendants(node, child => child.type === 'import_specifier')) add(spec, (field(spec, 'alias') ?? field(spec, 'name'))?.text ?? '', field(spec, 'name')?.text ?? '', specifier);
                const clause = children(node).find(child => child.type === 'import_clause');
                const defaultName = (clause ? children(clause).find(identifier) : undefined);
                if (defaultName) add(defaultName, defaultName.text, 'default', specifier);
                const namespace = descendants(node, child => child.type === 'namespace_import')[0];
                if (namespace) add(namespace, children(namespace).at(-1)?.text ?? '', '*', specifier, true);
            } else if (node.type === 'variable_declarator') {
                const value = field(node, 'value'), name = field(node, 'name');
                if (requireShadowed(node) || value?.type !== 'call_expression' || field(value, 'function')?.text !== 'require') continue;
                const args = field(value, 'arguments')?.namedChildren ?? [];
                if (args.length !== 1 || args[0]?.type !== 'string') continue;
                if (name && identifier(name)) add(node, name.text, 'default', literal(args[0]), true);
                else if (name?.type === 'object_pattern') for (const binding of children(name)) {
                    const key = field(binding, 'key') ?? binding, alias = field(binding, 'value') ?? binding;
                    if (identifier(alias) || alias.type === 'shorthand_property_identifier_pattern') add(binding, alias.text, key.text, literal(args[0]));
                }
            }
        } else if (language === 'python') {
            const from = node.type === 'import_from_statement', source = from ? field(node, 'module_name')?.text ?? '' : '';
            for (const name of children(node).filter(child => child.id !== field(node, 'module_name')?.id)) {
                if (name.type === 'aliased_import') { const original = field(name, 'name')?.text ?? ''; add(name, field(name, 'alias')?.text ?? original, from ? original : '*', from ? source : original, !from); }
                else if (name.type === 'dotted_name') add(name, from ? name.text : name.text.split('.')[0] ?? '', from ? name.text : '*', from ? source : name.text, !from);
            }
        } else if (language === 'go' && node.type === 'import_spec') {
            const path = literal(field(node, 'path')), name = field(node, 'name')?.text ?? path.split('/').at(-1) ?? '';
            if (!['_', '.'].includes(name)) add(node, name, '*', path, true);
        } else if (language === 'rust' && node.type === 'extern_crate_declaration') {
            const name = field(node, 'name')?.text ?? '';
            add(node, field(node, 'alias')?.text ?? name, '*', name, true, children(node).some(child => child.type === 'visibility_modifier'));
        } else if (language === 'rust' && node.type === 'mod_item') {
            const name = field(node, 'name')?.text ?? '';
            if (!field(node, 'body')) add(node, name, '*', `self::${name}`, true);
        } else if (language === 'rust' && node.type === 'use_declaration') {
            const argument = field(node, 'argument') ?? children(node)[0];
            if (!argument) continue;
            const exported = children(node).some(child => child.type === 'visibility_modifier');
            const visit = (item: Node, prefix: readonly string[]) => {
                if (item.type === 'use_wildcard') return;
                if (item.type === 'scoped_use_list' || item.type === 'use_list') {
                    const path = field(item, 'path'), list = field(item, 'list') ?? item;
                    const scope = [...prefix, ...(path?.text.split('::') ?? [])];
                    for (const child of children(list)) visit(child, scope);
                    return;
                }
                const path = item.type === 'use_as_clause' ? field(item, 'path') ?? item : item;
                const parts = [...prefix, ...path.text.split('::')], imported = parts.pop() ?? '';
                add(node, field(item, 'alias')?.text ?? imported, imported, parts.join('::') || 'crate', false, exported);
            };
            visit(argument, []);
        } else if (['java', 'kotlin'].includes(language) && ['import_declaration', 'import_header'].includes(node.type)) {
            const name = children(node).find(child => !['import_alias'].includes(child.type));
            if (!name || name.text.includes('*')) continue;
            const parts = name.text.split('.'), imported = parts.pop() ?? '';
            const alias = children(node).find(child => child.type === 'import_alias')?.namedChildren.at(-1)?.text;
            add(node, alias ?? imported, imported, parts.join('.'));
        }
    }
    return result;
}
