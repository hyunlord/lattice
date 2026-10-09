# Document-aware builds

This slice advances [L1 issue #5](https://github.com/hyunlord/lattice/issues/5) after the user-prioritized [first Pages map](https://hyunlord.github.io/bs-mobile/) was published. Full L1/L2–L5 remain incomplete.

## Behavior

`lattice build --root <git-repository>` now works without a lens. It scans Git-tracked and eligible untracked JSON, CSV, Markdown and `.markdown` files, respecting ignore rules and excluding generated Lattice/agent state. With an explicit or default JSON lens, only matching inputs are selected. JSON/CSV retain their existing record semantics; documents expose headings, containment, local links, title, status and decision. Inline syntax scanning is separate from document structure extraction. The core still receives supplied bytes and hashes; filesystem access stays in the CLI.

The Markdown adapter handles ATX/Setext headings, deterministic duplicate anchors, inline/reference links, fenced and indented code exclusion, comments, and ADR Status/Decision sections. Sources retain original file/line spans. Local links resolve against included documents and root-level records/file nodes; missing targets become diagnostics. HTTP/mail/telephone links are classified as external rather than broken local links.

Without a lens, a JSON/CSV file rejected by the record adapter remains a file node and an `unparsed-file` diagnostic; it is not misrepresented as successfully parsed data. Explicit-lens parse failures still stop the build. Generated cache/site paths do not make an otherwise clean source snapshot dirty. Actual source or lens edits still suppress pinned revision links.

## Executed evidence

- Local Node 25.8.2: `npm run check` passed strict typechecking, formatting, all 35 existing tests (including the previously parked 12 Markdown tests), and documentation checks. No additional boundary suite was added.
- `npm run test:package` installed the packed package and invoked its CLI on a temporary mixed JSON/CSV/Markdown Git repository. Cross-file record references, document links, ADR metadata, repeated equal graph hashes and static export all passed.
- The actual Lattice repository at base `df2a47a` plus this working slice produced **120 nodes / 127 edges**: 20 documents, 95 headings and 5 records, with zero input/reference diagnostics. This is the pre-report snapshot; adding this report changes the source graph.
- `node tools/document-smoke.mjs /Users/rexxa/lattice` independently read 20 tracked documents, 95 headings, 32 local links and 19 external links. Reversed input ordering reproduced its graph hash.
- Chrome at 1280×900 drove the exported home, document-filtered list, ADR detail and fixed-address reload. No page errors; screenshots inspected for readable attributes, source lines and connected headings. Temporary screenshots are not repository deliverables.
- Building the unchanged bs-mobile consumer checkout reproduced the published graph hash exactly: `f4b69e952fd1a55118c8323a6438d4583f376a085fc02dabceedcefdbe35d443` (217 graph nodes including hidden profile, 310 edges, 432 facets, 3 findings). No consumer source files changed.
- Independent review found two CLI integration defects: premature ID mapping bypassed duplicate disambiguation, and generated caches dirtied an unchanged snapshot. Both were corrected and verified using actual temporary-repository CLI reproductions. Targeted review approved the corrections.

## Limits

This is a deliberate document-oriented Markdown subset, not a complete CommonMark renderer. Nested block-container headings, MDX and multiline reference definitions are not claimed. YAML, code/module/Graft import, Git history, incremental cache, full lens semantics, remaining CLI commands and automatic findings remain pending. Domain facets are currently evaluated on JSON/CSV records; Markdown document structure is generic. The browser home explicitly describes the supported input coverage.

The existing Node 20/22/24 CI matrix exercises package installation and the real mixed-format CLI flow. Remote results are attached to the implementing PR; local Node 25 evidence alone does not prove those versions.
