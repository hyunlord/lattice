# Lattice v0 system-map design

L0 contract, 2026-10-10. Product implementation and all L1–L5 gates remain pending. The [unaltered brief](brief-v0.1.md) is authoritative; [acceptance ledger](../review/acceptance.md) controls completion. The prototype contributes the [content oracle](../reference/bs-mobile-oracle.md), not layout or styles.

## Architecture and ownership

One strict TypeScript npm package with `src/core/` (pure model, canonicalization, queries, rules and diff), `src/adapters/` (data, Markdown, module and optional Graft extraction), `src/service/` (filesystem, git, cache, history and freshness), `src/cli/`, `src/mcp/`, and `src/viewer/`. `examples/bs-mobile/` and `examples/charter-kin/` own domain semantics; `tests/fixtures/` owns generic small input cases. Public exports accept serializable graph/lens values. Core has no process, filesystem, network, clock, domain names or global mutable state.

Target Node >=20 (CI: 20, 22, 24), ESM, TypeScript strict with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Built-in `node:test` for core/CLI/protocol; browser QA drives the actual static artifact. No framework is necessary for the static viewer: TypeScript DOM/SVG components share query functions with MCP. Dependencies and exact versions require a recorded necessity/compatibility check at implementation; do not inherit installed global packages as release dependencies. YAML/CSV parsing must satisfy real format fixtures, not a silent JSON-only substitute.

## Graph envelope and identities

All schemas have `schemaVersion: 1`. JSON values only; non-finite numbers and prototype-pollution keys are rejected. Arrays whose order carries meaning are preserved.

| Type | Required fields and semantics |
| --- | --- |
| Graph | `schemaVersion`, `hash`, `repository`, `inputs`, `nodes`, `edges`, `facets`, `findings`, `views`, `snapshots` |
| Repository | `name`, optional normalized remote URL and commit, `dirty`, `sourceFingerprint`; local root is service-only |
| Node | stable `id`, `kind`, `name`, `attributes` object, `sources[]`, `contentHash` |
| Source | repository-relative POSIX `path`, 1-based `line` and optional end line, `pointer` (JSON pointer/column/heading), input `contentHash`; include `revision` as commit or working-tree; GitHub blob links exist only if that file digest matches the commit blob |
| Edge | `id`, `kind`, `source`, `target`, `directed`, originating `field`, `sources[]`, optional attributes |
| Facet | stable `id`, `nodeId`, `key`, JSON scalar/array `value`, `ruleId`, evidence source references |
| Finding | stable `id`, `ruleId`, `severity`, `targetIds[]`, named `metrics`, rendered `message`, optional intent/implementation text, `basis`, evidence sources, optional gate result |
| View | `id`, `type` (`matrix`, `cycle`, `distribution`, `table`), label/description, typed query definition; no arbitrary HTML/CSS/layout |
| Snapshot | `id`, commit or content identity, graph hash, lens hash, input fingerprint, coverage/projection label, graph artifact path |

Node IDs for data use the configured ID value (or conventional `id`) when globally unique. Duplicates are diagnosed and disambiguated by source path + pointer; references to ambiguous aliases produce a diagnostic rather than arbitrary resolution. ID-less records use path + pointer; document sections use normalized path + heading anchor + duplicate ordinal. Code modules use path. Renames without explicit stable IDs are remove/add. Edge identity is source/target/kind/field/direction; attributes are diffable. Facet identity is node/key/rule. Finding identity is rule plus sorted target IDs and grouping key, excluding its mutable metrics/message.

Dirty and untracked source records are labeled working-tree with content digests; a remote commit link is omitted when it would point at different bytes. The viewer and MCP use this same source-link decision.

Graph `contentHash` reflects semantic attributes, relation facts and provenance; source text hashing is separately recorded. Hash rules, locks and snapshot semantics follow [ADR 0002](../adr/0002-reproducible-cache-and-history.md).

## Inputs and extraction

Discover tracked and eligible untracked files respecting git ignores, plus explicit lens patterns. In git-less directories use bounded recursive scanning. Never follow symlinks outside the repository; skip dependency/vendor/build/cache directories by default with inspectable exclusion reasons. Do not silently swallow unreadable/oversized/malformed inputs: return actionable diagnostics and incomplete coverage. Default limits: 10 MiB per text file, 100,000 records, expression depth 32 and bounded query results. Overrides are explicit; no external filesystem traversal.

