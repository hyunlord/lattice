# L1 optional Graft integration

The independently written wiring-v1 importer completes the optional-code-graph portion of L1-04. The [compatibility contract](../design/graft-import.md) pins official upstream evidence and explains how source hashes, confidence, unresolved targets and definition spans are handled. Existing standalone extraction remains available when Graft is absent, malformed, unsupported or stale. No dependencies or upstream implementation were copied.

## Verification

- `npm run check`: strict types, formatting, 56 tests and documentation checks passed.
- `npm run test:package`: the actual installed CLI imports an ignored graph, retains exact source links without inventing a generated-file URL, avoids duplicate module imports, refreshes on graph-only edits, falls back on stale/invalid inputs, and exports the same graph. Historical builds do not borrow current ignored artifacts.
- Independent adapter and CLI reviews passed. A separate data-only lens probe confirmed code remains outside that lens's selection. The installed scenario caught and corrected a symbol/file source-pointer collision before publication.

## Actual repository surface

Read the existing `/Users/rexxa/lattice` worktree at base commit `0d005df7820de8aeafa6b10ad5cdd5c24a56de9e` using the new CLI, then exported `/tmp/lattice-graft-real-site`. The worktree was dirty because of existing local agent configuration; this is a working-tree observation, not a clean-commit acceptance claim.

- Graft artifact SHA256: `d2dbaf38a2b9e249ff06c6e55d15f02e94a919b4f9e2ad04630973af8db607a0`.
- Graph: **598 nodes / 1,287 edges**, including **357 imported symbols / 1,077 imported relationships** from 64 hash-matching files.
- Two unindexed local helper files retained standalone extraction. 144 unresolved upstream external targets were diagnosed; no external nodes were fabricated.
- Build and export graph hash both equal `4e9e2a2da7ae61240eee38f93648809bb4e787778f3e5f192b4c1450bb1d9af9`.
- Generated wiring provenance has no fabricated repository URL; source definitions retain real file spans and content hashes.

This is CLI/static graph evidence. No UI was changed, no consumer repository was modified, and no runtime behavior or full L1–L5 completion is claimed.
