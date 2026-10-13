# Routing closure: owned forward search

This bounded follow-up addresses first-display work without changing layout or the public routing contract. It starts from `003beebcf096ae237993fd611cbfe305f75831fc` and the retained owned-reservation patch. The implementation is in `viewer/dependency-layout.ts`; package arrows create one owned router per drawing and reserve only accepted routes. UI changes are integrated separately.

## Exactness boundary

`orthogonalRoute` retains the original function body from the preserved baseline fixture. Its optional occupancy lookups, getters, callback order and thrown objects remain on that original path. The owned factory keeps its complete string reservation set for fallback and a bounded numeric reservation buffer of at most 1 MiB. An out-of-grid reservation invalidates the numeric buffer without losing the string history.

The private search is selected only while that buffer is valid and both endpoints have integer grid coordinates inside the bounded grid. Fractional endpoints, out-of-range coordinates and invalidated reservations use the original public route. Grid dimensions and the buffer count must be safe positive integers, with at most 1,048,576 cells.

For an integer grid target, every adjacent cell has Manhattan distance either one lower or one higher than the current cell. Visiting decreasing neighbors before increasing neighbors, with left/right/up/down order within each group, therefore reproduces the original stable sort. The greedy probe takes the first permitted decreasing neighbor. Forward BFS retains the same queue, parent assignments and discovery order, including remaining neighbors after discovering the target. Rasterization, existing scratch allocation, path reconstruction and route reservations are preserved. There is no reverse search, new search buffer, dependency or layout redesign.

## Verification evidence

An independent read-only source review found no BFS blocker and confirmed the public function matched the original fixture. The tests compare both final paths and every parent write, so collinear simplification cannot hide a changed discovery tie.

Before implementation, the new test file produced the expected RED: four tests passed and the owned neighbor-sort assertion failed with four sorts instead of zero. The passing comparisons covered all 3×2 obstacle subsets and reservation-edge subsets for every endpoint pair, plus boundary and fallback cases.

After implementation:

- Owned suites: **13/13 passed**. These include exact route and parent-order comparisons, single-row/column and coincident endpoints, unreachable routes, fractional and aliased coordinates, reservation invalidation, bounded allocation, and public getter/exception behavior.
- All dependency regressions: **351/351 passed**, including dense original-route and count checks.
- `npm run build`: passed all four TypeScript configurations and viewer generation.
- `git diff --check`: passed.

Reproduce from the integrated source with:

```sh
node --test tests/dependency-owned-bfs.test.mjs tests/dependency-owned-reservations.test.mjs
npm run build
node --test tests/dependency*.test.mjs
```

The preserved oracle is `tests/fixtures/dependency-owned-original.txt`; existing dense comparisons remain in `tests/dependency-astar.test.mjs`. Local RED, focused GREEN, build and dependency logs were retained under `.omo/plans/owned-bfs-*.log` in the isolated worktree. Root-owned integrated checks are separate evidence.

## Historical failure and pending acceptance

The earlier owned-reservation-only microbenchmark failed its then-frozen internal unreachable-case criterion: 0.157083 ms became 0.170792 ms, **+8.73%** (+0.013709 ms). That failed result is retained; this follow-up does not reclassify it or use another case to erase it.

The new forward-search candidate is **untimed**. No new microbenchmark or browser performance result is claimed here. Code parity and build success do not establish first-display improvement. The user acceptance target is actual first display against the unchanged L9 baseline across the required 24 repository/viewport pairs, using the unchanged protocol and preserving failures without retries or exclusions. Combined UI and routing validation remains a separate gate.

## Integration addendum — 2026-10-13

The routing changes were integrated with UI, bootstrap and MCP changes into `0ca65107fdb52bc0862875e2154b655cf3c3b6dc`. Integrated checks passed 1,193 tests and installed-package verification passed.

The combined viewer subsequently completed the original 48-sample browser protocol. Strict L9 first-display comparison failed 15/24 viewport comparisons; no samples were retried, excluded or replaced. These combined measurements do not isolate the routing change performance contribution or replace the preserved failed microbenchmark. Startup failure still blocks merge.

Integrated browser evidence: `/tmp/l10-closure-final-browser/`. Check/package logs: `.omo/evidence/l10-closure-check-2.log` and `.omo/evidence/l10-closure-package-2.log`; the original package failure is retained in `.omo/evidence/l10-closure-package.log`.
