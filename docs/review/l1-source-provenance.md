# L1 source expression provenance

The generic `source` expression returns retained input spans without reading the ambient evidence accumulated by unrelated rules. Direct paths retain exact fields, wildcard paths expand to concrete indices, and graph/node derived values and lexical bindings retain their own dependencies. Object identity locates nested collection entries without assuming that an arbitrary `id` property identifies a record.

## Evidence

- Before implementation, the actual CLI scenario failed with `Unsupported lens expression source` and exit 2.
- The CLI scenario in `tools/source-smoke.mjs` checks exact JSON pointers and lines through direct, derived, repeated and lexical reads; unrelated bindings do not leak. Wildcards identify both actual cost fields. Literal and absent values have no invented source. Editing the input updates its retained digest; exported graph identity matches the built graph.
- Actual bs-mobile D3 v1.1 and runtime lens projection retains 443 nodes, 800 edges, 1,140 facets and 15 findings. Compared with Lattice base `d415b9b211dd2545bbe05462bc5b65e8028d1296`, every non-source value is identical. Newly retained nested/graph evidence changes source arrays; this is not byte-for-byte graph parity.

- Actual Lattice worktree at the same base, using an external lens/cache, returns `package.json`, `/license`, line 7 for its derived license value. Build/export graph hashes match: `9fc56c2e47c3d087a43caa1d26db5fa4720af5a4273a7aaf2a364f799fcfd44c`. Existing local agent changes make this a working-tree observation, not clean-commit acceptance.
- `npm run check`: 64 tests, strict typecheck, formatting and documentation checks passed. Focused source tests cover nested items, transformed scalar collections, graph/node/lexical dependencies, finding target values and repeated reads. Independent review and the installed package smoke suite passed.

Computed-container bindings retain their full evaluated dependencies when a member is selected; this is not minimal dataflow slicing. Reading an absent member through such a binding can retain the existing container's evidence, but never invents a pointer for the absent member. Graph edge values cite the edge's declared sources.

No viewer changed. This slice does not complete L1 schema, aggregation coverage, or later milestone acceptance.
