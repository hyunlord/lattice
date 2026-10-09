# Generic relationship exploration

The Explore route uses the same exported nodes, edges and facets as the rest of the viewer. Domain interpretations remain in lenses. Node detail links into one-hop exploration; active layers and query controls remain URL-addressable.

## Implementation contract

- Filters combine node kind, edge kind, text and facet values. Edges remain only when both endpoints belong to the selected node set.
- Shortest paths use deterministic breadth-first search, respect directed edges and allow both directions for undirected edges. Missing/unreachable endpoints have explicit empty results.
- N-hop neighborhoods support incoming, outgoing and both directions. Results contain every induced edge between the reached nodes, including edges beyond the traversal tree.
- Kind/folder groups preserve all members and count every edge once, including parallel and self-loop edges. Hub degree counts each distinct incident edge once.
- The browser starts aggregated above 50 selected nodes (including the required 250+ case) and exposes explicit group expansion and pagination rather than silently dropping the remainder. The SVG has equivalent accessible lists and keyboard controls.

A lens may derive the generic boolean node attribute `pinned` to pin hubs initially. Explicit URL `pin` values override these defaults, including an empty override.

## Verification

- `npm run check`: strict library/CLI/browser builds, formatting, 78 tests and documentation checks. Five new tests exercise directions, deterministic ties, induced filters, hub degrees and complete accounting for 5,000 nodes with 5,002 edges.
- `npm run test:package`: existing installed CLI, export and live-server scenarios passed with generated Explore modules included.
- Actual Chrome exercised 17 scenarios: filters, directed/reverse path, incoming/outgoing two-hop impact, group expansion, all 5,000 IDs across 100 pages, all 1,000 selected-group members across 20 pages, folder grouping, zoom/pan/reset, hub ranking, sequential inspector focus/close, metadata pins, distinct parallel-edge labels and mobile offscreen keyboard selection.
- The browser fixture has 5,000 nodes in five equal groups and 105 directed/undirected edges, including a 99-edge hub and an isolated node. Its graph hash is `601e9220d17d1189cd592a1772819bebf3eba73a54f01b3d1b52a4404591b928`. Browser traversal measured 6.622 seconds for all 100 pages and 1.290 seconds for the expanded group; these are interaction observations, not L5 build/MCP performance claims.
- The actual bs-mobile exported graph is `44b8fe20c5cc6ccc6fafe26aa9b8f3df49360bb2f0b313410c9931602a1b4317` at source `1c153cf7cb467e6e229106fe9e079b11e97d9d31`. Explore shows the designed layer's 176 nodes and 208 induced edges. Browser captures cover 375/768/1280 pixels in light/dark for both this consumer and the large fixture, with no page errors or document overflow.

## Visual iteration and limits

Initial functional checks passed, but both visual reviewers rejected the fixed-width SVG: mobile names were about 3–4 pixels high, and desktop labels overlapped. Responsive screen-sized coordinates, earlier aggregation, readable labels, separate cluster counts and keyboard auto-pan corrected this. Later review corrected mobile group-name wrapping and collision placement of relationship labels. Full names and every relationship remain in accessible paginated lists; the bounded diagram explicitly reports its displayed subset and offscreen navigation.

Kinds beyond eight add fill patterns, facet values use labeled outline patterns, and selected/pinned nodes have explicit outlines. The existing neutral design tokens, source links and complete node details remain available. Local browser evidence and native-size screenshots are retained under `/tmp/lattice-browser-qa/explore-evidence/`; the rejected first captures are preserved under `before/`.

This evidence covers the Explore feature and bounded 5,000-node navigation. Full three-repository/six-screen L2, automatic generic views, remaining list/history features, full accessibility audit and consumer Pages update remain pending. No consumer source, domain rule, dependency, ADR or held device work changed.
