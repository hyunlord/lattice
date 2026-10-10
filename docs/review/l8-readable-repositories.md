# L8 repository map acceptance

Status: implementation verification in progress; Claude's held-out review and final user acceptance remain separate. Maintenance is deferred under the approved L8 scope.

## Prototype restoration (A)

[Lattice PR 74](https://github.com/hyunlord/lattice/pull/74) and [bs-mobile PR 202](https://github.com/hyunlord/bs-mobile/pull/202) restored relationship intermediates, kind-specific detail fields, attribute styles and view/item browser history. The [public deployment](https://github.com/hyunlord/bs-mobile/actions/runs/38055706432) serves bs-mobile `ba580d1b4c6c58fe919d58bd8f2d21a1d523784a` through Lattice `2b12fc6dd64ea26869deb9c806511f50f064e435`.

Five requested items were compared with the approved prototype at 1280 and 390 pixels: seed bag, iron sword, ash gathering tool, sowing sword dance and the ivory boss. All ten browser scenarios retained 163 content entries and 28 build entries, with zero console errors or horizontal overflow. Source text remains complete where the prototype abbreviated it.

## Dependency and performance evidence (B)

The independent Go import scan uses fzf `25adb674537bb2140f82602651a31fbd7677cd50`. The seven folder pairs contain distinct importing-file counts `1, 1, 4, 4, 10, 21, 6`; specifically `src → src/util = 21` and `src → src/algo = 4`, replacing the unsupported 189 and 32 file-pair counts. No package membership is treated as verified use of each member.

On an Apple M4 Max, macOS arm64, Node 25.8.2, fzf's fresh full no-lens build took 0.447 seconds. The bs-mobile full build initially failed at 10.765 and 11.343 seconds. Profiling identified repeated canonical sort-key computation and source URL encoding. Computing these once, without changing canonical validation, produced four consecutive cold builds of 9.059, 9.947, 9.460 and 9.390 seconds. Both graph and diagnostic files remain byte-identical; all 80,472 diagnostics retain their order. The 10-second budget has little margin on this machine and is not a guarantee for other hardware.

Without AI, fzf has descriptions for 8/9 initial chunks, requests 6/6 and bs-mobile 8/9. C&K's thirteen sibling folders initially collapsed into one; the corrected frontier keeps eight connected children and the remaining parent, preserving all 197 modules. Its dense real cycle is verified separately from an acyclic folder graph. Source repositories and C&K remain unchanged.

The external bs-mobile notes contain 361 Korean summaries, all fresh and source-hash matched. Those notes are separate from the no-AI description measurements. Static descriptions quote source documentation or public names and retain the original source language; AI interpretation follows the Korean viewer language.

## Reproduction and remaining gate

The first frozen candidate (`e84a0dd`) passed 227 automated tests and CI but failed independent held-out acceptance. Claude selected chi (`167e1e3`), ky (`3541888`) and jsoup (`088614f`) and judged all three partial after a blind screenshot review followed by source comparison. Test/example folders obscured production structure, shared arrow paths made counts hard to assign, and static descriptions covered only 6/9, 6/8 and 7/9 chunks. Ky also overflowed the 390-pixel viewport by 183 pixels. An independent import oracle found two missing literal dynamic imports in ky and 91 missing Java references in jsoup. These failures and Claude's original answers are retained; green CI did not establish readability.

These three repositories are now regression inputs, not held-out candidates. Corrections must pass their source/count and browser checks before Claude selects a new set of three previously unused repositories. Final acceptance is not inferred from the corrected regression set.

The second candidate passes 249 automated tests and installed-package acceptance. Independent raw-import and visible distinct-file checks now match chi 44/44, ky 203/203 and jsoup 820/820. Ky's additional 21 self-package references are resolved only from selected package metadata and its explicitly named TypeScript build configuration; missing or ambiguous metadata produces a local unresolved diagnostic. Fresh no-AI exports describe requests 4/4, C&K 9/9 and bs-mobile 9/9 chunks. Final quiet cold runs take 0.481 seconds for fzf and 9.115, 9.328 and 9.360 seconds for bs-mobile, with all 1,228 source inputs parsed and none reused. The three bs-mobile graph and diagnostic outputs are byte-identical. Final regression layout checks pass at 1280 and 390 pixels, including corrected chi and C&K mobile routes. New held-out acceptance is still pending.

During later browser work, jsoup's original screenshot filenames were accidentally reused. Claude's original blind/source verdicts remain unchanged. Historical jsoup comparison images were reconstructed from the exact `e84a0dd` viewer and preserved original cache; their filenames and provenance explicitly identify them as reconstructions, not the original captures.

Run `npm run check` and `npm run test:package`. For a cold source run, use a new external cache with `node bin/lattice.mjs build --root SOURCE --no-lens --cache-dir CACHE`; export from the same cache with `node bin/lattice.mjs export SITE --root SOURCE --cache-dir CACHE`. An exported snapshot retains its cached interpretation data: use a fresh cache and an empty external interpretation directory when measuring without AI.

Browser evidence includes fixed 1280×800 and 390×844 screenshots, geometry checks, independent import counts, navigation, source provenance and preserved failed attempts. It is retained in the local L8 evidence directory rather than a duplicate evidence archive. Three previously unused repositories are reviewed by Claude only after the implementation is frozen. The user's public Pages judgment is the final acceptance decision.
