# L1 collection expression composition

The documented groupBy and join operators now execute in the generic expression runtime. Grouping retains typed JSON keys, canonical key ordering, input member order and outer node scope. Joining emits explicit scalar text and preserves unknown results for missing or nonscalar members. No domain-specific branches or dependencies were added.

## Evidence

- Before implementation, the actual ownership CLI scenario stopped with unsupported groupBy (exit 2).
- After implementation, three service records yield two owner groups, ordered names `app, platform` and member strings `b` / `a/c`. The finding gate passes and exported graph hash matches. Editing one owner refreshes the member strings to `b/c` / `a`.
- `npm run check`: 62 tests, strict typecheck, formatting and documentation checks pass. Focused cases exercise typed keys, equal objects, ordering, outer node scope, null/scalar joining and missing-value behavior through the public lens pipeline.
- Full installed package smoke suite and independent runtime/CLI review passed.
- Actual Lattice worktree at base `cebeb1c5891b722a7401f3170b28cd4ec5bd13f7` was built with an external lens selecting README, DESIGN and package.json. The 14 nodes grouped into 2 documents, 11 headings and 1 manifest; grouped member counts equal the complete selected node count, and joined labels match the finding text.
- Actual build/export hashes both equal `a51f9c2842f2dd26ca6276fd265c5c287f2c6288038965eb36d2d0eebf664ea7`. Existing local agent changes make this a working-tree observation, not clean-commit acceptance. The selected scope retained 16 unresolved-reference/link diagnostics.

No viewer changed. Source-expression provenance, aggregation coverage and full lens-schema acceptance remain pending; this slice does not complete L1 or later milestones.
