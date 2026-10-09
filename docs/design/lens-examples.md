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
| not/exists/count/unique/flatten/sum/aggregate | `value`: expression | documented unary result; count missing is missing, not zero |
| in | `value`: expression; `collection`: expression | exact scalar membership |
| filter/map/any/all | `input`: expression; `where` for predicate or `value` for map | evaluate with `item` rebound, outer `node` retained |
| groupBy | `input`: expression; `key`: expression | key-sorted groups with input-order members |
| case | `cases`: array of `{when, value}`; `default`: expression | first matching case |
| join | `input`: expression; `separator`: string | join scalar values, missing input remains missing |
| source | `value`: expression | retained source spans of located value |
| codeSupport | `rule`: string | materialized status/evidence for current node |

`source` evaluates its operand with isolated evidence and returns source objects sorted by path and pointer, deduplicated by that pair. Each object retains the input path, pointer, line, content hash and any available end line, revision and URL. Repeated calls return the same evidence even when another rule already read those fields. Literals and direct reads of absent fields have no source.

Direct reads identify the selected field; wildcard reads expand to concrete indices. A whole-container read retains its container span. A derived value or lexical binding retains the input dependencies used to compute it, independently of other bindings. Selecting a member of a computed container retains that binding's dependencies, even if the member is absent; it never invents a pointer to the absent member. Consequently, a computed value can have several source spans rather than one fictional location. This is retained dependency evidence, not minimal dataflow slicing, an execution trace or proof of runtime behavior.

Generated graph and finding-target containers have no authored container location. Reading or counting them retains their actual members' input spans. Traversing to an individual member field consumes only that field's location and applicable computed dependencies.

Finding `intent` and `implementation` accept literal strings or expressions in the finding environment: graph-derived variables, `targets`, `targetValues` and the graph are available, with no current node. A string result is retained, including an empty string; missing or null omits that optional description. Other results and malformed expressions fail with the lens path, line and description pointer. Evaluated input sources join the finding's retained evidence. For example, a `map` over `vars.targetValues` can read each `item.derived.intent`, and `join` can combine those strings into the finding description.

`derived[]` entries have `id`, `scope` (node or graph), optional `kinds`, and `value`. For node scope they are evaluated for matching nodes; graph scope evaluated once. `vars` merges graph and current-node derived values; duplicate IDs forbidden. Dependencies come from `get from: vars`, validated as an acyclic graph. Declarations are evaluated in stable dependency order, independent of their array order. The first path segment must name a declared derived value or an in-scope `let` binding; whole-`vars` and wildcard-root reads are not dependency selectors. A `let` binding is visible to later bindings and its body, but not its own initializer; literal payloads are not scanned for dependencies. Graph-derived values may depend only on graph-derived values; node-derived values may also depend on graph values. Kind/layer restrictions remain in force, so a dependency excluded for a node remains missing there. Duplicate IDs, unknown dependencies, cycles and graph-to-node dependencies fail lens parsing with the responsible source path, line and pointer. Query shape is `{kinds?: string[], where?: expression}`; omitted kinds means all, omitted where true. `get from: graph, path: [nodes]` returns normalized nodes with attributes; `node` and `item` within record queries expose attributes plus immutable `id`/`kind`/`name`. These reserved keys cannot be overridden by raw attributes. Lookup returns this same record view.

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

Finding metric evaluation binds `vars.targets` to the query results and `vars.targetValues` to `{node, derived}` pairs retaining each target's record view and derived environment. These are finding-only bindings. Facet `cases` use the same expression semantics as `case`. `selected-charters` is an example regression gate, not a recommended perpetual content-count restriction; the complete consumer lens must distinguish design-quality gates from pinned-baseline acceptance assertions.

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

The `values` expression accepts a single nonempty string or an array of nonempty strings. Values are deduplicated and sorted. A missing, empty, or invalid result is unknown, not vacuous support. Each matching node retains a facet with key `codeSupport:<ruleId>` and this JSON value:

