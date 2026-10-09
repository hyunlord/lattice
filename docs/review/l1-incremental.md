# Content-keyed incremental extraction

This implements L1-09 under [issue #5](https://github.com/hyunlord/lattice/issues/5). Full L1 and the persistent freshness service remain pending.

## Reuse contract

JSON, CSV, Markdown and code adapters store raw extraction shards under `.lattice/cache/extractions/`. Identity includes source path, SHA-256 content digest, adapter format, record selector, cache schema version and a fingerprint of the installed compiled implementation. An adapter implementation change therefore invalidates old shards even if a manually declared version was not bumped. The implementation fingerprint conservatively includes all compiled library JavaScript, so unrelated library changes can also force re-extraction.

Every build enumerates current inputs and reads/hashes their contents. No mtime-only shortcut is used. Additions, removals, renames, unchanged-size edits and selector changes are reflected immediately. Renames reparse because source paths are part of extraction provenance. Shards contain original adapter output, before kind/name/ID mapping, source revision/URL decoration, reference resolution and lens evaluation. Those dependent operations run each time; changing a lens rule can reuse all raw data while producing new facets/findings.

The shard envelope verifies its key, identity and canonical payload checksum before reuse. Invalid JSON or mismatched shards are counted as discarded and rebuilt; filesystem access errors remain errors. Parse failures are not cached. A no-lens malformed data file retains the existing diagnostic/file-node behavior; an explicit lens still fails. Only completed extraction and graph construction proceed to graph/counter/manifest publication. New reusable shards may remain after a failed build, while the previously published graph remains available.

`build.json` reports `mode: strict-content`, files, bytes, parsed/reused/discarded counts and implementation fingerprint. `inputs.json` records each selected input's digest and shard identity. These observation/cache fields do not change the semantic graph hash. Existing writer locks and atomic-file writes apply. Old unreferenced shards are retained; garbage collection, multi-file generation transactions and automatic crashed-lock recovery are not implemented here.

## Executed evidence

The installed package runs a seven-file non-game repository through no-op reuse, an equal-size edit with preserved mtime, add/delete/rename, an import target change, lens introduction, lens-only reclassification and two record-selector changes. Expected parse counts are checked. After each meaningful transition, removing only the temporary test repository's shard directory and rebuilding produces the same graph hash and findings. Existing check/history/export scenarios continue to run; no boundary suite was expanded.

The actual bs-mobile worktree at `72698e5e98383467420bfe1b9b484c09560133a1`, using the external example lens, parsed **217 files** on first use and reused **217/217** on the next build. Both produced graph `f4b69e952fd1a55118c8323a6438d4583f376a085fc02dabceedcefdbe35d443` with 217 nodes, 310 edges, 432 facets and 3 findings. Existing 208 selected-scope reference diagnostics remain visible.

An isolated copy of those exact 217 selected files (367,075 UTF-8 bytes) measured full CLI processes on Apple M4 Max, macOS arm64, Node v25.8.2: cold **518.70 ms**, then reuse **484.13 / 397.77 / 415.69 ms**. All four graph hashes matched the source. This is a selected-input full-build observation, not a whole-repository filesystem performance claim, a Node-LTS benchmark, or proof of the required 50 ms persistent freshness / 1 s MCP targets. Node 20/22/24 correctness is covered by CI separately.

Reproduce the measurement (fresh selected-input copy, one cold and three reuse runs, automatic temporary-directory cleanup):

```sh
npm run build
node tools/measure-build.mjs /path/to/bs-mobile examples/bs-mobile/lens.json
```

Independent review found no blockers and reran the installed package scenario. Adapter implementation invalidation and corrupt-shard handling were reviewed in source; separate runtime fault injection was not added.