- **JSON/YAML/CSV:** objects and object arrays become records; nested named collections remain locatable by pointers. YAML supports normal mappings/sequences/scalars and multi-document input with bounded aliases; duplicate keys, custom executable tags and alias cycles fail. CSV handles UTF-8 BOM, CRLF, quoted delimiters/newlines/escaped quotes, unique header names and line provenance. CSV keeps strings unless a lens requests a conversion. Unity tagged serialization YAML is a later adapter, visibly unsupported in v0 rather than misparsed.
- **Markdown:** document/heading/ADR nodes, relative links and heading references; ignore code-fenced fake headings/links. ADR metadata is generic status/decision information, not domain meaning.
- **Code:** file/module nodes and statically resolvable local imports (TypeScript/JavaScript and Python minimum), with location and unresolved external module information. Do not infer call graphs from regex tokens. Unsupported languages still produce useful file/module containment and linked docs/data.
- **Graft:** read optional `graft/.graph/wiring.json` only after format validation against an observed sample and documented supported version. Include source digest and adapter identity. Unsupported schema becomes a diagnostic plus minimal own extraction, never fabricated imported nodes. No copying Graft implementation. The verified compatibility contract and source-hash policy are in [Graft import](graft-import.md).
- **Git:** repository name/remote, commit tree and bounded history. Do not leak credential-bearing remote URLs. Collect metadata outside the pure core. Historical source reads use git objects, never a checkout in the consumer repository.

After collecting all nodes, recursively inspect scalar field values. Exact matches to known node aliases yield edges named by field path; arrays include precise originating pointer. No substring matches. With no lens, unresolved `*Id`/`*Ids` fields and broken relative links yield inferred-reference diagnostics; arbitrary unmatched prose does not. Distinguish unresolved external references from internal broken ones. Re-resolve references after additions/deletions, even for unchanged parse shards.

## Lens v1 contract

`.lattice/lens.yaml` is JSON-compatible declarative YAML, validated before scanning. Top-level fields: `schemaVersion`, `name`, `description`, `include`, `exclude`, `kinds`, `derived`, `synthetics`, `edges`, `facets`, `codeLinks`, `views`, `findings`, optional `presentation`. Reject unknown fields and invalid cross-references with path/line diagnostics. `presentation` allows labels/descriptions, kind order and one accent only.

`kinds[]` defines stable `id`, `label`, `files` globs, optional `records` pointer selector, `idField`, `nameField`, `columns[]`. A kind may select an array in one file or one record per file. More-specific matches must be explicit priority; ties are validation errors. `derived[]` names reusable computed fields and graph-level query results, with dependency DAG validation. No hardcoded consumer branches.

Expression values are literal JSON or objects with one explicit `op` and typed operands. Paths are arrays of property names, numeric indices or `*`; special contexts are `node`, `item`, `graph`, `vars`. Support these primitives with predictable missing/null behavior:

| Family | Operators / semantics |
| --- | --- |
| Read | `get`, `literal`, `coalesce`, `lookup` (kind + field equality), `at` (dynamic object key), `flatten` |
| Predicate | `eq`, `ne`, `in`, `exists`, `and`, `or`, `not`, `gt`, `gte`, `lt`, `lte` |
| Collection | `filter`, `map`, `any`, `all`, `count`, `unique`, `groupBy`, `sum`, `concat` |
| Branch/string | ordered `case`, `join`, exact placeholder template rendering |
| Evidence | `codeSupport` refers to a named code-link result; `source` refers to located input facts |

Missing value is distinct from explicit null; predicates over missing return false except `exists`/`not`, aggregation ignores missing with a coverage count, and `all([])` must not classify an empty effects list as implemented. `coalesce` skips missing/null only. No arbitrary function calls, user regex execution, environment access, randomness or time. Graph-level queries select kinds/facets/attributes with the same expression vocabulary, group, and aggregate. Every computed metric retains target IDs and input sources so UI/MCP can explain it.

Facets use ordered cases: first matched case wins, final default required. Prototype classification is configured in the example lens, including profile membership, nonempty stat-only effects, base defaults and non-stat effects. Effective projections use a lens-defined `coalesce(lookup(profile override by id), original projection)` separately. This vocabulary must reproduce the complete oracle without `.ts` extensions.

Edges define source query, target value expression, target alias namespace, label, direction and optional display token. Synthetic hubs are explicit lens-created records with provenance back to the definition. A view's graph can therefore express a cycle without fixed domain nodes in renderer code.

Concrete operand and selector syntax is specified in [lens examples](lens-examples.md); this is part of the v1 contract.

`codeLinks[]`: data query + extracted value path, source file globs, language, bounded dispatch selector (`switch-case` or `call-argument`), and handler selector context. A lexer skips comments/strings outside selected syntax and returns matching code spans. Rules can combine multiple dispatch paths. Result is supported/unsupported/unknown with operation and exact evidence spans. A literal in a test, schema whitelist or enum is insufficient. Partial extraction yields unknown, never false support. Lens authors choose the dispatch files/contexts; generic code does not know operation names.

`findings[]`: `id`, query, named metric expressions, template, severity, basis (`computed`, `authored-interpretation`, `source-support`), optional intent/implementation expressions, and optional gate `{metric, comparator, threshold}`. Gate outcomes are pass/fail/unknown; unknown on required evidence fails `check`. Templates may contain only named query metrics/labels, all escaped at render. Findings are materialized in the graph once; MCP and web do not independently recalculate domain semantics.

