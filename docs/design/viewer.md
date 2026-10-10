# Generic viewer specification and wireframes

L0 design; no UI implementation or visual gate is claimed. [Tokens and component states](../../DESIGN.md) are the single visual source. All six screens render graph kinds/edges/facets/findings/views/snapshots. A lens can name/order/describe data and choose one accent, never inject CSS, layouts or domain screens.

## Shared desktop shell

```text
┌ Repository / commit / dirty + freshness ───── search ─ theme ┐
│ Home       │ Title + coverage / graph hash                  │
│ Explore    │ Filters or query controls                     │
│ List       │ Main data surface             │ Inspector     │
│ Views      │                               │ source links  │
│ Changes    │                               │ evidence      │
└────────────┴───────────────────────────────┴───────────────┘
```

The node page is a deep link, not a sixth unrelated navigation mode. Every navigation item works with no lens. Empty state distinguishes a truly empty repository, no matches, no history, unsupported source, and failed export; it never inserts fake sample data. In each L2 acceptance repository, substantive real content must populate all six routes.

## Home: `#/home`

```text
Repository name     source commit       [fresh / stale / unknown]
Kinds                 count      facet distribution (if present)
module                128        each segment labeled + counted
record                 96
Findings: gate result | rule | metric | explanation | evidence
Automatic: isolated records / broken references / highest-degree hubs
Recent change concentration: directory + changed-node count + compare link
```

Without lens, derive kinds from adapters, resolve references and show computed structural findings. Recent concentration uses available commit history; if history is absent state its absence and show current source inventory, not a fabricated zero-diff trend. Lens findings appear in the same finding table with authored/computed basis and gate text.

## Explore: `#/explore`

```text
[kind filters] [facet filter] [group: kind/folder] [reset]
[from node] → [to node] [path]       [neighbors / n-hop impact]
cluster ◇ 300 ─── 120 references ─── cluster ○ 230
[expand cluster]          selected node → inspector
Accessible cluster/node/edge list below graph
```

Start aggregated when more than 250 visible nodes; the implementation also aggregates above 50 nodes to keep actual consumer labels legible. Use a viewport in screen-sized coordinates, readable labels and pan/zoom for expanded content instead of shrinking every label to fit. Show counts of nodes and edges in each group. Expand only chosen groups with a bounded per-page node list; preserve the rest as clusters. A 5,000-node fixture must stay navigable through expansion, never truncate silently or render thousands of labels at once. Click/Enter selects; keyboard buttons provide expand, zoom, pan and reset equivalents. Lens hub pinning is expressed by node/query metadata, not special IDs in renderer. Shapes combine kind with facet outline/pattern and textual legend. Show direction, edge kinds and lens labels. No path displays a clear result rather than a blank graph.

## List: `#/list?kind=...&q=...`

```text
[kind] [text search] [facet / field filters]    41–80 of 96
Name → node | most common field | another field | source
[sortable headings; pinned name; explicit next/previous]
```

Zero-config columns rank scalar fields by record prevalence, excluding overly long arrays/objects; source and name always remain. Lens columns replace the defaults and may use derived intent/implementation values. Searches include name, IDs, tags and configured text; filters/sort are deterministic and encoded in URL. Sorting missing values puts them last. Mobile keeps main labels and offers a horizontal table scroll region.

## Views: `#/views/<id>`

```text
[view selector]  title / description / input coverage
Matrix: row kinds × column kinds; nonzero cell → matching edges
Distribution: field selector; labeled bars + equivalent count table
Cycle: query groups + directed links; counts/evidence → nodes
Table: specified generic columns and query output
```

Always provide `auto-kind-matrix` and `auto-field-distribution`; distributions use actual source attributes/kinds when no lens exists. Matrix axes and cells are drill-down links. Cycle layouts follow graph query relationships and optional ordering, never a hardcoded product loop. Lens views use generic matrix, distribution, cycle, table, gallery, graph and status templates. Gallery/status reuse computed table columns and rows; optional column roles name summaries, badges and status. Individual graph views preserve node identities and support a focused neighborhood. Matrix cellDisplay=label exposes authored relationship text and a target filter with sticky headings. No template contains domain-specific branches. A view with insufficient inputs reports what is missing and links to its query/coverage.

## Changes: `#/changes/<base>/<head>`

```text
[base snapshot/commit] → [head snapshot/commit] [compare]
Node   +12 −3 ~4      Edge +10 −2 ~1
Facet  +7  −2 ~5      Finding: new violations / resolved / changed
Facet distribution by snapshot: labeled trend + table
Changed node → before / after attributes and source spans
```

Commit list and snapshot coverage are explicit. Build/export materializes comparison snapshots from real history. Two selectors can compare any exported pair. IDs in routes are resolved against the manifest and invalid/missing snapshots show recovery, not current-state masquerading as history. In a one-commit test, explain why a second snapshot does not exist; L2 real-repository evidence must actually exercise two distinct snapshots. Node detail history derives changed-node IDs from those snapshots.

## Node detail: `#/node/<encoded-id>`

```text
Kind + shape    Name / full ID               copy link
Facets and code support      source file:line @ commit
Attributes                   intent | implementation (if lens supplies)
Incoming relations           outgoing relations
Related findings and targets / metric evidence
Changed in: commit links and before/after drill-down
```

Deep links survive refresh and encoded punctuation/non-ASCII IDs. Invalid IDs show not-found with search. Source links use commit-pinned repository URLs only when the recorded file digest equals that commit blob. Dirty/untracked/git-less sources remain explicitly labeled working-tree/local provenance text with their digest; never link those bytes to an unchanged commit. Support status says static source evidence or unknown, never implies observed execution.

## Static runtime and error behavior

Export includes all JS/CSS/fonts (system stack), graph JSON and snapshots; no runtime framework CDN, API, or application server. Normal static HTTP hosting and GitHub Pages both work. Serve mode adds only local watcher notifications; browser polls a small revision endpoint and reloads data without discarding route/filter state. Broken JSON/export schema reports version/error and does not render misleading zeros. Untrusted names/templates render as text, not HTML. A repository title containing `<script>` must appear literally.

## L2 visual/interaction evidence plan

Capture home/explore/list/views/changes/node detail for each of three actual repositories: bs-mobile lens, Charter & Kin example lens with external output, and lensless public non-game repository. Attach an index of 18 desktop screenshots to the PR, each recording source commit, graph hash, lens hash, route and viewport. Add mobile (375px), tablet (768px), light/dark, focus and error-state evidence. Screenshots alone do not prove interactions: drive navigation, keyboard selection, kind/facet filtering, neighbors, paths, aggregation expansion, sort/search, matrix drill-down, theme persistence, history pair selection and copied deep-link reload in a browser.

Measure text/non-text contrast and run color-deficiency simulations for category/selection/status distinguishability. Inspect images manually at native size. Browser assertions must check meaningful real rows/relations/metrics, not only element existence. Retain browser console errors/network failures and fix them. Record failures and final evidence in `.omo/evidence/` and PR artifacts; no evidence ZIP delivery. This document is not evidence that these gates have passed.

## Curated human presentation

A lens may select home viewIds, findings, inventory and distributions. Empty-layer views are hidden; direct links offer the layers containing their inputs. Detail summaryFields use attribute paths (or `facet` followed by a facet key), and relationship groups provide human labels and directions. Raw attributes can be collapsed. Row membership follows the selected layer; referenced identities and relationships resolve against the complete graph. Program presence and static support remain distinct from observed execution.
