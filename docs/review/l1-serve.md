# L1 local serving and staged export

Scope: issue #5, source watching for the existing home/list/detail viewer and replacement of static exports. This does not complete the six-screen viewer, remaining adapters, full lens syntax or MCP.

## Behavior

`lattice serve --root <repository> [--lens <lens.json>] [--port 4173]` binds only to loopback. Port 0 selects an available port. It observes selected file contents every 500 ms after the previous observation finishes. Unchanged fingerprints skip extraction and persistence; changes use the existing incremental build. This is content polling, not an operating-system event watcher or a 50 ms freshness claim.

Each HTML response identifies a generation. Its graph and presentation requests use that generation, and the server retains four complete generations in memory. Server-sent events reload an open browser when a new generation is ready, preserving its fragment route and filters. Failed updates show the last good map with a visible error; corrected source recovers automatically. The server exposes only the viewer assets and generated graph/snapshot artifacts, not arbitrary repository files. SIGINT and SIGTERM close timers, event streams and the HTTP listener.

Build observation reads selected content once and passes those exact bytes to extraction. Git identity, dirty state and paths are checked again after capture; a changed observation is rejected rather than saved as a clean commit snapshot. This is not a filesystem transaction across simultaneous writers.

`export` validates cached graphs, stages all assets and referenced snapshots, then replaces the destination. Repeating export removes obsolete files. Nonempty destinations need a Lattice ownership marker or explicit `--force`. Root, package and cache paths are protected. A staging failure leaves the old destination intact. Two renames are used: a static server can see a brief missing-directory window, and a process crash between renames can leave the prior site at the `.previous` backup path. Export does not claim crash-atomic directory replacement; live serving uses coherent memory generations.

## Verification

Feature verification is recorded with the PR and CI. `tools/export-smoke.mjs` exercises repeat export, stale asset removal, staging failure preservation and explicit replacement of a foreign output directory. `tools/serve-smoke.mjs` exercises the installed CLI over real HTTP and event streams, source edits, errors and recovery, and shutdown. Existing extraction/history tests continue to apply.

Local `npm run check` passed all 36 tests, typecheck, formatting and documentation checks. `npm run test:package` passed all installed CLI scenarios, including both SIGINT and SIGTERM.

Chrome at widths 375, 768 and 1280 rendered a copy of the real bs-mobile data. Filtering item/referenceDepth/stat retained exactly 24 rows across source changes and automatic reload. Invalid lens JSON displayed a stale-map banner while retaining those rows; restoring the lens recovered automatically. A node detail route for 재 모음패 also survived automatic reload. No page errors or document-width overflow occurred. Final baseline/recovered screenshot comparison differed by zero pixels at all three widths. Independent visual reviews passed after correcting the live-mode provenance label. An exported static site served over HTTP also passed the 24-row filter and node deep-link reload scenario. No mobile device, performance target, external-agent MCP session or full L2 acceptance is implied.
