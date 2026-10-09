# First browser-visible map

The user-approved sequence is recorded in [ADR0005](../adr/0005-first-published-map.md). This is the requested thin path, not full L1/L2 completion.

The shipped path is JSON → declarative lens → `lattice build` → `lattice export` → static home/list/node-detail. Repository meaning lives in `examples/bs-mobile/lens.json`; core and viewer contain no bs-mobile classification branches. Sources and raw attributes remain inspectable alongside facets/findings. The profile node is hidden by lens presentation, leaving216 visible content nodes.

A clean read-only clone at bs-mobile `3f402f398311dfaf202bc2fc85df02b36a444d3d` reproduced all216 per-ID depth/selection classifications with zero mismatches:77 selected,139 design,30 stat,27 base,20 unique. Three findings compute item24/30, tool3/8 and base weapon forms4/10. The lens labels original projections separately from runtime/profile overrides; no gameplay execution is inferred.

Local verification uses the existing23 tests and package checks on Node20/22/24, plus actual CLI and Chrome browser interaction. Browser checks cover home counts, kind/facet/search filters, node URLs, source links, refresh, theme, desktop/mobile layouts and console errors. Publication evidence is on the consumer PR/Actions deployment and the live Pages URL. No new boundary suite was added.

Pending after this slice: wider adapters, full lens grammar, incremental/freshness/diff/check commands, remaining screens, MCP and reusable publishing action. Static freshness means the displayed source commit, not live synchronization before the next build. Reference diagnostics are retained in cache and are scoped to selected inputs.