## CLI contracts

Global options: `--root`, `--lens`, `--cache-dir`, `--json`. All paths are explicit and normalized. Defaults never write to a read-only source when an external cache is requested.

| Command | Result and failure behavior |
| --- | --- |
| `lattice init [--no-global]` | L1 creates validated lens skeleton/cache ignore; L3 adds managed agent wiring. Idempotent and non-destructive. |
| `lattice build` | Scan/reuse shards, materialize graph atomically; report parsed/reused/removed inputs and timing. |
| `lattice check` | Rebuild if needed, show every gated finding. 0 passes, 1 violated/unknown gate, 2 invalid input/config or operational error. |
| `lattice diff <ref>` | Resolve exact ref safely, compare current graph to historical projection; added/removed/changed nodes, edges, facets and findings with before/after. Invalid ref exits 2. |
| `lattice export <dir>` | Self-contained SPA, graph JSON, snapshots/manifest and assets, no CDN. Refuse overwriting non-owned output without explicit option; staging+rename prevents partial export. |
| `lattice serve` | Loopback HTTP + watcher + graph revision signal; preserve selected route on reload. Watch source and lens, debounce batches; clean SIGINT closes listeners and watchers. |
| `lattice mcp` | stdio only, no logs on stdout, EOF cleanup; implemented in L3. |

L1 establishes working minimal generic export/serve; L2 completes all six screens and visual requirements. CLI error paths get real child-process assertions, not function-only tests. `--json` returns a versioned object and timings separately from graph hash.

## Viewer and links

[Viewer design](viewer.md) specifies layouts, tokens, semantics, responsive and keyboard behavior before code. Routes: `#/home`, `#/explore`, `#/list`, `#/views/<id>`, `#/changes/<base>/<head>`, `#/node/<encoded-id>`. Preserve filters in query parameters in the fragment. Snapshot identities and exact graph hash appear in detail/link results. Default zero-config views always include kind-to-kind matrix and field-value distribution; no special bs-mobile tabs.

## MCP and agent integration

All eight tools use the same service `ensureFresh()` before querying, including the freshness tool (which reports `wasStale` and rebuilt state). Return current graph hash, source commit/fingerprint, observation timestamp, freshness mode and links alongside typed results. Return structured JSON plus readable text; externally fetchable viewer links may be resource links. Local routes remain explicit local viewer URLs, not misleading public links.

- `lattice_overview`: kinds, facet distributions, automatic and lens findings.
- `lattice_find`: kind/tags/facets/text + bounded pagination.
- `lattice_node`: id, attributes, sources, facets, findings, neighbors, stable URL.
- `lattice_trace`: directed path between IDs or bounded n-hop impact, visited set and truncation indication.
- `lattice_matrix`: named lens matrix (or automatic default), axis IDs/labels, cells and targets.
- `lattice_findings`: filters, gates, metrics, intent/implementation and links.
- `lattice_diff`: safe commit ref, same engine as CLI/browser comparisons.
- `lattice_freshness`: checked inputs, previous/current fingerprints, rebuilt/unknown status and timing.

Choose and document one client-supported protocol baseline at L3 (2025-11-25 initialization compatibility is a candidate), test negotiation, input errors, tool errors and EOF. Do not claim unsupported newer protocol semantics. `init` creates a Lattice section in AGENTS.md, `.claude/skills/lattice/SKILL.md`, `.mcp.json`, and project/global Codex config as requested; `--no-global` performs no home config writes. Preserve Graft servers and unrelated TOML/JSON entries; repeated init is byte-stable. The generated skill explicitly tells agents to inspect overview/findings before design/implementation and diff afterward.

## Delivery and acceptance sequencing

L0 publishes these decisions. L1 establishes core/CLI with non-domain fixtures. L2 completes and captures the six screens for lensless public repository, bs-mobile, and read-only Charter & Kin; publishes bs-mobile Pages via PR and reports that URL first. L3 adds real client integration. L4 packages reusable `lattice-action` with safe PR comments and Pages/artifact fallback. L5 verifies all oracle metrics/findings, three-repository portability, timings, determinism and both actual agents. L2's early publication exception is [ADR 0004](../adr/0004-delivery-and-permissions.md), not reordered milestones.

Performance acceptance is bs-mobile full build ≤10s, unchanged freshness ≤50ms, each measured MCP query ≤1s. Publish repeated samples with p50/p95/max, cold/warm/strict mode, file count, hardware, Node, commit and command; no unmeasured promise of success. On same source commit, isolated clean caches must produce identical graph hashes. Test add/delete/rename/lens/profile/code-handler changes and same-size preserved-mtime edits. Instrumentation must remain available in normal CLI and MCP diagnostics.
