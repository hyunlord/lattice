# Layered catalog delivery

This slice supports consumer issue [bs-mobile #141](https://github.com/hyunlord/bs-mobile/issues/141) with generic collection selection, layer identities, declared edges, matrix projection and snapshot comparison. It does not complete the full L1/L2 acceptance ledger.

Multiple collections in one JSON/YAML file retain their original pointers. A selector may assign a layer and read each record's kind field. Layer identity is separate from the original ID; inferred references resolve only within their source layer. Explicit target queries permit intentional correspondence. Disabling inferred references lets a lens own the relationship meaning. Synthetic nodes and all four declared view types now survive the CLI build path.

A matrix edge rule reads ordered IDs and cell values. Nonempty cells create directed row-to-column links with cell provenance. The static viewer presents declared matrices and layer-filtered home, list and details. Snapshot comparison reports nodes, findings, edges and facets, excluding top-level source-location-only changes.

Validation: `npm run check` passed 46 tests, typechecking, formatting and documentation checks. `npm run test:package` passed installed CLI, history, cache, export and live-server scenarios. A real bs-mobile graph at `de2a5713ce7c9d9c9f38a663e0a1cae66bbfe5b5` reproduced the requested historical oracle: 6 weapons without evolution, 15 without linked items, 11/7 item links for seed bag/carpenter hammer, 12 tools without XP return and 0 wave-one evolutions. These values are consumer historical assertions, not engine constants or current-catalog gates.

The consumer source contains 151 design content records, 13 systems and 41 nonempty directed influence cells at that commit. Domain predicates remain in the consumer lens. Missing optional card/primitives fields do not establish implementation evidence. The consumer workflow compares the baseline and current repository using the same external copy of the current lens, labeling snapshots as current-lens projections.
