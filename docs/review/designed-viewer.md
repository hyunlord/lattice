# Layer, matrix and snapshot viewer verification

The viewer derives layer choices from `node.attributes.layer`; optional `presentation.layers` labels accept an array of `{id,label}` or an ID-keyed object. `presentation.defaultLayer` selects the initial layer. Home counts, lists, findings and matrix endpoints remain scoped to that layer; a cross-layer neighbor carries its destination layer label.

Matrix views consume materialized `query.rows`, `query.columns` and `query.cells` with source, target, label and edge IDs. Rows are sources, columns are destinations. Cell links reveal actual edges and source spans. Grouped matrices also filter node IDs before recounting. Wide matrices stay within a labeled keyboard-scrollable region with a visible scroll hint.

Changes read only exported `snapshots.json` entries and their validated artifact paths. Two selectors compare node attributes, findings, edges and facets. The comparison excludes only record-level provenance and content hashes; nested domain attributes named `sources` remain part of the comparison. Hidden nodes are excluded consistently with the visible inventory. Edge changes include correspondence edges touching the selected layer.

## Executed evidence

- `node --check viewer/app.js` passed.
- Actual Chrome / Playwright fixture interactions passed at 375, 768 and 1280 pixels: separate 4-versus-1 layer counts, list-to-detail identity, directed matrix cell evidence, history metric 11→7, theme switching, no page errors or page-level horizontal overflow.
- Missing snapshot manifest, snapshot HTTP 500 with successful retry, invalid snapshot URL and empty search states passed.
- A further history fixture changed an influence-edge label and added a wave facet; both changes appeared in the appropriate sections.
- Two independent read-only visual passes inspected actual screenshots and passed design-system/functional integrity and CJK/responsive checks. Their suggestions were applied: grouped-matrix layer filtering and an outside-table scroll hint.
- Bundled image comparison of two independent home captures reported equal dimensions, 0 changed pixels, intact alpha and no hotspots. This establishes repeat-render stability, not fidelity to a user mock.

These are generic fixture checks. They do not establish bs-mobile catalog counts, live Pages publication, or Lighthouse performance scores. Real catalog integration and deployment are verified by the parent publication work.
