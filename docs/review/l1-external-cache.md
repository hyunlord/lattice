# L1 external cache lifecycle

The CLI now propagates --cache-dir through build, check, diff, export and serve. Extraction shards, graph metadata, snapshots, diff results and locks share the chosen directory. Explicit cache ownership prevents unrelated repository histories from mixing. Canonical path handling preserves input exclusions when an in-repository cache is reached through an alias. Defaults without the option remain unchanged.

## Evidence

- A real two-commit CLI fixture removes write permission from its source directory and content file, then runs build/check, warm extraction, historical diff, default external export and a live HTTP server. It observes two snapshots, one added node, graph/export/HTTP parity and clean server shutdown. No source `.lattice` directory is created; source bytes and Git status remain unchanged.
- Independent review reproduced a default export being re-ingested when a custom cache was inside the repository. The fix retains `.lattice/site` for internal caches; the installed lifecycle scenario now proves build → export → build preserves two records plus their file node, clean status and graph identity.
- A manual alias probe rejects a cache alias pointing at the repository root. A nested aliased cache produces repeatable hashes, one source node and clean source status.
- `npm run check`: 62 tests, strict types, formatting and documentation checks passed. The installed suite includes the complete external-cache lifecycle scenario.
- Actual Lattice source at base `ab7a281cf42adfe210c7fad18e4df38d83ad60fb`, with existing local agent edits, was built and checked with an external lens/cache. It produced 14 nodes and 12 edges, then reused all 3 input extractions. Export hash equals build hash `fb1dcf1e35acb7075c6aa5aee5dc7d55daa1bd3af50394ba6e5492c8c66375de`.
- Before/after Git status and every existing local `.lattice` file's content hash matched. This is working-tree/static CLI evidence, not clean-commit or full three-repository acceptance.

Independent review approved the corrected path handling. The parent repeated the focused lifecycle after correcting its record-plus-file node expectation; that rerun passed.

No dependencies, consumer source changes or UI changes were added. Source-expression provenance, complete lens schema and L2–L5 acceptance remain pending.
