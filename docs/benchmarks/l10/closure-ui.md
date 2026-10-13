# L10 closure UI: bounded verification

Status: scoped correctness checks passed; integration, package checks and publication remain pending. This report does not change the historical L10 performance or utility gates.

## Scope and baseline

The isolated source baseline is `003beebcf096ae237993fd611cbfe305f75831fc`. The change keeps the strongest initial 12 dependency arrows visible while selecting or previewing a folder. Bare home has no selected card; an explicit stage URL restores selection. Executable entry status remains a badge. Only the selected card is blue; outgoing edges are green/4px, incoming edges purple/2px, and unrelated context has opacity 0.3. A one-line legend explains direction and clearing.

Short arrow totals replace ambiguous arithmetic labels. Existing SVG titles and selected detail text retain the separate file/declaration counts. Ordinary desktop package cards use less vertical space; grouped member lanes retain their original spacing. No routing algorithm, bootstrap, data, dependency or repository-specific branch changed.

## Final initial-screen geometry

Actual Chrome renderer QA used the same frozen `66d0de4` campaign graph data for baseline and candidate. The server overlaid each renderer's compiled assets and recorded their served paths and SHA-256 values. This is a same-data renderer comparison, **not** a fresh formal export, startup timing or public Pages result. Desktop viewport was 1440×900; mobile-width viewport was 390×844.

| Repository | Width | Baseline last visible card bottom | Candidate bottom | Candidate arrows | Full geometry |
|---|---:|---:|---:|---:|---|
| ripgrep | 1440 | 947.48 | 765 | 12 | PASS |
| ripgrep | 390 | 841 | 841 | 12 | PASS |
| nowinandroid | 1440 | 1174.48 | 887 | 12 | PASS |
| nowinandroid | 390 | 827 | 843 | 12 | PASS |
| excalidraw | 1440 | 896.48 | 719 | 12 | PASS |
| excalidraw | 390 | 762 | 778 | 12 | PASS |

The six-case regression checks **every visible card**, all 12 displayed routes, zero horizontal overflow, no initial selection and no console errors. The supplemental SVG checker separately verifies full marker triangles and target-card containment; it does not establish raster occlusion or full path-overlap absence.

## Interaction checks

Mouse contexts at both 1440 and 390 widths on ripgrep and nowinandroid verified: initial selection absent; hover preview does not change the URL; leaving a card for a gap clears its preview; click selects; same-card click and blank click clear; reload restores the explicit selected URL; Back restores the prior state. All states retain 12 arrows and the original card context. Errors: zero.

Separate 390-width contexts with `hasTouch: true` and `isMobile: true` used real taps. Selection, repeated-tap clearing, blank clearing, reload and Back passed with no hover preview. A narrow regression also covers file-preview articles: only their real nested selector button owns `aria-pressed`, and clearing or selecting another card resets it. These interaction captures precede the final CSS-only correction to grouped member-row spacing; the final six initial captures above verify that correction. No subsequent TypeScript interaction changes were made.

## Rejected attempts and retained limits

- Full arrow text in the visual label forced desktop spacing to 72px and reduced mobile routes to 11/10. Rejected. Source and numerical results remain in local evidence; those first candidate PNGs were overwritten and are not claimed preserved.
- Applying the new 24px ordinary-level gap to grouped member rows also compressed their original 64px lanes. The third map then routed only 10/12, expanded fallback gaps to 128px and ended at 967px. This was a real regression, not an accepted limitation.
- Restoring all original group geometry recovered routes but increased nowinandroid's bottom to 926px. Rejected.
- Before-first-render isolation of **only** original member-row spacing recovered all three desktop maps. The final fix deletes the member-row selector from the new 24px rule, preserving the original 64px rule. No graph-shape cutoff or extra layout trial was introduced.
- The first third-map mobile guard timed out because its locator waited on the first hidden station. The failed attempt is retained; correcting the harness to select a visible station produced the final mobile result.
- The wider six-repository guard recorded no console errors or overflow in its completed cases. fzf and spring-petclinic had no rendered arrows, so the marker checker returned UNVERIFIED; their mobile whole-map fit is not claimed. They were not redesigned in this slice.

## Verification and evidence

- Reviewer regressions: 5 passed / 2 failed before fixes, then 7/7 passed.
- Final dependency-focused tests: 345/345 passed (`node --test tests/dependency-*.test.mjs`).
- Build: `npm run build`, exit 0.
- Actual-browser group geometry regression: 6/6 passed after the preserved failing run.
- Full repository checks, installed-package verification, fresh export caps, integrated startup measurements and public publication were not run by this slice.

Local raw evidence is intentionally not committed: `/tmp/lattice-l10-closure-ui/.omo/evidence/closure-ui/REPORT.md`, with RED/GREEN/build logs and source proof; `/tmp/l10-closure-ui-qa/reviewer-followup/` and `touch-followup/` contain interaction captures; `group-fix-final/` contains the final six initial screenshots, result JSON and served-asset inventories. Rejected runs remain in `attempt1-verbose-results.json`, `excal-guard/` and `group-isolation/`. These local paths are evidence locators, not durable public artifact links. Publication evidence must be attached separately by the integrating owner.

## Frozen implementation files

These hashes bind the isolated source used for the final bounded check. The integrating owner subsequently removed trailing whitespace from `viewer/dependency-overview.ts` line 60; that formatting-only integrated file has a different hash and needs its own integration proof. The tested compiled behavior is unchanged. This report itself does not alter the isolated source.

| Owned file | SHA-256 |
|---|---|
| `viewer/dependency-overview.ts` | `cda4de0e0e4e4bd885d24b52466ec59e3a5e6673d1618a35c18e1c94a9a8dd9b` |
| `viewer/dependency-package-arrows.ts` | `d9dcb236471f8e345ae5b27dcb5e641ae8bf9432ca429f9a649c0e281afcba6b` |
| `viewer/dependency-arrows.ts` | `ded970d24527a60d5a72081cedee86ce4296b84df54272bdd842dc7e445df47a` |
| `viewer/loop-map.css` | `1c8e89e2af1ab6c797afb87fb741a0e869ef8578b828df20c147280b496df9a7` |
| `tests/dependency-highlight.test.mjs` | `66b217974058dc3b5424dfbaef8c39fa3e639fc0eae03867b9864644f54562f2` |
| `tests/dependency-geometry-reuse.test.mjs` | `578abbd1053f4bc19d9283e6bd3a776de7a6030d71537101af48683edc1363de` |

## Integration addendum — 2026-10-13

The UI changes, including the documented whitespace-only adjustment, were integrated into `0ca65107fdb52bc0862875e2154b655cf3c3b6dc`. Integrated checks passed 1,193 tests and installed-package verification passed.

The subsequent 48-sample browser campaign recorded zero page errors, HTTP failures, horizontal overflow and initial full-graph/transport requests. Supplemental marker/card geometry passed on 12 package-map screens; the other 12 screens lacked that surface and remain UNVERIFIED. Eight pointer/touch scenarios passed. Selected-state geometry remained UNVERIFIED under the inspector opacity restriction.

This campaign used integrated assets over frozen exported data, not fresh extraction. Strict L9 startup comparison failed 15/24 viewport comparisons and still blocks merge.

Integrated browser evidence: `/tmp/l10-closure-final-browser/`. Check/package logs: `.omo/evidence/l10-closure-check-2.log` and `.omo/evidence/l10-closure-package-2.log`; the original package failure is retained in `.omo/evidence/l10-closure-package.log`.
