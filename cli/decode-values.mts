import { GraphInputError } from '../dist/index.js';
import type { JsonObject, JsonValue, NodeDraft, Source } from '../dist/index.js';

export function record(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new GraphInputError('$cache', 'expected object');
    return Object.fromEntries(Object.entries(value));
}
export function text(value: unknown): string {
    if (typeof value !== 'string') throw new GraphInputError('$cache', 'expected string');
    return value;
}
export function number(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new GraphInputError('$cache', 'expected finite number');
    return value;
}
export function bool(value: unknown): boolean {
    if (typeof value !== 'boolean') throw new GraphInputError('$cache', 'expected boolean');
    return value;
}
export function list<T>(value: unknown, decode: (entry: unknown) => T): T[] {
    if (!Array.isArray(value)) throw new GraphInputError('$cache', 'expected array');
    const entries: readonly unknown[] = value;
    return entries.map(decode);
}
export function choice<T extends string>(value: unknown, choices: readonly T[]): T {
    for (const candidate of choices) if (value === candidate) return candidate;
    throw new GraphInputError('$cache', 'unexpected enum value');
}
export function optional<T>(value: unknown, decode: (entry: unknown) => T): T | undefined {
    return value === undefined ? undefined : decode(value);
}
export function json(value: unknown, depth = 0): JsonValue {
    if (depth > 128) throw new GraphInputError('$cache', 'JSON nesting exceeds 128 levels');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return number(value);
    if (Array.isArray(value)) return list(value, entry => json(entry, depth + 1));
    return Object.fromEntries(Object.entries(record(value)).map(([key, entry]) => [key, json(entry, depth + 1)]));
}
export function jsonObject(value: unknown): JsonObject {
    return Object.fromEntries(Object.entries(record(value)).map(([key, entry]) => [key, json(entry)]));
}
export function source(value: unknown): Source {
    const item = record(value);
    const endLine = optional(item['endLine'], number);
    const revision = optional(item['revision'], text);
    const url = optional(item['url'], text);
    return {
        path: text(item['path']), line: number(item['line']), pointer: text(item['pointer']), contentHash: text(item['contentHash']),
        ...(endLine === undefined ? {} : { endLine }), ...(revision === undefined ? {} : { revision }), ...(url === undefined ? {} : { url })
    };
}
export function node(value: unknown): NodeDraft {
    const item = record(value);
    return { id: text(item['id']), kind: text(item['kind']), name: text(item['name']), attributes: jsonObject(item['attributes']), sources: list(item['sources'], source) };
}
