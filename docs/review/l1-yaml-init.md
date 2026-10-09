# L1 YAML records, YAML lenses and initialization

Scope: L1-02 and L1-08 under issue #5. The earlier [JSON/CSV extraction](l1-data-extraction.md) is extended with actual YAML parsing, default lens discovery and the initial setup command. Agent wiring is still L3; full lens-schema/code-link/view support is still pending.

## Format and initialization contract

The [parser dependency decision](../adr/0005-yaml-parser.md) pins `yaml@2.9.1`. Lattice itself remains MIT; the dependency is ISC. Core graph/query semantics stay domain-neutral.

YAML 1.2 core mappings and object sequences produce records, with canonical JSON pointers and original source lines. Named record selectors work within every document. Multi-document streams use `/documents/<index>` pointer prefixes; a single document keeps the same pointer convention as JSON. Quoted/block scalars and shared acyclic aliases work. Expanded alias fields point to the alias use. Expansion is limited to 100 alias visits and one million values per document, 128 nested levels and 100,000 aggregate records. Duplicate keys, unsafe keys, cycles, unresolved aliases, nonfinite values and unsupported tags fail explicitly. YAML 1.1 directives and Unity tagged serialization are not accepted. YAML 1.2 `<<` remains a literal key, not legacy merge inheritance.

Lenses require one mapping document. Default discovery accepts one of `.lattice/lens.yaml`, `.lattice/lens.yml` or `.lattice/lens.json`; coexistence is explicit ambiguity. Historical comparison selects the lens from the old Git tree, even when the current tree migrated to another format. External YAML lens source locations keep a YAML extension. Incremental extraction incorporates the pinned runtime dependency versions in its implementation fingerprint.

`lattice init --root <repository> [--no-global]` creates a usable repository-neutral `lens.yaml`, scoped `/cache/` and `/site/` ignores, and the cache directory. Existing lenses and unrelated ignore lines are preserved. Multiple lens variants fail before writes. No global configuration or agent wiring is written in this L1 implementation.

## Evidence

- `npm run check`: strict typecheck, formatting and all 41 tests passed, including five YAML scenarios.
- `npm run test:package`: installed package init → build → check → export, byte-identical repeat, edited-lens preservation and ambiguity refusal passed. Existing CLI scenarios remain passing.
- Installed YAML scenario verified exact source lines, cross-record edges, lens facets and gate results, unchanged-build extraction reuse, historical YAML lens after JSON migration, and static export.
- Chrome at 375 px loaded the YAML-built static export: 24 stat-only items, node detail reload, expanded finding provenance pointing to `lens.yaml`, no page errors or horizontal document overflow. The provenance list is collapsed by default and was opened during the check.
- Real bs-mobile source at `72698e5e98383467420bfe1b9b484c09560133a1` with [YAML lens](../../examples/bs-mobile/lens.yaml) produced 217 graph nodes (216 visible plus hidden profile), 310 edges, 432 facets and the existing three findings. Nodes/edges and facet values/finding metrics/messages/targets matched the JSON lens exactly. YAML source provenance changes the graph hash to `525be6bcb4120db2acda1a38b74040d98ee0e1504a0fe4a803bae65619eadbdc`; the JSON graph is `f4b69e952fd1a55118c8323a6438d4583f376a085fc02dabceedcefdbe35d443`.

This does not assert all eight prototype findings, runtime dispatch verification, full L2, L3 MCP or L5 performance. bs-mobile consumer files and Pages pin are unchanged by this tool PR.
