# Optional Graft wiring import

Lattice independently reads `graft/.graph/wiring.json`; it does not run Graft or copy its implementation. The file is optional generated input, including when ignored by Git. A historical build reads only the graph committed at that revision, never the current worktree's generated graph. Commit snapshots without this artifact use standalone module extraction, so their symbol coverage can differ from a current generated map.

## Supported upstream contract

Verified against `trailhq/graft` commit `fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad` (`@nanonets/graft` 0.21.1). The README documents the artifact, but does not promise a stable external importer API. Lattice supports the observed **wiring-v1** structure and validates it independently:

- Root: `meta`, `nodes`, `edges`. `meta.version` must be 1; `nodeCount` and `edgeCount` match their arrays; `languages` is a string array; optional `scopes` holds prefix/label/markers.
- Nodes: opaque unique `id`, `name`, `kind`, repository-relative `path`, one-based `span` (`Lstart-Lend`), nullable `signature`, boolean `exported`, `origin` and SHA256 `body_hash`.
- Kinds: file, class, function, method, interface, type, enum, struct, trait, module, constant, variable. Origins: ast or generic.
- Edges: source/target node IDs, relation (contains/calls/imports/references/implements/extends), confidence (lsp_resolved/lsp_dispatch/extracted/inferred). There is no upstream edge ID or call-site span.
- External unresolved targets are valid for imports/references/implements/extends. They become diagnostics, not invented graph nodes. Missing source IDs or missing calls/contains targets invalidate the import.

Primary references: [documented artifact](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/README.md#L185-L199), [wire types](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/graph/types.ts#L14-L132), [actual envelope](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/graph/build.ts#L300-L311), [endpoint invariants](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/graph/invariants.ts#L36-L74). These fields are an observed compatibility contract inferred from upstream types and writer, not a claimed published JSON Schema.

## Freshness and evidence

Only files selected for code extraction are eligible. A `file` node's hash must equal Lattice's current complete source digest before its symbols or relationships can be used. The upstream [AST file constructor](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/graph/extract.ts#L394-L408) and [generic constructor](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/graph/generic.ts#L207-L212) hash the whole decoded source using [SHA256](https://github.com/trailhq/graft/blob/fe30ead39d5e6f0c921018d364da2bdbc9d4b3ad/src/util/id.ts#L8-L10). Symbol hashes cover definitions and are never substituted for file hashes. Graft decodes UTF-16LE before hashing; Lattice's UTF-8 reader therefore conservatively falls back for such inputs.

Lattice keeps its own `module:<path>` file identities, adds `graft:<opaque-id>` symbols, and maps imported edges to those identities. Resolved imported module links replace equivalent standalone links; remaining standalone links are preserved. A stale/missing file hash excludes that file's imported symbols and relationships, with a diagnostic and standalone fallback. Invalid JSON, unsupported versions and malformed structures also fall back. The optional graph's digest participates in observation and graph inputs, so graph-only edits invalidate prior results. Generated `graft/` cards are excluded from ordinary record/document extraction.

Every imported symbol retains its current definition span/content digest and exact wiring JSON pointer/line. Edges retain upstream confidence and are labeled **definition evidence**: the source definition is not a precise call site or runtime proof. Generated graph provenance is not given a fabricated GitHub blob URL. Summaries, crux text and cached bodies are excluded from imported meaning; Lattice adds no model stage. Diagnostics are available in `.lattice/cache/diagnostics.json`.
