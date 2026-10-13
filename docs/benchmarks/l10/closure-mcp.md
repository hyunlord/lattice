# L10 MCP cold closure diagnostic

Recorded 2026-10-13. The requested first-request gate passed in this diagnostic:
the request completed on the default Node heap and the observed simultaneous
process-tree RSS peak was **5,298,143,232 bytes**, below **6,000,000,000**.
This is one pinned large-repository diagnostic, not final integrated acceptance.
Historical formal OOMs and earlier failed experiments remain unchanged.

## Candidate and evidence binding

The measured worktree was `/tmp/lattice-l10-mcp-cold`, based on
`003beebcf096ae237993fd611cbfe305f75831fc`, with uncommitted closure changes.
SHA-256 of its exact tracked `git diff --binary` text was
`85087f4085d9018a37865eb04d5d454e50ebfe197b590d5ab4f446f711fd9ad2`.
This diff identity excludes then-untracked added tests and this later report.

| Measured artifact | SHA-256 |
| --- | --- |
| `cli/freshness.mts` | `26eeed77c5d15355c10119c4d0f1e680fd4aa3b9b8c60cc2818c91acec3a2af4` |
| `cli/mcp-resident-index.mts` | `35c4441b453b73bbe04b3db2979750325ec293ce0239550589c130f3d4ede036` |
| `src/query/logic-model.ts` | `4a53ac736d5ee1f8b78daa649d4e9d32ef5e2be22bdcb18d12994d1b038c74ea` |
| `bin/freshness.mjs` | `5c50c3648ae7c828f3ba81c07696f6a78905959edfb70e6aed96903e75d1296a` |
| `bin/mcp-resident-index.mjs` | `604a0e0445dc9dc5176594d72adf31ed91b02ffc8381a5acfd9425531b60481e` |
| `dist/query/logic-model.js` | `3d1f27cdd26b252f721e6e8f6ad3bb346eee9bb5edf1371e332b81b3c6951ed9` |
| Complete generated `bin` manifest | `0448d574968db668cd8a7612a21e51b482693480e32c09e4f39a0c229d6a2663` |
| Complete generated `dist` manifest | `6dfbe4ac6e079d5f8ef93fdf66f49805ed2af5b579754e9ea1d47fc233fea943` |

Manifest hashes cover `JSON.stringify` of sorted `[relativePath, size, SHA256]`
arrays retained in the before/after evidence. The frozen source was
`/tmp/l9-benchmark-extra/runtime` at
`8630d8988107478d249e2fdb8162f8c7dcbd3dbb`. Returned graph hash was
`629f31ec3b1fb75cfb4deff28c578fb5983f196045d97f68f84ce6e9eb9732a1`.
Node was `/opt/homebrew/Cellar/node/25.8.2/bin/node`, v25.8.2, executable SHA-256
`fdfd102dbe86b0af5dfc540a9c8dcb2fa0c5a3166d4a6c067eaf78d49568af40`.
Its argument flags were empty and `NODE_OPTIONS` was absent.

## Protocol and results

The original `/tmp/l10-campaign/mcp/run.mjs` protocol was retained: initialize,
five preparatory calls, then thirty fully parsed legacy responses cycling through
overview, entrypoints, calls, flow and node. No retries, exclusions, heap overrides,
forced GC or CPU profiler were used. Timing spans request write through full JSON-RPC
and embedded response parsing. Nearest-rank p95 uses all thirty measured samples.
The external RSS sampler adds measurement overhead and was not injected into MCP.

| Measurement | Result |
| --- | --- |
| First response | 349,774.8335 ms; success |
| First-response observed tree RSS peak | 5,298,143,232 bytes; pass |
| First later request, entrypoints | 7,037.192 ms total |
| That request's freshness observation, including first worker use | 6,781.778 ms |
| Thirty measured warm calls | median 848.463 ms; p95 897.778 ms; pass |
| Later whole-run observed tree RSS peak | 6,400,016,384 bytes |
| Requests / errors / exit | 5 + 30 / zero / MCP and sampler exit 0 |

Cold construction now observes locally once; the observer worker starts on the
next request. Therefore the 7-second first later request is retained separately
and is not represented by the steady-warm p95. The later 6.400 GB peak is also
retained: the user's 6 GB requirement concerns the first request, not all later
requests. No additional warm-memory optimization is claimed or required here.

