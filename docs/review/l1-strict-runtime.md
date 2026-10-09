# Strict runtime sources and L1 completion

The library, all eleven CLI modules, static viewer and live-refresh client now compile from strict TypeScript. `cli/*.mts` emits the existing `bin/*.mjs` entrypoints; browser modules emit `viewer/*.js`, and the classic refresh script emits `bin/live-client.js`. Generated JavaScript is packaged but not tracked. No runtime dependency was added.

`@types/node` 20.19.43 is an exact development dependency needed to check real Node filesystem, HTTP, process and child-process APIs against the minimum supported major. Core and browser configurations retain `types: []`; only CLI compilation receives Node globals. The existing strict flags remain enabled, with no assertion-based escape or suppression. JSON persistence and browser inputs narrow unknown values into the model before use.

## Verification

- `npm run check`: all four compiler configurations, formatting, 73 unit tests and documentation checks passed locally on Node 25.8.2. Supported Node 20/22/24 are checked by PR CI.
- `npm run test:package`: installed ESM and executable CLI, all six commands, extraction/cache/history/gate/export/live-server scenarios passed. Runtime dependency remains YAML 2.9.1.
- Actual bs-mobile catalog/lens projection against baseline `59df39754bb6f1119a9a1acfe965d27e4a8cb106`: identical serialized output, 443 nodes, 800 edges, 1,140 facets and 15 findings.
- Actual Chrome compared baseline and compiled candidate using the same exported bs-mobile artifact. Home/list/detail/matrix/history at 375 and 1280 pixels passed navigation, Korean labels, wave filtering, 13-row influence matrix drill-down and old/new snapshot identity checks. No browser exceptions or document overflow occurred.
- The bundled visual diff algorithm found nine screenshot pairs exactly equal; the 1280-pixel history pair differed by two of 30,028,800 pixels at rounded panel borders, each by one RGB level. HTML/CSS were unchanged. Independent functional and visual reviews checked this evidence.
- A fresh repository was served through the actual CLI. Editing its JSON changed the browser detail heading through live refresh while preserving `#/node/service%3Aa`. Both viewer modules returned HTTP 200, no browser exception occurred, and shutdown completed with exit 0.

Review caught a missing live-server route for the extracted `data.js` module. Serve now discovers generated viewer JavaScript as export does; the installed serve scenario verifies both module responses and JavaScript MIME types. This is a migration regression check, not a broader boundary-test expansion.

## Scope

Together with the linked L1 extraction, references, schema, aggregation, init, cache, checks, history and serving reports, this closes the remaining L1 strict-runtime gap. L2–L5, performance targets and real MCP client acceptance remain pending. Browser evidence here proves migration parity for one consumer and a live fixture, not full multi-repository viewer acceptance. No consumer source, domain rule, ADR or held device work changed.
