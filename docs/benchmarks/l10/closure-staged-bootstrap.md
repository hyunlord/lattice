# L10 staged compiler bundle diagnostic

Status: bounded prototype verified; formal paired L9 acceptance and integrated full/package checks remain pending. Base `0ca65107fdb52bc0862875e2154b655cf3c3b6dc`. This does not supersede the historical 15/24 startup failures or the measured current-versus-L9 mobile regression.

The existing TypeScript AMD compiler output is partitioned only when every top-level emitted statement is a self-contained named factory. The static app closure is published initially; the complementary factories are registered once on the first dynamic import. The registry remains lexical, with a synchronous private loader handoff, complete transactional batch validation, shared namespaces and sticky transport/factory failures. Compiler lexical helpers conservatively retain v2; unsupported original module graphs retain v1. No app, route, CSS, readiness, data-validation or CSP policy change is included.

## Correctness

Regression-first evidence: four staged runtime expectations failed against v2, and the new bootstrap expectation failed on unsupported v3. The final focused archive/compiler/bootstrap suite passed 43 tests; the production build passed. Independent source review approved six files at content pin `869db505b5dec9a2fdd26d6126460dee0a7b555a47119e48d61b8b93a653b6b0` (ordered path+NUL+bytes+NUL: viewer-bundle, viewer-archives, asset-bootstrap, export-smoke, staged-viewer-bundle test, bundled-bootstrap test).

Native checks covered initial home without deferred requests, lazy identity, direct List, List/Changes/Explore navigation, v1 cycles, v2 entry/syntax failure, allowed nonce/blob CSP, denied CSP, corrupt initial bytes followed by explicit reload, and generation/corruption failure before deferred execution. Additional actual-render assertions covered initialized-home cancellation during the first deferred fetch, entrypoints, a 60-node flow, function incoming/outgoing columns (13 outgoing calls), node detail/provenance and the evidence panel.

A direct-startup hash race is retained as a known existing app limitation: `app.ts` installs route listeners after awaiting its first route. Changing the hash during a paused initial route can lose that event. Unchanged 0ca reproduced it with an initial List data read; the candidate reproduced it with initial Logic's deferred fetch. The normal initialized-home cancellation passes. This packaging change does not fix or conceal that separate lifecycle issue. Initial harness failures (wrong relative import and an incorrect expected stale-table assertion) and the direct-startup failures are preserved in local evidence.

## Fixed paired diagnostics

Interleaved control/candidate samples 1–3 used fresh browser contexts, cache disabled, service workers blocked, gzip loopback serving and the original first station plus two animation frames. Mobile390×844 used CPU4; desktop1440×900 used CPU1. No warmup, retry, exclusion or readiness change. Control assets are exact 0ca; candidate sites use the normal asset writer over identical frozen data. These are diagnostic comparisons with 0ca, not the complete paired L9 gate.

| Surface | Control ms, all samples | Candidate ms, all samples | Median change |
| --- | --- | --- | --- |
| fzf390 | 263.3, 241.9, 239.8 | 231.4, 228.6, 232.2 | 241.9 → 231.4, −4.34% |
| excalidraw1440 | 130.7, 118.5, 110.5 | 125.6, 104.1, 105.3 | 118.5 → 105.3, −11.14% |

Both screenshot pairs are byte-identical. All samples had zero console/page errors, horizontal overflow and initial full-graph requests. The dense screen retained 12 arrows. First-display transfer dropped 53,650 bytes per surface. The first-screen archive request count dropped from three packs to two; all deferred bytes remain in the physical export.

The actual 59 modules split into 31 initial and 28 deferred modules. Initial gzip chunks are 56,569/22,396 bytes, decoded 262,144/97,581. Deferred gzip chunks are 55,224/296, decoded 262,144/650. Every encoded and decoded chunk stays at or below 256KiB. Physical export grows 5,144 bytes; the unchanged-data ripgrep inventory is 2,725,594 bytes, below its 2,750,000-byte cap. This inventory audit is not a fresh corpus build. All 2,447 compared site files remained unchanged through the diagnostics.

## Evidence and pending work

Local ignored evidence is `.omo/evidence/staged-bundle/`; paired artifacts are `/tmp/l10-staged-bundle-pair/`, including all measurements, screenshots, source/site bindings, postflight and cleanup. Browser/server cleanup completed after every terminal run. Reproduce focused checks with:

```sh
node --test tests/staged-viewer-bundle.test.mjs tests/bundled-bootstrap.test.mjs tests/viewer-bundle.test.mjs tests/viewer-bundle-packs.test.mjs tests/viewer-archives.test.mjs tests/asset-bootstrap-integrity.test.mjs
npm run build
```

Integrated full tests, installed-package validation and the complete unchanged-main L9 paired campaign are pending. A positive two-surface diagnostic is not whole-L10 acceptance.

## Integrated checks — 2026-10-13

The six reviewed source/test files were copied without changes into the integration branch after `83834b9`; the content pin remains `869db505b5dec9a2fdd26d6126460dee0a7b555a47119e48d61b8b93a653b6b0`. Integrated `npm run check` passed **1,203 tests**, type/format/documentation and benchmark-genericity checks. `npm run test:package` completed successfully, including installed parser, CLI, MCP, export and serve checks. Logs: `.omo/evidence/l10-staged-check.log` and `.omo/evidence/l10-staged-package.log`. The complete paired unchanged-main first-display comparison remains pending; these checks do not establish acceptance.

A supplemental cancellation check observed both deferred chunks complete with HTTP200, exactly one registration event, removal of the temporary Blob script, zero in-flight requests, network idle for500ms and two animation frames. Home remained visible with one station and no stale logic/flow remnants; errors and overflow were zero. This strengthens the original early assertion without claiming all possible races or inspecting the private promise state. Evidence: `.omo/evidence/staged-bundle/native-cancellation-settled.json` in the isolated candidate; owned browser/server cleanup completed.

## Completed paired gate — 2026-10-13

The subsequent96-navigation paired unchanged-main campaign at12bc48f completed:13/24 comparisons passed and11 regressed. This supersedes the pending campaign status above, not historical failures. See [closure first-display results](closure-display.md) for the full table, provenance and unadopted follow-up diagnostics. Merge and consumer publication remain blocked.
