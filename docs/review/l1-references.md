# L1 reference diagnostics and refresh

Reference resolution checks exact and ambiguous selected-input aliases before classifying an unmatched ID field. Explicit HTTP(S), protocol-relative, mailto and tel locators receive `external-reference`; opaque namespace IDs remain `unresolved-reference`. This is bounded syntax classification, not URI validation, remote reachability or proof that an ID is absent from the whole repository. No external requests or placeholder nodes are introduced.

## Verification

- `npm run check`: source typecheck, formatting, 68 tests and documentation checks pass. The focused reference case covers alias priority, nested source pointers, deterministic input reordering and disabled reference extraction.
- Installed CLI smoke retains the referring JSON file byte-for-byte while another committed file supplies, then removes its target. Addition parses one file and reuses one shard; deletion parses zero and reuses one. Both scalar and array references gain/lose their edges with exact field pointers.
- Warm and cold builds agree after both changes. Historical diffs report the two added/deleted edges, export retains the current graph hash, and source Git status remains clean. Cache `discarded` counts unusable existing shards, not removed source files.
- Independent source review and a fresh-directory CLI rerun pass.
- Actual bs-mobile D3 v1.1/runtime projection is byte-identical to base `50fc52a0dac6ea12d03626584670ec6ff0afa145`: 443 nodes, 800 edges, 1,140 facets and 15 findings. No bs-mobile files change.

Together with existing data alias tests and the [unified graph](l1-unified-graph.md), history and code-link package scenarios for historical metadata, source URLs and dirty/index preservation, this closes L1-05. Complete L1 typing, lens validation and aggregation coverage remain pending. No viewer changed.