```json
{
  "status": "supported",
  "coverage": "complete",
  "values": [{"value": "trim", "status": "supported", "evidence": []}],
  "diagnostics": []
}
```

`evidence` contains exact code `Source` objects. Diagnostics have `{selector, reason, sources}`, where selector is the zero-based selector index or `-1` for rule-wide coverage. Facet sources retain data, lens, and inspected code provenance, including negative surfaces. Overall status is unsupported if any value is definitively unsupported, otherwise unknown if any value is unknown or there are no values, otherwise supported. Coverage is partial if a required surface or pattern is missing or incomplete. A rule outside its query produces an explicit unknown/not-applicable expression result for that node, without persisting a support facet. Methods resolve across the complete matched file set; absent or ambiguous named methods are unknown.

`{op: codeSupport, rule: effect-dispatch}` returns that same serialized result for the current node. Derived definitions and code links share one dependency graph: `get from: vars` in code-link values/query can depend on derived values, and derived expressions can depend on `codeSupport`. Unknown references, cycles, and graph-derived current-node support reads fail with lens source locations. Code links run before explicit edges, with the same edge-dependent expression restriction as derived values. A nested `item` never implicitly changes the current node. Finding aggregate metrics have no current node; they can read each target's retained derived values through `vars.targetValues` entries shaped `{node, derived}` (for example a filter over targetValues reading `item.derived.implementation.status`). `vars.targets` remains the unchanged record-view array, including any authored attribute named `derived`. The new finding-only binding does not implicitly rebind the current node.

The lexer/adapters know C# token syntax and generic selector kinds, not `stat-add` or product names. No schema/enum string alone establishes support. A future handler refactor that changes method shapes must visibly change coverage and invalidate the dependent cache.

## Synthetic relationships and materialized views

`synthetics[]` creates records before ordinary ID reference resolution and all lens calculations. Each record has `id`, `kind`, `name`, and optional literal `attributes`. A synthetic ID collision is an error. Extracted duplicate aliases are disambiguated before per-node environments are built, so separate records retain separate facets and findings. Ordinary data fields can reference a synthetic ID.

`edges[]` uses the following concrete syntax:

```yaml
edges:
  - id: supplies
    source: {kinds: [producer]}
    target: {op: get, from: node, path: [destination]}
    targetKind: resource
    targetField: [alias]
    label: Supplies
    direction: forward
    display: emphasis
```

`source` is the standard `{kinds?, where?}` query. `target` evaluates once per selected source with its derived `vars`; it returns one scalar alias or an array of scalar aliases. An empty array explicitly means no relationship. Missing/null/object aliases fail; absent or ambiguous target matches fail with the edge rule pointer. `targetKind` optionally limits the alias namespace. `targetField` is a static attribute path, default `[id]`; default ID lookup accepts resolved IDs and original aliases, but does not choose an ambiguous original alias. `direction` is `forward` (default), `reverse`, or `undirected`. The rule ID is the edge kind, and label/display are presentation attributes. Edge identity includes rule/source/target/direction and excludes mutable label/display. Evidence retains source/target records and the exact lens rule span.

Graph and node derived values are prepared before explicit edges because target expressions may depend on them. Facets, findings, and views run after edges; their `get from: graph, path: [edges]` includes inferred and lens-defined edges. Derived definitions can read inferred and structural edges in this phase. Explicit lens edges are materialized afterward; expressions depending on those edges belong in facets/findings/views.

Every `views[]` entry has `id`, `type`, `label`, optional `description`, and optional standard `query`. Omitted query selects every interpreted record, including synthetics. The four view types use expressions evaluated with each selected record's node/derived environment:

```yaml
views:
  - id: categories
    type: matrix
    label: Group by implementation
    query: {kinds: [producer]}
    row: {op: get, from: node, path: [group]}
    column: {op: get, from: vars, path: [implementation]}
  - id: groups
    type: distribution
    label: Group totals
    groupBy: {op: get, from: node, path: [group]}
  - id: flow
    type: cycle
    label: Resource flow
    edgeKinds: [supplies]
  - id: inventory
    type: table
    label: Inventory
    columns:
      - id: name
        label: Name
        value: {op: get, from: node, path: [name]}
```

