# L1 missing-value classifications

The expression evaluator previously converted missing values to null in comparisons, wildcard/map projections, lexical bindings and derived storage. This could classify an incomplete operation as a distinct implementation, treat empty effects as implemented, or count absent data as authored null. Internal recursive runtime values now preserve missing until graph materialization. No sentinel JSON object, dependency or domain branch is introduced.

## Observed verification

- The actual CLI reproduction initially reported two implemented records instead of one, and three explicit nulls instead of one. Both configured gates failed.
- After the fix, the same four-record scene selects only the implemented record, excludes absent operations from custom implementation evidence, and counts exactly one authored null through map → let → derived → finding targetValues. Check and exported graph agree.
- One focused library integration verifies graph/node derived propagation, wildcard/map, lookup, equality/inequality/membership, nonempty all, unique and indexOf without collapsing missing into null. Strict numeric sum behavior is preserved.
- `npm run check`: 60 tests, strict types, formatting and documentation checks passed.
- Full installed package smoke suite passed. Independent review ran the focused library case and CLI check/export in a fresh repository; no blocker remained.
- Actual bs-mobile D3 v1.1 catalog and runtime projections deeply equal the output from rebuilt main `507e0970dc11e78b44adf19ad23506d7ee741152`. This confirms unchanged valid data output, not new runtime implementation evidence or complete oracle acceptance.

Graph JSON continues to materialize remaining missing slots as null; internal calculations do not consume that serialization. Matrix inputs containing missing values are rejected rather than silently converted into empty cells. Full expression vocabulary, aggregation coverage, viewer and MCP acceptance remain pending.
