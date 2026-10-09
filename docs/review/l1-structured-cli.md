# L1 structured CLI and finding descriptions

All six existing commands accept JSON output. One-shot commands produce a versioned result or error; check preserves gate exit codes. The live server exposes newline-delimited lifecycle events with an actual bound URL, graph generation/hash and build diagnostics. Existing human output and the deterministic diff payload remain compatible. The [output contract](../design/cli-json.md) specifies shapes and the diff timing exception.

Finding intent/implementation fields now evaluate expressions in finding scope rather than silently discarding them. Input evidence is retained, unknown descriptions are omitted, and invalid non-text results fail with the responsible lens field location.

## Verification

- Before implementation, actual CLI `build --json` exited 2 with a diff-only restriction; an expression-based finding silently omitted its intent. Both installed CLI scenarios now pass.
- `npm run check`: strict source typecheck, formatting, 67 tests and documentation checks pass. Complete installed package smoke passes, including six JSON commands, failed/unknown gates, option/input errors, ready/rebuilt/error/recovered/stopped events, real HTTP refresh and shutdown. Existing human-mode scenarios also pass.
- Finding description CLI scenario uses per-target derived values, verifies their input sources, exports identical graph identity and observes changed description text after a source edit.
- Independent read-only review and focused reruns passed.
- Actual Lattice worktree at base `d0db6affb20ba0c910c7900deac69cbcd12a7cc1`, with an external lens/cache, selects README, DESIGN and package.json: 15 nodes (2 documents, 12 headings, 1 manifest), 3 reused input files and 17 selected-scope reference/link diagnostics. The finding's implementation text equals the observed node names and retains 17 sources. Check/export hashes both equal `9ac562cb33d6ecbe4f71d178e66efd93884b45c7c2cde5aae5d37b6e95d9cedc`; source Git status is unchanged. Existing local agent edits mean this is working-tree evidence, not clean-commit acceptance.
- Actual bs-mobile D3 v1.1/runtime lens projection is byte-identical to that base: 443 nodes, 800 edges, 1,140 facets and 15 findings.

No viewer changed. L1 schema, missing-value aggregation coverage, complete typing scope and external/internal unresolved-reference distinction remain pending. This is not full L1 or later milestone acceptance.
