# Snapshot trends and node history

The Changes screen compares any two exported snapshots and retains their manifest identity, commit, graph/lens hash and coverage. It renders node, edge, facet and finding changes with separate original before/after source links and complete record JSON. A semantic node focus in the URL connects node detail to the relevant comparison and survives reload. Existing base/head query links remain valid.

Facet trends use manifest observation order, not commit chronology or elapsed time. Each typed value counts unique nodes within the selected layer and visible kinds; missing, null, strings and numbers remain distinct. Multiple values may count the same node in separate buckets. Unavailable snapshots are explicit gaps, never zero counts. Lens changes and current-lens projections carry explanatory labels.

Finding lifecycle distinguishes pass-to-fail and fail-to-pass from first failure observation, removed rules and unavailable judgments. Removing a failing rule or replacing its status with unknown never counts as resolution. Nongating warnings remain ordinary additions/removals/changes.

Node detail lists bounded observations using layer, kind and original ID across namespace changes. First observation is not asserted as creation. Consecutive readable records establish additions, removals and node content changes; unavailable snapshots break the comparison chain. Source path moves are shown separately with both original sources. Timeline events track node content, while associated edge/facet/finding changes remain available in pair comparisons. No-history and single-snapshot exports explicitly state their limits.

## Verification

Strict build/typecheck, formatting and 113 tests passed. Five new focused tests cover typed counts and duplicate emissions, missing/null distinctions, conservative gate lifecycle, namespace equivalence, source movement, observed additions and unavailable gaps. Independent read-only source review passed and ran twelve focused history tests.

Installed-package scenarios passed for build/check/diff/export/live server, including retained pass/fail/unknown exit statuses.

Chrome passed seventeen scenarios covering manifest provenance, typed counts, arbitrary pair selection and reload, separate original source URLs, node focus links, empty/one/same-snapshot states, lensless history, invalid IDs, asynchronous navigation, HTTP gaps and retry, actual gate transitions, actual namespace-only revisions, and keyboard disclosure of complete metrics and original sources. Gate and namespace fixtures were authored and committed, then extracted by the actual CLI; their graphs were not manually fabricated.

Thirty-six full-page captures cover both screens for lens, lensless and historical bs-mobile at 375/768/1280 in light/dark with no document overflow or page errors. Initial visual review found missing source-disclosure markers and expanded finding JSON burying the new timeline. The final UI restores native markers and uses the existing compact finding renderer without dropping metrics. Initial captures remain under `before-compact/`. Independent native-image review passed the corrected captures; this is bounded visual evidence, not whole-site accessibility certification.

External scripts, fixture commits, browser results, screenshots and asset checks are under `/tmp/lattice-browser-qa/history-evidence/`. Lens graph `3a194c20cab91f4c39f6e8458b16870adfe86069f89fe0b5c5598eb051879433`, lensless graph `a71c18dce189fd0b4769c297e726614af646c46d321ff5c34e454f5bf9a1cc54`, and historical bs-mobile graph `44b8fe20c5cc6ccc6fafe26aa9b8f3df49360bb2f0b313410c9931602a1b4317` retain original data while using the candidate viewer assets. All twenty-four viewer asset hashes match the repository build across seven candidate sites. Matching-theme, top-of-page 900px baseline comparisons show 102785/337500 changed pixels for the redesigned mobile Changes screen and zero changed pixels for desktop bs-mobile node detail above the new section; these are bounded viewport comparisons, not full-page equivalence. This is not a fresh consumer deployment.

The inline comparison renderer was replaced with focused rendering and projection modules. No dependency, domain branch, consumer file, ADR or device work changed. Full L2 acceptance remains pending the three real repositories and consumer Pages deployment.