The graph stores materialized view data in `View.query`: common `nodeIds`; matrix `cells[{row,column,count,nodeIds}]`; distribution `buckets[{value,count,nodeIds}]`; cycle `edgeIds`; table `columns[{id,label}]` and `rows[{nodeId,values}]`. Matrix/distribution groups sort by canonical JSON value, retaining exact value types. Missing expression values fail rather than becoming zero; explicit null remains null. Table column IDs must be unique. A cycle view selects the induced relationship graph, optionally filtered by edge kinds; it does not invent edges or claim that every selected node belongs to a graph-theoretic cycle. All outputs retain selected records' evidence and the exact view definition span. Rendering these materialized definitions is a generic viewer responsibility.

## Layered projections and adjacency matrices

A kind may use `files: []` plus `selections[]` to project multiple collections. Each selection requires `files` and optionally sets `records`, `idField`, `nameField`, `kindField`, `layer`, and `references`. Selection-level ID/name fields override their kind defaults; for example a catalog root can use `idField: revision` and `nameField: title`. The same optional properties may appear on the kind as defaults. `kindField` chooses each record's kind from an attribute; `layer` adds a literal classification and qualifies graph IDs as `layer:originalId`. The original identifier remains in `attributes.originalId`; `node.id` in expressions remains the unique graph ID. Selector metadata retains selector provenance.

Inferred ID references resolve only within the source record's layer. Unlayered records retain the original behavior. `references: false` suppresses inference from that selected record, while the record remains an available target and participates in explicit lens rules. This is useful for a catalog root that embeds the same records already projected separately. Synthetic records may set literal `attributes.layer` too. Layer namespaces are applied once, and conflicting final graph IDs fail visibly.

Queries support literal `layer` in addition to `kinds` and `where`. Findings, explicit edge source queries, and views use the same predicate; node-derived and facet rules may also declare `layer`. Explicit edges may set `targetQuery: {layer, kinds, where}` to choose a target namespace independently of the source. Its `where` expression runs in the target record's environment. `targetField: [id]` accepts a qualified graph ID or an original alias; an ambiguous original alias remains an error. A cross-layer correspondence is an explicit edge, never an inferred implementation claim.

```yaml
edges:
  - id: corresponds
    source: {layer: implemented, kinds: [component]}
    target: {op: coalesce, values: [{op: get, from: node, path: [designRef]}, {op: get, from: node, path: [originalId]}]}
    targetKind: component
    targetQuery: {layer: designed}
    label: Corresponds
  - id: compatibility
    source: {layer: designed, kinds: [catalog]}
    targetKind: component
    targetQuery: {layer: designed}
    matrix:
      ids: {op: get, from: node, path: [compatibility, ids]}
      cells: {op: get, from: node, path: [compatibility, cells]}
      empty: none
views:
  - id: compatibility-grid
    type: matrix
    label: Directed compatibility
    query: {layer: designed, kinds: [component]}
    edgeKinds: [compatibility]
```

The matrix edge rule evaluates one distinct ID array and a matching square cell array per source record. Each nonempty scalar cell creates a directed row-ID → column-ID edge, with its value as the label. Null, empty string, and the configured literal `empty` sentinel produce no edge. Object cells, mismatched dimensions, and unknown/ambiguous endpoints fail; opposing cells are independent. The exact cell source is retained for direct node-path expressions. Matrix rules are always directed; use ordinary edge rules for other directions.

A matrix view with `edgeKinds` selects adjacency mode instead of grouping expressions. Its materialized query contains `nodeIds`, `rows` and `columns` (node-ID arrays), `edgeKinds`, and `cells[{source,target,label,edgeIds}]`. Multiple selected edges between a pair retain all IDs and combined labels. Undirected edges occupy both directions. Missing cells remain empty; the viewer must not infer symmetry. Matrices without `edgeKinds` retain the row/column grouping contract above.

