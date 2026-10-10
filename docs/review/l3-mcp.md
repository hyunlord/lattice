# L3 MCP and installed agent acceptance

The implementation exposes eight stdio tools with content freshness before each query, shared web projections, bounded evidence and repeatable agent setup. L4 reusable automation and L5 combined performance/oracle/portability acceptance remain pending.

## Automated and installed artifact evidence

`npm run check` passed strict core/CLI/viewer/browser TypeScript, formatting, **138 tests** and documentation checks. `npm run test:package` passed from an npm-packed, separately installed package, including real child-process MCP calls for all eight tools. Before each tool the fixture source changed; each returned the new persisted graph hash and source value. An unchanged subsequent call reused the graph. EOF exited cleanly and stdout contained only JSON-RPC.

Focused service/protocol checks exercise preserved-size/preserved-mtime content edits, failed lens observation without stale fallback, correction recovery, fragmented input framing, three negotiated legacy versions, readiness, protocol/tool error separation, typed facet filters, cycle termination, directed paths, semantic namespace-normalized history and cross-layer incident edges. Existing viewer query tests still pass through the shared compiled modules.

Init checks and installed init/build/check/export prove Graft coexistence, byte-stable reruns, original configuration preservation, malformed/duplicate configuration preflight, external home isolation and project-only `--no-global`. Operational I/O failures are not a cross-file transaction; the [setup contract](../design/mcp.md) documents that limit and the conservative TOML subset.

## Actual Claude Code and Codex

[Sanitized client evidence](evidence/l3-clients.json) records source commit, actual tool-use IDs, arguments, response graph hashes and result excerpts. Raw transcripts stay outside the repository because they contain redundant client/runtime context.

- bs-mobile source: `2338b53970e5cc55f027b65ca3c0fbfe6517adcb`, clean throughout.
- Both clients returned graph `76253be0d1545f2c7467849e25792212f0bd2d33e1b1381d3600fe89365d1c48`, matching the published L2 graph.
- Claude Code **2.1.280** enumerated all eight tools and made overview/find/findings calls.
- Codex **0.162.0** made the same three MCP calls. Its transcript does not expose the complete discovery catalog; this is not claimed as a separate full-catalog transcript.
- Both returned **24** selected stat-only items, finding metrics **24 / 30**, matching item identities and the exact lens-authored intent. Neither used shell/file substitutes.
- A real-client failure found an oversized overview (161,185 characters). Compact summaries reduced it to **3,957 / 3,970** characters; both final clients completed without oversized-output errors. Detailed evidence arrays remain explicitly paginated.

Temporary explicit client configuration used installed authentication without modifying actual host settings. External cache paths kept consumer sources unchanged. Successful tool calls establish L3 integration; they do not prove the L5 latency limits or game runtime behavior.

## Static viewer regression

The new export was driven through seven routes (home, list, detail, Explore, automatic matrix, lens matrix, Changes) at 1280 and 375 pixels: **14 checks**, **22 JavaScript modules HTTP 200**, zero browser errors and no page overflow. [Browser results](evidence/l3-browser.json) and [compiled module hashes](evidence/l3-shared-modules.json) retain the actual evidence. Shared Explore/Views/History exports exactly match the corresponding core build modules. Desktop/mobile captures were directly inspected; tiny accepted-baseline differences are focus-ring/rasterization, with matrix scrolling preserved.

This packaging regression deliberately used the preserved L2 graph `bab5f988f60e8ab7594650ce596edfc9fdf4f0b74f3cfd1ae55943195e62a3a1` at source `bd22813`, enabling an identical-data comparison. It does not claim to be the current public snapshot. Current-source graph identity is proven separately by the actual client evidence above.

## Review outcomes

Review found and corrected MCP/raw-history mismatch, inconsistent before/after default layers, missing facet distributions, cross-layer incident-edge omissions and replacement of shared cache artifacts by another writer. Semantic history now uses the same implementation as the web; raw CLI history remains separately available in cache. Another review correctly distinguished malformed-config preflight from operational crash atomicity; documentation states the actual guarantee.

The protocol and source/graph semantics are documented in [MCP contract](../design/mcp.md). The reusable action and final benchmark acceptance remain subsequent milestones.
