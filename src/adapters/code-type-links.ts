import type { CodeModule } from './code.js';
import type { Edge, Source } from '../core/model.js';
import { canonicalJson } from '../core/canonical.js';

/** Same-package declaration types are separate from imports and never imply runtime calls. */
export function codeTypeLinks(modules: readonly CodeModule[]): readonly Edge[] {
    const definitions = new Map<string, { readonly module: CodeModule; readonly line: number; readonly pointer: string; }[]>();
    const scope = (module: CodeModule): string => canonicalJson([module.node.sources[0]?.path.split('/').slice(0, -1).join('/'), module.node.attributes['package']]);
    for (const module of modules) {
        if (module.language !== 'go' || typeof module.node.attributes['package'] !== 'string') continue;
        const values = module.node.attributes['packageTypeDeclarations'];
        if (!Array.isArray(values)) continue;
        for (const [index, value] of values.entries()) if (value && typeof value === 'object' && !Array.isArray(value) && typeof value['name'] === 'string' && typeof value['line'] === 'number') {
            const key = `${scope(module)}:${value['name']}`;
            const found = definitions.get(key) ?? [];
            found.push({ module, line: value['line'], pointer: `/packageTypeDeclarations/${index}` }); definitions.set(key, found);
        }
    }
    const at = (source: Source, line: number, pointer: string): Source => ({ ...source, line, endLine: line, pointer, ...(source.url ? { url: source.url.replace(/#L\d+(?:-L\d+)?$/u, `#L${line}`) } : {}) });
    const edges: Edge[] = [];
    for (const module of modules) {
        if (module.language !== 'go' || typeof module.node.attributes['package'] !== 'string') continue;
        const uses = module.node.attributes['declaredTypeReferences'], source = module.node.sources[0];
        if (!source || !Array.isArray(uses)) continue;
        for (const [index, use] of uses.entries()) {
            if (!use || typeof use !== 'object' || Array.isArray(use) || typeof use['name'] !== 'string' || typeof use['line'] !== 'number') continue;
            const matches = definitions.get(`${scope(module)}:${use['name']}`), target = matches?.[0];
            const targetSource = target?.module.node.sources[0];
            if (matches?.length !== 1 || !target || !targetSource || target.module.node.id === module.node.id) continue;
            const pointer = `/declaredTypeReferences/${index}`;
            edges.push({ id: `type-reference:${canonicalJson([module.node.id, target.module.node.id, use['name'], use['line']])}`, kind: 'references', source: module.node.id, target: target.module.node.id, directed: true, field: pointer, attributes: { referenceKind: 'declared-type', name: use['name'] }, sources: [at(source, use['line'], pointer), at(targetSource, target.line, target.pointer)] });
        }
    }
    return edges;
}