Additional reusable operators implemented for these projections:

| Operator | Operands | Semantics |
| --- | --- | --- |
| `count` | `value` | Array length or string Unicode code-point length; unsupported/missing input is missing. |
| `flatten` | `value` | Flatten one array level; unsupported/missing input is missing. |
| `sum` | `value` | Finite numeric array sum, skipping true missing members; empty array is zero, all-missing nonempty arrays and invalid inputs yield missing. |
| `aggregate` | `value` | Numeric sum with counts and coverage, as specified below. |
| `concat` | `values` | Concatenate all-string operands or concatenate all-array operands one level; mixed types are missing. |
| `indexOf` | `input`, `value` | First exact array-value match or string substring index; no match is -1, unsupported inputs are missing. |
| `let` | `bindings`, `value` | Evaluate ordered named bindings into a local copy of `vars`, then evaluate `value`; outer `node`/`item` remain available and the outer environment is unchanged. |

`get.path` accepts nonnegative integer array indices as well as strings and `*`. A `let` binding preserves an outer item while nested `filter`/`map` binds another item; it adds no product-specific operator. `get from: graph, path: [edges]` is available in facets, findings, and views after edge materialization.

### Revision-derived identity namespaces

A JSON/YAML kind or selection may set `namespaceFrom: /revision` (or another escaped JSON pointer into its single root mapping). The selected root field must be a nonempty string. The adapter reads it from the same observed input bytes through the extraction cache, qualifies each graph ID as `namespace:originalId`, and exposes `attributes.identityNamespace` with exact field provenance. `attributes.layer` remains the independently configured family. The namespace changes with the source revision without rewriting the layer label or lens. Original IDs remain in `attributes.originalId`.

Inferred aliases are partitioned by both layer and identity namespace, so two revisions cannot acquire implicit cross-revision links. Explicit lens queries can still compare them. Without `namespaceFrom`, qualification remains `layer:originalId`; unlayered/runtime inputs retain their prior identity behavior. The namespace option is supported only for JSON/YAML records and rejects absent, ambiguous, or nonscalar root values rather than silently falling back to the layer.

## Unified selected graph

Selected documents, headings, modules, files and imported Graft symbols participate in the same lens environments as data and synthetic records. Their adapter-assigned IDs and kinds remain stable. Queries without kind restrictions, graph/node derived definitions, facets, findings and views therefore see the complete selected graph. A lens selecting only data still sees only that data scope.

Data references may target an exact structural ID such as `document:README.md` or `module:main.ts`. Structural attributes are not scanned as authored ID references. A conflicting data alias is disambiguated and diagnosed rather than silently replacing a fixed structural ID. Layered data aliases remain local to their layer/identity namespace; structural IDs are globally addressable and are not copied into every layer.

The library accepts `knownNodes` in `resolveRecords` and in the `applyLens` options. `applyLens` also accepts `structuralEdges(nodes)`, called once after ID resolution and before derived evaluation. The CLI uses this to resolve document links against all nodes and to seed module/Graft relationships. Facets, findings and views then see these relationships together with explicit lens edges.

## Input scope

Lens configuration is checked before selected content is read. JSON and YAML use the same schema: unknown configuration properties, wrong types, unsupported expression operators and duplicate declaration IDs fail with the lens path, source line and field pointer, including rules whose queries currently select no records. A missing required field points to its closest authored parent. Literal expression payloads and synthetic attributes remain ordinary JSON, not nested configuration.

Kind names and attribute paths are open-ended: selectors can read kinds from data, structural adapters contribute their own kinds, and library callers can supply records without kind declarations. An empty selection or a currently absent attribute is therefore not a schema error. Derived/code-link dependencies retain their existing named-reference and cycle checks; ordinary missing variable reads in findings remain missing, and an unavailable/non-numeric gate metric remains an unknown gate. Actual edge targets, matrix dimensions and evaluated result types are checked when data is materialized.

