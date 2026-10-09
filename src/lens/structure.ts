import { canonicalJson } from "../core/canonical.js";
import type { JsonObject, JsonValue } from "../core/canonical.js";
import { GraphInputError } from "../core/errors.js";
import type { Edge, Source, View } from "../core/model.js";
import type { ExtractedRecord } from "../adapters/types.js";
export { prepareRecords } from "./records.js";
import { addSources, array, evaluate, getPath, object, pathSegment, recordView, string } from "./runtime.js";
import type { Environment } from "./runtime.js";

export type LensContext = {
    readonly config: JsonObject;
    readonly definition: ExtractedRecord;
    readonly records: readonly ExtractedRecord[];
    readonly environments: ReadonlyMap<string, Environment>;
};
function sourceAt(definition: ExtractedRecord, pointer: string): Source {
    const source = definition.fields[pointer];
    if (!source) throw new GraphInputError(pointer, "Missing lens source span");
    return source;
}
export function matchesQuery(query: JsonObject, env: Environment): boolean {
    return (query["layer"] === undefined || query["layer"] === env.node?.["layer"]) && (query["kinds"] === undefined || array(query["kinds"]).includes(env.node?.["kind"] ?? null)) && (query["where"] === undefined || evaluate(query["where"], env) === true);
}
function environment(context: LensContext, record: ExtractedRecord): Environment {
    const env = context.environments.get(record.node.id);
    if (!env) throw new GraphInputError(record.node.id, "Missing lens environment");
    return { ...env, sources: new Map(env.sources) };
}
function targetRecord(context: LensContext, rule: JsonObject, alias: JsonValue, pointer: string): ExtractedRecord {
    const field = array(rule["targetField"] ?? ["id"]);
    const query = object(rule["targetQuery"] ?? {});
    const candidates = context.records.filter(candidate => {
        if (rule["targetKind"] !== undefined && candidate.node.kind !== string(rule["targetKind"])) return false;
        if (!matchesQuery(query, environment(context, candidate))) return false;
        if (field.length === 1 && field[0] === "id") return candidate.node.id === alias || candidate.node.attributes["id"] === alias || candidate.node.attributes["originalId"] === alias;
        const value = getPath(recordView(candidate.node), field);
        return value !== undefined && canonicalJson(value) === canonicalJson(alias);
    });
    if (candidates.length !== 1) throw new GraphInputError(pointer, `${candidates.length ? "Ambiguous" : "Unknown"} edge target ${canonicalJson(alias)}`);
    const target = candidates[0];
    if (!target) throw new GraphInputError(pointer, "Missing edge target");
    return target;
}
function matrixEdges({ context, rule, record, env, pointer }: { readonly context: LensContext; readonly rule: JsonObject; readonly record: ExtractedRecord; readonly env: Environment; readonly pointer: string; }): readonly Edge[] {
    const matrix = object(rule["matrix"]), id = string(rule["id"]);
    const ids = array(evaluate(matrix["ids"], env));
    const rows = array(evaluate(matrix["cells"], env));
    if (rows.length !== ids.length || new Set(ids.map(canonicalJson)).size !== ids.length) throw new GraphInputError(pointer, "Matrix requires distinct IDs and matching square cells");
    const targets = ids.map(alias => targetRecord(context, rule, alias, pointer));
    const result: Edge[] = [];
    const cellExpression = object(matrix["cells"]);
    const cellPrefix = cellExpression["op"] === "get" && cellExpression["from"] === "node" ? "/" + array(cellExpression["path"]).map(part => pathSegment(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/") : undefined;
    rows.forEach((value, row) => {
        const cells = array(value);
        if (cells.length !== ids.length) throw new GraphInputError(pointer, "Matrix requires matching square cells");
        cells.forEach((cell, column) => {
            if (cell === null || cell === "" || canonicalJson(cell) === canonicalJson(matrix["empty"] ?? null)) return;
            if (typeof cell === "object") throw new GraphInputError(pointer, "Matrix cell must be scalar");
            const source = targets[row], target = targets[column];
            if (!source || !target) throw new GraphInputError(pointer, "Matrix endpoint missing");
            const cellSource = cellPrefix === undefined ? undefined : record.fields[`${cellPrefix}/${row}/${column}`];
            const sources = new Map(env.sources);
            addSources({ ...env, sources }, [...source.node.sources, ...target.node.sources, ...(cellSource ? [cellSource] : []), sourceAt(context.definition, pointer)]);
            result.push({ id: `lens-edge:${canonicalJson([id, source.node.id, target.node.id, "forward"])}`, kind: id, source: source.node.id, target: target.node.id, directed: true, field: `${pointer}/matrix/${row}/${column}`, attributes: { label: String(cell), ...(rule["display"] === undefined ? {} : { display: string(rule["display"]) }) }, sources: [...sources.values()] });
        });
    });
    return result;
}
export function materializeEdges(context: LensContext): readonly Edge[] {
    const edges: Edge[] = [];
    const ruleIds = new Set<string>();
    array(context.config["edges"] ?? []).forEach((value, index) => {
        const rule = object(value), id = string(rule["id"]), pointer = `/edges/${index}`;
        if (!id || ruleIds.has(id)) throw new GraphInputError(pointer, "Duplicate or empty edge rule ID");
        ruleIds.add(id);
        const query = object(rule["source"] ?? {});
        const targetField = array(rule["targetField"] ?? ["id"]);
        const direction = rule["direction"] ?? "forward";
        if (direction !== "forward" && direction !== "reverse" && direction !== "undirected") throw new GraphInputError(pointer, "Invalid edge direction");
        for (const record of context.records) {
            const env = environment(context, record);
            if (!matchesQuery(query, env)) continue;
            if (rule["matrix"] !== undefined) { edges.push(...matrixEdges({ context, rule, record, env, pointer })); continue; }
            const result = evaluate(rule["target"], env);
            const targets = Array.isArray(result) ? result : [result];
            if (!targets.length) continue;
            for (const alias of targets) {
                if (alias === undefined || alias === null || typeof alias === "object") throw new GraphInputError(pointer, `Missing or nonscalar target for ${record.node.id}`);
                const target = targetRecord(context, rule, alias, pointer);
                const targetPointer = "/" + targetField.map(part => pathSegment(part).replaceAll("~", "~0").replaceAll("/", "~1")).join("/");
                const targetSource = target.fields[targetPointer];
                addSources(env, [...target.node.sources, ...(targetSource ? [targetSource] : []), sourceAt(context.definition, pointer)]);
                const source = direction === "reverse" ? target.node.id : record.node.id;
                const destination = direction === "reverse" ? record.node.id : target.node.id;
                const label = rule["label"] === undefined ? id : string(rule["label"]);
                edges.push({ id: `lens-edge:${canonicalJson([id, source, destination, direction])}`, kind: id, source, target: destination, directed: direction !== "undirected", field: pointer, attributes: { label, ...(rule["display"] === undefined ? {} : { display: string(rule["display"]) }) }, sources: [...env.sources.values()] });
            }
        }
    });
    return [...new Map(edges.map(edge => [edge.id, edge])).values()];
}
export function materializeViews(context: LensContext, edges: readonly Edge[]): readonly View[] {
    const ids = new Set<string>();
    return array(context.config["views"] ?? []).map((value, index): View => {
        const rule = object(value), id = string(rule["id"]), pointer = `/views/${index}`;
        if (!id || ids.has(id)) throw new GraphInputError(pointer, "Duplicate or empty view ID");
        ids.add(id);
        const type = rule["type"];
        if (type !== "matrix" && type !== "cycle" && type !== "distribution" && type !== "table") throw new GraphInputError(pointer, "Invalid view type");
        const sources = new Map<string, Source>();
        const selected = context.records.map(record => ({ record, env: environment(context, record) })).filter(({ env }) => matchesQuery(object(rule["query"] ?? {}), env));
        const nodeIds = selected.map(({ record }) => record.node.id);
        const evaluateValue = (expression: JsonValue | undefined, env: Environment): JsonValue => {
            const result = evaluate(expression, env);
            if (result === undefined) throw new GraphInputError(pointer, "View expression produced a missing value");
            return result;
        };
        let data: JsonObject;
        switch (type) {
            case "cycle": {
                const kinds = rule["edgeKinds"] === undefined ? undefined : array(rule["edgeKinds"]);
                const selectedIds = new Set(nodeIds);
                const links = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target) && (!kinds || kinds.includes(edge.kind)));
                for (const edge of links) for (const source of edge.sources) sources.set(canonicalJson(source), source);
                data = { edgeIds: links.map(edge => edge.id) }; break;
            }
            case "table": {
                const columns = array(rule["columns"]).map(value => object(value));
                const names = columns.map(column => string(column["id"]));
                if (new Set(names).size !== names.length) throw new GraphInputError(pointer, "Duplicate table column ID");
                data = { columns: columns.map(column => ({ id: string(column["id"]), label: string(column["label"]) })), rows: selected.map(({ record, env }) => ({ nodeId: record.node.id, values: Object.fromEntries(columns.map(column => [string(column["id"]), evaluateValue(column["value"], env)])) })) }; break;
            }
            case "distribution": case "matrix": {
                if (type === "matrix" && rule["edgeKinds"] !== undefined) {
                    const kinds = array(rule["edgeKinds"]), selectedIds = new Set(nodeIds);
                    const links = edges.filter(edge => selectedIds.has(edge.source) && selectedIds.has(edge.target) && kinds.includes(edge.kind));
                    const cells = new Map<string, { readonly source: string; readonly target: string; readonly labels: string[]; readonly edgeIds: string[]; }>();
                    for (const edge of links) {
                        const pairs = edge.directed || edge.source === edge.target ? [[edge.source, edge.target]] : [[edge.source, edge.target], [edge.target, edge.source]];
                        for (const pair of pairs) {
                            const source = pair[0], target = pair[1];
                            if (source === undefined || target === undefined) throw new GraphInputError(pointer, "Missing matrix endpoint");
                            const key = canonicalJson(pair), cell = cells.get(key) ?? { source, target, labels: [], edgeIds: [] };
                            cell.labels.push(String(edge.attributes?.["label"] ?? edge.kind)); cell.edgeIds.push(edge.id); cells.set(key, cell);
                        }
                        for (const source of edge.sources) sources.set(canonicalJson(source), source);
                    }
                    data = { rows: nodeIds, columns: nodeIds, edgeKinds: kinds, cells: [...cells.values()].map(cell => ({ source: cell.source, target: cell.target, label: cell.labels.join(" · "), edgeIds: cell.edgeIds })) }; break;
                }
                const groups = new Map<string, { readonly values: readonly JsonValue[]; readonly nodeIds: string[]; }>();
                for (const { record, env } of selected) {
                    const values = type === "matrix" ? [evaluateValue(rule["row"], env), evaluateValue(rule["column"], env)] : [evaluateValue(rule["groupBy"], env)];
                    const key = canonicalJson(values);
                    const group = groups.get(key) ?? { values, nodeIds: [] };
                    group.nodeIds.push(record.node.id); groups.set(key, group);
                }
                const groupsInOrder = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, group]) => group);
                data = type === "matrix" ? { cells: groupsInOrder.map(group => ({ row: group.values[0] ?? null, column: group.values[1] ?? null, count: group.nodeIds.length, nodeIds: group.nodeIds })) } : { buckets: groupsInOrder.map(group => ({ value: group.values[0] ?? null, count: group.nodeIds.length, nodeIds: group.nodeIds })) }; break;
            }
        }
        for (const { env } of selected) for (const source of env.sources.values()) sources.set(canonicalJson(source), source);
        const lensSource = sourceAt(context.definition, pointer); sources.set(canonicalJson(lensSource), lensSource);
        return { id, type, label: string(rule["label"]), ...(rule["description"] === undefined ? {} : { description: string(rule["description"]) }), query: { nodeIds, ...data }, sources: [...sources.values()] };
    });
}
