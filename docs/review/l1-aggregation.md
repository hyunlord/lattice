# L1 numeric aggregation coverage

`sum` now skips actual missing entries while retaining a numeric result. The new `aggregate` expression exposes that same sum with total, valid, missing and invalid counts plus complete/partial/unknown coverage. Explicit null is invalid numeric evidence, not missing; a nonempty all-missing collection and overflow cannot produce a supported zero. The empty-array sum remains zero. The [expression contract](../design/lens-examples.md) defines each case and the explicit completeness-gate pattern.

## Verification

- `npm run check`: 73 tests, source typecheck, formatting and documentation pass. Focused cases verify arithmetic, materialization, exact field evidence through derived bindings and record-order stability.
- Before implementation, the new CLI scenario fails with unsupported aggregate at base `a99356470e3e0fa6a1251d00baa2147a1f5780b6`.
- Real CLI on a committed non-game repository observes partial sum 3 with 1/2 valid capacities and a failing missing-count gate. Supplying capacity 7 yields sum 10, complete coverage and passing checks. An authored null yields invalid count 1, missing sum and an unknown numeric gate. Restoring the source restores the graph hash; historical diffs change both findings and static export preserves identity. Missing fields have no invented source pointers.
- Independent review, focused tests, CLI rerun and typecheck pass.
- Complete installed-package smoke passes, including the new aggregation scenario and existing CLI/cache/history/serve scenarios.
- Actual bs-mobile D3 v1.1/runtime projection is byte-identical to the base: 443 nodes, 800 edges, 1,140 facets and 15 findings. No consumer files changed.

Alongside existing structure tests for four materialized view types, [code-link evidence](l1-code-links.md), [finding descriptions](l1-structured-cli.md), [gate exit semantics](l1-check.md) and [source provenance](l1-source-provenance.md), this completes L1-07. Viewer rendering and real-agent acceptance remain their separate L2/L3/L5 requirements. Full L1 remains pending for complete strict typing of shipped CLI/viewer code.