Top-level `include` and `exclude` are arrays of repository-relative glob strings, using the same matching rules as kind `files`. Omitted `include` imposes no extra restriction; `include: []` selects nothing. A file must match at least one include pattern when that array is present. Any exclude match wins. Kind file/collection selectors still determine the records projected from eligible files.

These scope rules also apply to code-link source files. An excluded dispatch file contributes no evidence: support may consequently be unknown, rather than supported by a file outside the requested scope. Generated Lattice/agent/Graft directories remain excluded regardless of lens patterns. Changing scope changes the lens digest and refreshes the graph; edits to excluded files do not enter the selected-input content fingerprint.

```yaml
include: ['data/**/*.json', 'src/**/*.cs', 'README.md']
exclude: ['data/test/**', 'src/Generated/**']
```

Input-scope values are validated before reading selected content. Malformed scope arrays report the lens source path, line and field pointer.

## Missing values during evaluation

Missing is an internal value distinct from authored JSON `null`. Wildcard reads, map results, lexical bindings, derived variables and finding target-derived values retain that distinction until the result is materialized in the graph. Array positions are preserved. JSON graph outputs represent a remaining missing value as null; that output conversion does not feed back into expression evaluation.

Equality, inequality, membership and lookup do not turn absent values into null matches. Equality or inequality involving missing data is false, including nested missing array/object members. Membership compares each candidate independently, so an authored null can still match a null in a collection that also contains missing members. Explicit null remains a comparable literal. `all` requires a nonempty array; `any` and `all` return false for a missing input. Thus an absent operation cannot prove a non-stat implementation, and an empty effect list cannot prove all effects are implemented. Missing results from map/filter remain missing rather than becoming empty successful collections.

Numeric `sum` skips true missing array members while preserving a scalar result. Explicit null, strings, booleans, objects, arrays and non-finite numbers are invalid numeric entries and make the sum missing. A nonempty array containing only missing values also yields missing; an explicitly empty array sums to zero. Non-array input and numeric overflow yield missing.

`{op: aggregate, value: <expression>}` returns `{sum, count, total, missing, invalid, coverage}` for an array. `count` counts finite numeric entries, `missing` counts absent values and `invalid` counts all other entries; their sum equals `total`. Its `sum` follows the same rules as scalar `sum`. Coverage is `complete` with no omissions/errors (including an explicitly empty array), `partial` when some numeric evidence exists but entries are missing/invalid, and `unknown` when a nonempty array has no numeric evidence or arithmetic overflows. A non-array input yields missing for the whole aggregate, not invented zero counts. Missing sums become null only when graph output is materialized.

For example, a wildcard selecting capacities `3`, absent, `7` gives `{sum:10,count:2,total:3,missing:1,invalid:0,coverage:"partial"}`. Replacing the absent capacity with authored null gives a missing sum and `invalid:1`. Derived aggregates retain their actual input evidence; absent fields do not acquire fictional source pointers. Read aggregate members through `get from: vars` after binding a derived value or through `at` for an inline expression. A lens requiring complete numeric evidence can gate `missing == 0` and `invalid == 0`, as well as its numeric result. Partial sums never implicitly change configured gate behavior.

## Collection grouping and scalar joining

`groupBy` evaluates `input` once, then evaluates `key` with each member bound to `item` while preserving the outer `node` and variables. Its result is an array of `{key, items}` groups. Keys retain their JSON types, so the number `1` and string `"1"` are distinct; keys sort by canonical JSON text, and members retain input order. Empty input yields `[]`. Missing/non-array input or any key containing missing/non-finite data yields missing for the whole result instead of dropping members or merging missing with null.

`join` evaluates `input` and uses a literal string `separator`. Strings, finite numbers, booleans and explicit null become their string representations (`null` becomes `"null"`). Empty input produces `""`. Missing/non-array input or an array/object/missing/non-finite member produces missing, never implicit `[object Object]` text. An invalid separator is a configuration error.

Both operators compose with derived fields, map, findings and existing view expressions; they do not add domain-specific groupings or screens.
