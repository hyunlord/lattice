import { canonicalJson } from '../dist/core/canonical.js';
export const toolNames = ['lattice_overview', 'lattice_find', 'lattice_node', 'lattice_trace', 'lattice_matrix', 'lattice_findings', 'lattice_diff', 'lattice_freshness'] as const;
export type ToolName = typeof toolNames[number];
export function isToolName(value: unknown): value is ToolName { return toolNames.some(name => name === value); }
export class McpArgumentError extends Error {
    constructor(readonly field: string, message: string) { super(`${field}: ${message}`); this.name = 'McpArgumentError'; }
}
export function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const text = { type: 'string', minLength: 1, maxLength: 4096 } as const;
const paging = { offset: { type: 'integer', minimum: 0, maximum: 10000000, default: 0 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } } as const;
const scope = { layer: { type: 'string', description: 'Exact layer; empty string selects unlayered nodes. Omission uses the viewer default layer.' } } as const;
const filters = { ...scope, kind: text, q: text, tags: { type: 'array', items: text, maxItems: 50, description: 'Every tag must occur in node attributes.tags.' }, facets: { type: 'object', additionalProperties: true, description: 'AND filters of facet keys to exact typed JSON values; 1 differs from "1".' } } as const;
const definitions = {
    lattice_overview: { description: 'Summarize the same visible layer as the web home: counts, kind distribution, findings and views, with source provenance.', properties: { ...scope, ...paging }, required: [] },
    lattice_find: { description: 'Find visible nodes using AND-combined kind, text, tags and typed facet filters. Stable ID order and bounded pagination.', properties: { ...filters, ...paging }, required: [] },
    lattice_node: { description: 'Read one exact node ID, its source evidence, facets, findings and incoming/outgoing/undirected connections. Each collection is paginated independently.', properties: { ...scope, ...paging, id: text }, required: ['id'] },
    lattice_trace: { description: 'Trace a directed shortest path from/to, or an induced neighborhood within hops (default 1). Undirected edges traverse both ways; cycles are visited once.', properties: { ...scope, ...paging, from: text, to: text, hops: { type: 'integer', minimum: 0, maximum: 10 }, direction: { type: 'string', enum: ['out', 'in', 'both'], default: 'out' }, edgeKind: text }, required: ['from'] },
    lattice_matrix: { description: 'Read a named lens matrix, or the automatic kind matrix, using exactly the web projection. Rows, columns, cells and cell evidence have independent pagination.', properties: { ...scope, ...paging, view: text }, required: [] },
    lattice_findings: { description: 'Read findings and their computed/authored basis, metrics, provenance and optional gates. Warning severity does not imply a gate.', properties: { ...scope, ...paging, severity: { type: 'string', enum: ['info', 'warning', 'error'] }, rule: text, node: text, gate: { type: 'string', enum: ['pass', 'fail', 'unknown', 'none'] } }, required: [] },
    lattice_diff: { description: 'Compare the graph at a Git revision to the current repository graph and return semantic changes with source evidence.', properties: { ...scope, ...paging, ref: text }, required: ['ref'] },
    lattice_freshness: { description: 'Check cache freshness against repository inputs and lens without inventing a current result from stale data.', properties: {}, required: [] },
} satisfies Record<ToolName, { description: string; properties: Record<string, unknown>; required: string[]; }>;
export const toolDefinitions = toolNames.map(name => ({ name, description: definitions[name].description, inputSchema: { type: 'object', properties: definitions[name].properties, required: definitions[name].required, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));
export function parseArguments(name: ToolName, input: unknown): Record<string, unknown> {
    if (!object(input)) throw new McpArgumentError('arguments', 'expected an object');
    const definition = definitions[name];
    for (const required of definition.required) if (!(required in input)) throw new McpArgumentError(required, 'required');
    for (const [key, value] of Object.entries(input)) {
        if (!Object.hasOwn(definition.properties, key)) throw new McpArgumentError(key, 'unknown argument');
        switch (key) {
            case 'offset': case 'limit': case 'hops': {
                const minimum = key === 'limit' ? 1 : 0, maximum = key === 'limit' ? 200 : key === 'hops' ? 10 : 10000000;
                if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) throw new McpArgumentError(key, `expected integer ${minimum}..${maximum}`);
                break;
            }
            case 'tags':
                if (!Array.isArray(value) || value.length > 50 || !value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 4096)) throw new McpArgumentError(key, 'expected at most 50 nonempty strings');
                break;
            case 'facets':
                if (!object(value) || Object.keys(value).length > 50) throw new McpArgumentError(key, 'expected at most 50 facet values');
                try { canonicalJson(value); } catch { throw new McpArgumentError(key, 'expected finite JSON values'); }
                break;
            default: {
                if (typeof value !== 'string' || value.length > 4096 || (key !== 'layer' && !value.length)) throw new McpArgumentError(key, 'expected nonempty string (layer may be empty)');
                const choices: Record<string, readonly string[]> = { direction: ['out', 'in', 'both'], severity: ['info', 'warning', 'error'], gate: ['pass', 'fail', 'unknown', 'none'] };
                if (choices[key] && !choices[key].includes(value)) throw new McpArgumentError(key, `expected ${choices[key].join(', ')}`);
            }
        }
    }
    return input;
}
