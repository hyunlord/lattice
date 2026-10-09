import type { Edge, Facet, Finding, View, Snapshot, Repository, GraphDraft } from '../dist/index.js';
import { record, text, number, bool, list, choice, optional, json, jsonObject, source, node } from './decode-values.mjs';

export function edge(value: unknown): Edge {
    const item = record(value);
    const attributes = optional(item['attributes'], jsonObject);
    return { id: text(item['id']), kind: text(item['kind']), source: text(item['source']), target: text(item['target']), directed: bool(item['directed']), field: text(item['field']), sources: list(item['sources'], source), ...(attributes === undefined ? {} : { attributes }) };
}
function facet(value: unknown): Facet {
    const item = record(value);
    return { id: text(item['id']), nodeId: text(item['nodeId']), key: text(item['key']), value: json(item['value']), ruleId: text(item['ruleId']), sources: list(item['sources'], source) };
}
function gate(value: unknown): NonNullable<Finding['gate']> {
    const item = record(value);
    return { metric: text(item['metric']), comparator: choice(item['comparator'], ['eq', 'ne', 'gt', 'gte', 'lt', 'lte']), threshold: number(item['threshold']), status: choice(item['status'], ['pass', 'fail', 'unknown']) };
}
function finding(value: unknown): Finding {
    const item = record(value);
    const intent = optional(item['intent'], text);
    const implementation = optional(item['implementation'], text);
    const parsedGate = optional(item['gate'], gate);
    return {
        id: text(item['id']), ruleId: text(item['ruleId']), severity: choice(item['severity'], ['info', 'warning', 'error']), targetIds: list(item['targetIds'], text), metrics: jsonObject(item['metrics']), message: text(item['message']), basis: choice(item['basis'], ['computed', 'authored-interpretation', 'source-support']), sources: list(item['sources'], source),
        ...(intent === undefined ? {} : { intent }), ...(implementation === undefined ? {} : { implementation }), ...(parsedGate === undefined ? {} : { gate: parsedGate })
    };
}
function view(value: unknown): View {
    const item = record(value);
    const description = optional(item['description'], text);
    return { id: text(item['id']), type: choice(item['type'], ['matrix', 'cycle', 'distribution', 'table']), label: text(item['label']), query: jsonObject(item['query']), sources: list(item['sources'], source), ...(description === undefined ? {} : { description }) };
}
function snapshot(value: unknown): Snapshot {
    const item = record(value);
    const commit = optional(item['commit'], text);
    return { id: text(item['id']), graphHash: text(item['graphHash']), lensHash: item['lensHash'] === null ? null : text(item['lensHash']), inputFingerprint: text(item['inputFingerprint']), coverage: text(item['coverage']), artifactPath: text(item['artifactPath']), ...(commit === undefined ? {} : { commit }) };
}
export function parseSnapshots(value: unknown): readonly Snapshot[] {
    return list(value, snapshot);
}
function repository(value: unknown): Repository {
    const item = record(value);
    const commit = optional(item['commit'], text);
    const remoteUrl = optional(item['remoteUrl'], text);
    return { name: text(item['name']), dirty: bool(item['dirty']), sourceFingerprint: text(item['sourceFingerprint']), ...(commit === undefined ? {} : { commit }), ...(remoteUrl === undefined ? {} : { remoteUrl }) };
}
export function parseGraph(value: unknown): GraphDraft {
    const item = record(value);
    return {
        repository: repository(item['repository']), nodes: list(item['nodes'], node), edges: list(item['edges'], edge), facets: list(item['facets'], facet), findings: list(item['findings'], finding), views: list(item['views'], view), snapshots: parseSnapshots(item['snapshots']), lensDigest: item['lensDigest'] === null ? null : text(item['lensDigest']),
        adapterVersions: Object.fromEntries(Object.entries(record(item['adapterVersions'])).map(([key, version]) => [key, text(version)])),
        inputs: list(item['inputs'], value => { const input = record(value); return { path: text(input['path']), contentHash: text(input['contentHash']) }; })
    };
}
