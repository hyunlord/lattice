# Historical graph comparison

This implements L1-11 under [issue #5](https://github.com/hyunlord/lattice/issues/5). Full L1, the history viewer and MCP remain pending.

## Behavior

`lattice diff <ref> --root <repository> [--lens <lens.json>] [--json]` resolves the reference to a commit, reads its tree and blobs through Git, then compares that graph with the current working files. It never checks out a revision or writes the Git index; Git optional index refreshes are disabled. Empty baselines and deletion of all supported inputs produce normal deltas. Invalid refs and build errors exit 2; a valid comparison exits 0 even when differences exist. The check command remains responsible for enforcing finding gates.

The pure `diffGraphs` API compares nodes, edges, facets, findings and views by stable identity and returns sorted additions, removals and changes with full before/after records. It reuses graph hashing's source normalization: revision and generated URL changes alone are ignored; content, source path, field and line changes remain visible. A source-file digest change can therefore affect several records from that file. It does not infer renames for path-addressed identities.

Historical builds use the lens at the same repository-relative path in the chosen tree. If that lens is absent, the current lens is applied with `current-lens-projection` coverage and its hash. External lenses always use that explicit projection label. With no lens on either side, coverage is `no-lens`. Past source code is parsed as data; it is never executed.

## Persistence and export

Clean graphs are saved under commit/lens/adapter/graph/coverage identity in `.lattice/cache/snapshots/`; dirty state stays in the current graph. A catalog retains the latest 32 distinct snapshot identities. Repeated comparisons reuse identities. Snapshot reads rebuild and validate graph hashes and check commit/lens metadata. Older unreferenced cache files are retained; the export catalog references at most 32 snapshots. Export copies those graphs alongside `snapshots.json` and the current graph. Existing files from earlier exports are not pruned in this slice.

Build, diff and export serialize access with a cache writer lock. Individual JSON files use temporary-file rename. A crashed writer leaves an explicit lock error; the lock identifies its process and can be removed once that process has stopped. Whole-generation cache transactions, automatic crash recovery and incremental shards remain pending. The CLI's filesystem/Git orchestration is split into small modules; the comparison core remains pure TypeScript with no new dependency.

## Executed verification

- Installed npm package: two actual commits change all four required collections; added/removed/changed entries and gate pass→fail before/after values are checked.
- The old lens reproduces the original graph hash after the new lens changes. Repeating the comparison gives identical JSON and exactly two snapshot identities. Exported snapshot graph hashes match the catalog.
- Staged and unstaged file bytes, an untracked data record, a deleted tracked file and Git index bytes are preserved. Complete input removal and an empty initial commit both yield valid deltas.
- A lens added after the historical commit is explicitly marked as a current-lens projection. An invalid ref exits 2.
- The pure-core feature test verifies source normalization, semantic provenance edits and sorted before/after results; existing type/format/tests remain enabled. No boundary suite was expanded.
- A real Lattice comparison against `13d831d` reported current document/module additions and import changes. bs-mobile commit `72698e5e98383467420bfe1b9b484c09560133a1` compared against itself with the external example lens produced zero changes and retained graph hash `f4b69e952fd1a55118c8323a6438d4583f376a085fc02dabceedcefdbe35d443`.

## Remaining limits

The CLI requires a Git repository; `diff --root` must name its root. Historical selected symbolic-link inputs fail explicitly; submodule contents and missing shallow-history objects are not fetched automatically. Historical extraction uses the current adapter implementation, with its versions recorded, rather than executing an old package. The history catalog records builds/comparisons, not every commit automatically. History navigation, node-specific commit history, incremental builds, YAML/Graft adapters and the rest of the full acceptance ledger remain pending.
