# Generic matrix, distribution, cycle and table views

The Views route renders graph-derived data with four shared templates. It always offers a kind-to-kind connection matrix and an attribute distribution, including on exports without a lens. Domain names and authored views remain in lens data.

## Computation and navigation

Automatic matrices count actual edges between kinds. Directed edges appear in their source-to-target cell; undirected edges appear in both directions, with same-kind/self connections counted once per cell. Isolated kinds remain on the axes. Axis and cell drills link to the selected members and their evidence.

Distributions preserve JSON category identity: numeric and string values do not merge, and absent attributes remain distinct from explicit null. The field selector derives its choices from scalar source attributes, with kind as the default. Lens matrices, distributions, tables and cycles consume the materialized query in the export. Membership and counts are restricted to the active layer. Cycle views show actual selected relationships, without inventing a closed loop.

View IDs, category selections and pagination remain in the URL. Existing directed matrix links keep their node IDs. The selector retains automatic and authored views even if their IDs collide, using an origin parameter. Query coverage and source disclosures remain available. Unsupported query shapes produce an explicit explanation rather than fabricated zero counts.

## Verification

- `npm run check`: strict builds/typechecks, formatting, 85 tests and documentation validation passed. Seven new model tests include real lens materialization for all four templates, current-layer membership, typed groups, direction/self-loop accounting and malformed inputs.
- `npm run test:package`: installed CLI/build/export/history/live-server scenarios passed with every new viewer module packaged.
- Chrome passed 13 interaction scenarios: lensless automatic views, typed automatic and authored distributions, layer changes, grouped and directed matrix drills, independent row/column pagination, all 70 table records, cycle node/evidence pagination and keyboard navigation, empty inputs, malformed queries, colliding automatic/lens IDs, invalid-route recovery and existing bs-mobile deep links, and mobile keyboard scrolling.
- The synthetic lens fixture was built and exported through the real CLI: 77 nodes across runtime (70) and designed (7), ten actual relationships and six authored views. The separate lensless export has 79 nodes and ten relationships. Runtime automatic status distribution is missing 18, null 18, numeric 1: 17 and string "1": 17. The two authored typed groups remain 35 each. Synthetic malformed/collision variants are explicitly identified as export mutations, not source evidence.
- Actual bs-mobile source `1c153cf7cb467e6e229106fe9e079b11e97d9d31`, graph `44b8fe20c5cc6ccc6fafe26aa9b8f3df49360bb2f0b313410c9931602a1b4317`, retained 13 system axes and 41 populated influence cells, source links and reloadable detail routes. Switching to the runtime layer reports unavailable inputs.
- Twenty-four full-page captures cover four templates at 375/768/1280 pixels in light/dark, with zero document overflow, page errors or failed network requests. Matrix baseline comparisons have matching dimensions/intact alpha; differences are expected coverage, selector, navigation and pagination changes. Diff ratios are 0.1339 on mobile and 0.1230 on desktop, not pixel-identical claims.

Evidence scripts, full browser results, fixture source/query facts and captures are retained under `/tmp/lattice-browser-qa/views-evidence/`. The fixture graph is `7f30c630fc68d7491eb458454f160089b28486324a52501df351ae8294d7d9bb`. Independent source/design-system and native-image reviewers both passed the final build. The first visual review caught missing mobile horizontal-scroll guidance; the shared table wrapper now includes visible scroll and arrow-key instructions outside the scrolling region. An additional browser scenario confirms ArrowRight moves the mobile table. Rejected captures remain under `before-scroll-hint/`; all 13 compiled viewer assets were hashed against the five browser sites.

This slice does not complete full L2: three real repositories across all six screens, remaining home/list/history/node features, comprehensive accessibility evidence and the consumer Pages update remain pending. No consumer source, domain rule, dependency, ADR or held device work changed.
