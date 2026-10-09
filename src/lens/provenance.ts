import type { JsonObject, JsonValue } from "../core/canonical.js";
import type { Source } from "../core/model.js";
import type { ExtractedRecord } from "../adapters/types.js";
import type { Environment, RuntimeValue } from "./runtime.js";
function isRuntimeArray(value: RuntimeValue): value is readonly RuntimeValue[] { return Array.isArray(value); }
export function addSources(env: Environment, sources: readonly Source[]): void {
    for (const source of sources) env.sources.set(`${source.path}#${source.pointer}`, source);
}
export type Provenance = { readonly roots: WeakMap<object, readonly Source[]>; readonly locations: WeakMap<object, ReadonlyMap<string, readonly Source[]>>; readonly dependencies: WeakMap<object, ReadonlyMap<string, readonly Source[]>>; };
export function createProvenance(): Provenance { return { roots: new WeakMap(), locations: new WeakMap(), dependencies: new WeakMap() }; }
export function retainSources<T extends object>(value: T, sources: readonly Source[], provenance: Provenance): T {
    provenance.roots.set(value, [...new Map(sources.map(source => [`${source.path}#${source.pointer}`, source])).values()]);
    return value;
}
export function locatedRecord(record: ExtractedRecord, provenance: Provenance): JsonObject {
    const view: JsonObject = { ...record.node.attributes, id: record.node.id, kind: record.node.kind, name: record.node.name };
    const register = (value: RuntimeValue, pointer: string): void => {
        if (value === null || typeof value !== "object") return;
        const fields = new Map<string, readonly Source[]>();
        const own = record.fields[pointer];
        if (own) provenance.roots.set(value, [own]);
        for (const [key, child] of Object.entries(value)) {
            const childPointer = `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
            const source = record.fields[childPointer];
            if (source) fields.set(key, [source]);
            register(child, childPointer);
        }
        provenance.locations.set(value, fields);
    };
    register(view, "");
    if (!provenance.roots.has(view)) provenance.roots.set(view, record.node.sources);
    return view;
}
export function locatedPath(value: RuntimeValue, path: readonly JsonValue[], env: Environment): RuntimeValue {
    if (!path.length) {
        if (value !== null && typeof value === "object") addSources(env, env.provenance?.roots.get(value) ?? []);
        return value;
    }
    const [head, ...tail] = path;
    if (head === "*" && isRuntimeArray(value)) {
        const dependencies = new Map<string, readonly Source[]>();
        const result = value.map((_, index) => {
            const sources = new Map<string, Source>();
            const child = locatedPath(value, [index, ...tail], { ...env, sources });
            addSources(env, [...sources.values()]);
            dependencies.set(String(index), [...sources.values()]);
            return child;
        });
        env.provenance?.dependencies.set(result, dependencies);
        return result;
    }
    if (value === null || typeof value !== "object") return undefined;
    const key = pathSegment(head);
    if (!Object.hasOwn(value, key)) return undefined;
    addSources(env, env.provenance?.dependencies.get(value)?.get(key) ?? []);
    if (!tail.length) addSources(env, env.provenance?.locations.get(value)?.get(key) ?? []);
    const child = isRuntimeArray(value) ? value[Number(key)] : value[key];
    return locatedPath(child, tail, env);
}
export function itemEnvironment(env: Environment, input: readonly RuntimeValue[], index: number): Environment {
    const sources = collectionSources(env, input, index);
    return { ...env, item: input[index], itemSources: sources };
}
export function collectionSources(env: Environment, input: readonly RuntimeValue[], index: number): readonly Source[] {
    return [...(env.provenance?.locations.get(input)?.get(String(index)) ?? []), ...(env.provenance?.dependencies.get(input)?.get(String(index)) ?? [])];
}
export function collected(entries: readonly { readonly value: RuntimeValue; readonly sources: readonly Source[]; }[], env: Environment): readonly RuntimeValue[] {
    const result = entries.map(entry => entry.value);
    env.provenance?.dependencies.set(result, new Map(entries.map((entry, index) => [String(index), entry.sources])));
    return result;
}
export function pathSegment(value: JsonValue | undefined): string {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
    if (typeof value !== "string") throw new Error("Lens expected a string");
    return value;
}
