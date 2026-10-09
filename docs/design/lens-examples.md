# Lens v1 concrete operand and selector contract

These design examples specify the interpreter contract for L1. They are not an implemented schema or a completed bs-mobile lens. YAML block/flow syntax and equivalent JSON are valid inputs; implementation must also support actual YAML and CSV fixtures.

## Operand grammar

An expression object has `op` and only the operands for that operator. Literal arrays/objects must be wrapped in `{op: literal, value: ...}` to avoid ambiguity. Every scalar is a literal.

| op | Required operands | Result |
| --- | --- | --- |
| get | `from`: node/item/vars/graph; `path`: static segment array | value or missing; `*` maps one collection level |
| at | `object`: expression; `key`: scalar expression | own object property at evaluated key or missing; no prototype access |
| lookup | `kind`: string; `field`: path; `equals`: expression | sole matched node's attributes; no match missing, multiple matches diagnostic |
| literal | `value`: JSON value | unchanged value |
| coalesce | `values`: expression array | first non-null/non-missing result |
| eq/ne/gt/gte/lt/lte | `left`, `right`: expressions | typed comparison; no implicit string-number conversion |
| and/or/concat | `values`: expression array | boolean short-circuit / array concatenation |
| not/exists/count/unique/flatten/sum | `value`: expression | documented unary result; count missing is missing, not zero |
| in | `value`: expression; `collection`: expression | exact scalar membership |
| filter/map/any/all | `input`: expression; `where` for predicate or `value` for map | evaluate with `item` rebound, outer `node` retained |
| groupBy | `input`: expression; `key`: expression | key-sorted groups with input-order members |
| case | `cases`: array of `{when, value}`; `default`: expression | first matching case |
| join | `input`: expression; `separator`: string | join scalar values, missing input remains missing |
| source | `value`: expression | retained source spans of located value |
| codeSupport | `rule`: string | materialized status/evidence for current node |

`derived[]` entries have `id`, `scope` (node or graph), optional `kinds`, and `value`. For node scope they are evaluated for matching nodes; graph scope evaluated once. `vars` merges graph and current-node derived values; duplicate IDs forbidden. Dependencies come from `get from: vars`, validated as an acyclic graph. Query shape is `{kinds?: string[], where?: expression}`; omitted kinds means all, omitted where true. `get from: graph, path: [nodes]` returns normalized nodes with attributes; `node` and `item` within record queries expose attributes plus immutable `id`/`kind`/`name`. These reserved keys cannot be overridden by raw attributes. Lookup returns this same record view.

`synthetics[]` entries: `id`, `kind`, `name`, `attributes`. IDs must not collide with extracted records; each synthetic's source is its exact lens source span. Edges reference synthetic IDs through the normal resolver. No implicit product hubs.

## Profile membership and overrides

```yaml
schemaVersion: 1
name: Example source projections
kinds:
  - id: profile
    label: Profile
    files: [data/profiles/*.json]
    idField: id
    nameField: name
    columns: [name]
  - id: charter
    label: Charter
    files: [data/charters/*.json]
    idField: id
    nameField: name
    columns: [name, concept]
synthetics:
  - id: hub:land
    kind: target
    name: Land
    attributes: {role: growth-target}
derived:
  - id: profile
    scope: graph
    value:
      op: lookup
      kind: profile
      field: [id]
      equals: core:first_playable
  - id: selected
    scope: node
    kinds: [charter]
    value:
      op: in
      value: {op: get, from: node, path: [id]}
      collection: {op: get, from: vars, path: [profile, runtime, charters]}
  - id: effective
    scope: node
    kinds: [charter]
    value:
      op: coalesce
      values:
        - op: at
          object: {op: get, from: vars, path: [profile, runtimeOverrides, charters]}
          key: {op: get, from: node, path: [id]}
        - {op: get, from: node, path: [runtimeProjection]}
  - id: referenceEffects
    scope: node
    kinds: [charter]
    value: {op: get, from: node, path: [runtimeProjection, effects]}
facets:
  - id: reference-depth
    key: referenceDepth
    kinds: [charter]
    cases:
      - when: {op: not, value: {op: get, from: vars, path: [selected]}}
        value: design
      - when:
          op: and
          values:
            - op: gt
              left: {op: count, value: {op: get, from: vars, path: [referenceEffects]}}
              right: 0
            - op: all
              input: {op: get, from: vars, path: [referenceEffects]}
              where:
                op: eq
                left: {op: get, from: item, path: [operation]}
                right: stat-add
        value: stat
      - when:
          op: any
          input: {op: get, from: vars, path: [referenceEffects]}
          where:
            op: ne
            left: {op: get, from: item, path: [operation]}
            right: stat-add
        value: unique
    default: design
findings:
  - id: selected-charters
    query:
      kinds: [charter]
      where: {op: get, from: vars, path: [selected]}
    metrics:
      selected: {op: count, value: {op: get, from: vars, path: [targets]}}
    template: "Selected records: {selected}"
    severity: info
    basis: computed
    gate: {metric: selected, comparator: eq, threshold: 8}
```

Finding metric evaluation binds `vars.targets` to the query results and retains each record's derived environment. Facet `cases` use the same expression semantics as `case`. `selected-charters` is an example regression gate, not a recommended perpetual content-count restriction; the complete consumer lens must distinguish design-quality gates from pinned-baseline acceptance assertions.

## Code-link selectors and alternate paths

`codeLinks[]` takes `id`, `query`, `values` (expression yielding operation strings), `language`, `files`, and `selectors[]`. Every selector has `kind`, `within` (method name) and selector-specific fields. One value may match any selector, with evidence retained for each match.

```yaml
codeLinks:
  - id: effect-dispatch
    query: {kinds: [charter]}
    values: {op: get, from: vars, path: [effective, effects, '*', operation]}
    language: csharp
    files: [core/src/SowSiege.Core/RuntimeSystem.cs]
    selectors:
      - kind: switch-case
        within: Apply
        expression: effect.Operation
      - kind: call-argument
        within: Modify
        callee: OwnedEffects
        argumentIndex: 1
      - kind: call-argument
        within: PlantingPosition
        callee: OwnedEffects
        argumentIndex: 1
```

For `switch-case`, parse the named method's bounded body, find a switch whose normalized token expression matches `expression`, and extract string case labels with nonempty handler bodies; preserve fall-through groups. For `call-argument`, match the call within the named method, inspect zero-based `argumentIndex` for a string literal, and require the call result be consumed in executable body (the present `foreach` path). Comments, unreachable text outside the method, and unparsed interpolation are not positive evidence. A matched selector is static support only; it is not complete control-flow or gameplay proof.

Unsupported means the specified complete dispatch surface was successfully parsed and contained no matching selector value. Unknown means a required source is missing, language/syntax unsupported, method/selector surface not found, ambiguous, or incomplete. If any selector required for coverage is unknown and there is no positive handler, report unknown rather than unsupported. Matched handler with other coverage gaps is supported **with partial-coverage diagnostics**, not a whole-surface success. Invalid selector configuration fails lens validation.

The lexer/adapters know C# token syntax and generic selector kinds, not `stat-add` or product names. No schema/enum string alone establishes support. A future handler refactor that changes method shapes must visibly change coverage and invalidate the dependent cache.
