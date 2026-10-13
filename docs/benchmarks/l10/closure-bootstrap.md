# L10 closure: compiler-bundled viewer publication

Status: bounded correctness experiment, **not adopted and not a startup gate pass**. Base `003beebcf096ae237993fd611cbfe305f75831fc`; working branch `perf/l10-bundled-publication`. Earlier formal first-display failures and rejected experiments remain unchanged.

## Change and compatibility boundary

The existing TypeScript compiler emits named AMD factories from the flattened generated viewer JavaScript. A private registry executes a supported static DAG and preserves deferred dynamic factories and shared module identity. Verified, ordered gzip chunks produce one classic Blob script instead of one Blob URL per module. There is no eval, new dependency, global AMD registry, source-specific branch, or change to graph/evidence/logic validation. Native development JavaScript remains packaged.

The actual generated viewer selected this path with **59 named modules**. Build-time capability checks retain the original version1 native-module archive path for static cycles, top-level await, mutable exported bindings, unsupported import syntax and unresolved exports. Multiple export-star declarations conservatively select fallback rather than approximating ambiguous ESM exports. Fallback is not a promise of new support: import.meta, nonliteral imports and dynamic-import options retain the existing legacy builder's fail-closed errors. This registry does not implement arbitrary cyclic ESM initialization.

Version2 verifies encoded hash/length and bounded decoded length for every chunk before publishing the sole script; it preserves repeated content-addressed chunk occurrences in order. Duplicate version1 paths remain rejected. Generation is rechecked before publication. Script-local ready/error events, external-script load/error handling, listener removal and URL revocation handle startup success, entry failure and parse failure. CSP is never modified: nonce/blob-compatible policies were exercised; self-only denial fails visibly. No embedded-manifest or staged-import-map optimization is included.

## Recorded checks

- Baseline RED: all three new test files failed because the new helper/API did not exist.
- First implementation:29 focused checks and build passed.
- Review found repeated-chunk and export-linking defects. Both received failing regressions before fixes; original failures are retained.
- Final focused run: **44 pass,0 fail**, including existing archive/bootstrap/export tests; fresh build passed.
- Native Chrome functional run:9 cases covered initial/lazy identity, nonce+blob with script-src-elem, denied self-only CSP, invalid manifest, corrupted pack and reload, entry failure, syntax/load-without-ready failure, version1 cyclic fallback, and actual viewer navigation.
- Actual viewer390px: home→list→changes→explore→home smoke completed without page errors or horizontal overflow. Initial requests ended at overview.json; no initial full graph or evidence request. This is route smoke, not exhaustive exercise of every view or lazy export.
- The deliberately malformed script produced the expected browser syntax error and visible failure. Do not count that fault-injection case as an unexplained clean-page error.
- Browser and server cleanup completed (recorded PID74865, port60022). No startup timing, full suite, installed-package run or formal export density campaign was performed for this candidate.

## Byte accounting

Fresh generated output:3 compressed script chunks, **131,510 bytes encoded /607,755 bytes decoded** total; each encoded and decoded chunk is at most262,144 bytes. Bootstrap11,118 bytes; manifest597 bytes. Code delivery files total **143,225 bytes**, versus the earlier version1 inventory136,991 bytes (**+6,234 bytes**). This is code-asset accounting, not a whole-site density result or a speed claim. The single script spans multiple bounded chunks; no individual chunk exceeds the contract.

Generated bootstrap SHA256: `b7f7c5dde3c1224c0d3efa6f216b06a89a3debfaae91e9d72a867d2efdb28179`.

Source fingerprints for the tested candidate:

| File | SHA256 |
|---|---|
| tools/viewer-bundle.mjs | fc7850f9e62d73ddff39be8252447cf08149c310de66e824dd074ae4130a8aab |
| tools/viewer-archives.mjs | 68b9099974ac29345fa6d76661b5abb6f641389dc0df90846519aef0ac5e10c2 |
| tools/export-smoke.mjs | 4f09163e306fe96e609706f3d7a175d3d8bf11912102735a55e16ba9b92ca353 |
| viewer/asset-bootstrap.ts | 76d97f6f50727e987f0a83c2ab05102880e4348c5ed57eb73b86669ba602fe2a |
| tests/viewer-bundle.test.mjs | e5f9c8c0c7b19aa848840574bb4837fcffd128723f0c6522238c4842a48227fe |
| tests/viewer-bundle-packs.test.mjs | a3651cef2cda1c6accaf28b2999ba632e36c5ce8746a2dfcd0d48c7c3760ab29 |
| tests/bundled-bootstrap.test.mjs | 1b31d8a2cb041585acda53366a93cee625bb75880fe3a102b78afe1d21a9dc40 |

Local ignored evidence is under `.omo/evidence/bundled-publication/`: `PLAN.md`, `red.log`, `focused-first.log`, `repeated-chunk-red.log`, `export-link-red.log`, `focused-export.log`, `build-second.log`, `native-qa.json`, `actual-bundle.json`, `actual-home-390.png`, and `cleanup.json`. Raw evidence is not committed.

## Pending adoption gates

Independent final source review, formatting/full checks, installed-package verification, fresh complete-site size caps, and unchanged-protocol paired first-display measurements remain pending. Only measured improvement with preserved functional/visual behavior can justify adoption; these correctness results do not restore any historical latency failure.
