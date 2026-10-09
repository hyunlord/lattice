# L1 unified selected graph

Data, documents, modules, files and optional Graft symbols now enter reference resolution and lens evaluation together. Previously structural nodes were appended after lens calculations, so totals and classifications could silently omit them. Fixed structural identities remain stable; ambiguous data aliases are diagnosed, and data layers stay separate.

## Verification

- Strict typecheck, formatting, documentation checks and 59 unit tests passed.
- The installed package smoke suite passed. Its mixed JSON/Markdown/TypeScript repository exposes four nodes and four edges to derived values, facets, findings and views; JSON references reach document and module IDs.
- The same scenario verifies lensless builds, unchanged rebuild hashes, exported graph parity and historical comparison after removing a document link (four edges become three, with a broken-link diagnostic).
- Independent core and CLI reviews passed, including the optional Graft import smoke scenario.
- The actual bs-mobile D3 v1.1 data-only lens output deeply equals output from rebuilt main at `629b26d80967e2a509680286ea116fa304e1b8c4`. No consumer source was edited.

## Actual repository observation

Built `/Users/rexxa/lattice` at base commit `629b26d80967e2a509680286ea116fa304e1b8c4` with an external lens selecting root JSON, Markdown documentation and source modules, then ran the real export CLI. Existing local agent configuration makes this a dirty-working-tree observation, not a clean-commit acceptance claim.

The resulting graph has **478 nodes, 989 edges and 478 facets**. A finding selects every node and reports matching node/edge totals; a distribution's bucket counts sum to 478. It includes configuration, document, heading, module, function, method, class and type nodes. Build/export graph hashes both equal `9e33fe28665c1fc1dfc9de011b4308100d93a402c3f2444ba736ae3037af2679`. All parity and count assertions passed. The build retained 77 selected-scope diagnostics rather than inventing missing targets.

No viewer code changed. This proves static CLI integration, not runtime behavior, complete lens-language support, or completion of L1–L5.