The cold freshness record reports observation 7,235.184 ms and rebuild
336,123.728 ms. This is not a standalone build measurement: cold MCP also loads
snapshots and serves its query. The recorded rebuild duration exceeds 300 seconds;
it does not establish or replace the separate standalone build gate.

## Memory boundary and limitations

The first-response monotonic boundary is conservatively bounded by
`[405577483.470583, 405577869.027587]` ms, a 385.557 ms interval. Its lower bound
is spawn time plus first-response duration. Its upper bound is the terminal
root-process-absent snapshot end minus all subsequent serialized request durations.
Every RSS sample starting before that upper bound is included in the cold maximum.
The first sample exceeding 6 GB starts 13,220.566 ms after the upper bound.
This proof does not depend on wall-clock/file timestamp alignment.

The sampler records PID plus process start time, recursively includes descendants
and retains their identities after reparenting. Each snapshot sums current OS KiB
values multiplied by 1024 once per PID; worker threads belong to the same PID.
There were 3,744 samples, a scheduled 100 ms cadence, and an actual maximum start
gap of 1,168.120 ms. No live missing-row or sampler errors occurred. Sampling can
miss shorter transients; this is an observed peak, not a continuous-memory proof.
All tracked PIDs were absent after completion.

## Correctness and provenance

Cold duplicate observation was removed without skipping source/config/artifact
validation. Logic descriptions, rankings, counts and call adjacency initialize on
demand; node incidents are memoized only for requested nodes. Calls/flow still
build full call adjacency on first demand. The graph itself is not claimed to be
fully paged. Regression coverage compares all public logic API results and order
against the frozen eager implementation, including estimated edges, cycles,
package membership, entrypoint classes and limits, plus pending cold disposal and
context races, worker freshness and demand-allocation behavior.

Executed from the measured worktree:

```sh
./node_modules/.bin/tsc
./node_modules/.bin/tsc -p tsconfig.cli.json
node --test tests/logic-demand-index.test.mjs tests/logic-query.test.mjs \
  tests/logic-entry*.test.mjs tests/mcp-cold-observation.test.mjs \
  tests/mcp-demand-index.test.mjs tests/observer-freshness.test.mjs
```

All **33 tests passed** in 3.613 seconds. Integrated full checks, package validation
and final integrated acceptance remain pending; they are not implied by this run.

Before/after verification matched all 58,426 source-file hashes, source commit and
status, generated `bin`/`dist`, candidate diff/status, Node/package identities and
the original 84,817-file cache. The copied cache changed through rebuilding to
169,624 files. Only its copied stale lock was removed after verifying PID 16043
absent; the original cache was untouched. Copied outputs are not claimed immutable.

Local evidence root: `/tmp/lattice-l10-mcp-cold/.omo/evidence/mcp-cold/`.
`focused-parity.log` contains the regression result. Under `runtime/`, retain
`before.json`, `after.json`, `harness-binding.json`, `copied-lock-recovery.json`,
`cold-boundary-proof.json`, and `results/runtime/{report.json,rss-summary.json,
rss-samples.jsonl,*.request.json,*.response.json}`. Original harness SHA-256 is
`859da6f6f6e59c760a07e5dbac333632a0384759c308b60a930a5ca51e85625c`;
the external sampling adaptation is
`3cdf583e7f7fac0385dadc38af55c6846fb16e61bd242efa49b5d93db89f97d4`.
These local paths identify retained evidence; they are not portable public links.

## Integration addendum — 2026-10-13

The reviewed changes were integrated into `0ca65107fdb52bc0862875e2154b655cf3c3b6dc`; integrated repository checks passed 1,193 tests and installed-package verification passed. First-request memory and warm-latency results above remain measurements of the explicitly bound isolated candidate; integration does not relabel them as a new MCP run.

Integrated viewer measurements failed strict L9 first-display comparison in 15/24 viewport comparisons. Merge remains blocked. The sampled cold-memory limitation and later 6.400 GB peak remain unchanged.

Integrated browser evidence: `/tmp/l10-closure-final-browser/`. Check/package logs: `.omo/evidence/l10-closure-check-2.log` and `.omo/evidence/l10-closure-package-2.log`; the original package failure is retained in `.omo/evidence/l10-closure-package.log`.
