# L1 graph foundation evidence

This is an incremental L1 implementation slice, not L1 completion. The complete CLI, parsers, lens evaluator, cache/diff, export and serve remain pending under [#5](https://github.com/hyunlord/lattice/issues/5).

## Implemented surface

- Strict TypeScript ESM package with declaration output, no runtime dependencies and an injected digest function. The pure core imports no Node/OS/time APIs.
- Readonly graph model for records, relations, facets, findings, views, provenance, inputs, repository metadata and snapshots.
- Canonical JSON with stable lexicographic object-key order and preserved array order. Rejects unsupported values, non-finite numbers, getters, cycles, sparse arrays and unsafe keys instead of silently losing information.
- Graph construction sorts identity-bearing collections, checks duplicate IDs/endpoints/source spans/digests, detaches adapter-owned data and freezes the result. This typed construction API is not a raw JSON graph parser; future adapters must parse external schema boundaries.
- Semantic hash excludes history/repository/source revision/generated-link metadata, retains actual attributes (including attributes named `revision`), meaningful arrays and provenance positions.

## Verification

On Node **24.21.0**:

```sh
npm run check
npm run test:package
```

`check` runs strict typechecking, the pinned compiler's source/test formatter, build, ten Node tests and documentation-integrity checks. `test:package` actually packs, installs in an isolated temporary project, imports the public ESM API, constructs a graph and checks a rejection path. It verifies declarations and package boundaries and removes its temporary files. This proves library packaging, not the future CLI.

Independent review found pre-existing node `contentHash` feeding into a rebuilt node's hash. The added materialized-graph round-trip test failed before the explicit field projection fix and passed after it. A huge sparse-array fixture also verifies rejection before materializing missing indices. No test expectations were weakened.

## Remaining boundary

No extraction, YAML/CSV parsing, semantic lens, code-support scan, cache, historical diff, CLI commands, browser UI, MCP or external publication is implemented by this slice. No bs-mobile or Charter & Kin changes. Node25 was used to initially install the dev compiler; all acceptance commands above use Node24. Remote CI status is recorded on the associated PR, not inferred from local tests.
