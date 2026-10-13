# L11 delivery evidence

![Three languages at1440 and390pixels; sheet thumbnails are50%](screens/sheet.png)

The original [HTTPX1440](screens/httpx-1440.png), [HTTPX390](screens/httpx-390.png), [ripgrep1440](screens/ripgrep-1440.png), [ripgrep390](screens/ripgrep-390.png), [Now in Android1440](screens/nowinandroid-1440.png) and [Now in Android390](screens/nowinandroid-390.png) are actual browser viewports, without a lens or AI summary. The [manifest](screens/manifest.json) binds their dimensions and hashes to candidate`2b7c00f`. The subsequent`940b23c` patch changes only the early loading shell and its regression tests; the completed summary model and these views are unchanged.

## Browser and implementation checks

The three pinned sources were freshly extracted and exported, not overlaid onto an earlier graph. Eight captures, including two additional Korean views, recorded zero browser errors, horizontal overflow and initial whole-graph requests. At390px the fully visible component headings numbered7,6,7 respectively; remaining content is scrollable, not removed. Mobile controls measure at least44px. Actual list→detail→back→map navigation passed. Two independent visual reviewers inspected the final captures. These are interface checks, not a human30-second comprehension score.

Independent code review verified actual manifest dependency projection and packed HTTP access for arbitrary layer identifiers. Independent security review exercised malicious Git clean/process filters and confirmed that read-only `open`, including interpretation reads, did not execute them. Invalid/stale/uncited generated claims fall back to deterministic text; mechanically valid citations do not establish semantic entailment.

Candidate`2b7c00f` passed1,253 tests and installed-package checks, with Node20/22/24 CI. The follow-up`940b23c` fixed a missing favicon and raw README markup in the partial inventory; seven focused tests and real Chrome1440/390 checks passed. Initial404 observations remain in startup evidence. A fixture-based progress-screen pass does not imply successful large-repository completion.

## Large-input limitation

On the frozen runtime repository (58,427 tracked files), actual source inventory appeared at1.266s, but no complete map was available at the20-minute deadline. The process was intentionally stopped; orderly exit0 is not a success. Sampled peak summed CLI-tree RSS was4.478GB (10,987samples; maximum sampling gap16.541s). The source stayed unchanged. A second full cold390px trial was prospectively marked N/A. Diagnosis remains open in [#102](https://github.com/hyunlord/lattice/issues/102); the broad export-phase timestamp does not identify the slow operation.

## Distribution boundary

The unscoped npm package `lattice` is owned by another project. This delivery uses a versioned GitHub Release tarball invocation rather than claiming that name or requiring unavailable npm credentials. The package provides the `lattice open` binary. A release link is usable only after publication and an installed-command smoke check.

The public gallery is Lattice's own site with six non-game repository examples. The configured game map remains a separately labelled lens example. Consumer sources and Charter & Kin were not modified. GitDiagram's public documentation was accessible, but matching diagrams for the frozen source revisions were not verified; the optional comparative arm is N/A, not zero.

Comparative scores, launch measurements and publication verification are recorded separately after their actual runs; no pending result in this document is a pass.
