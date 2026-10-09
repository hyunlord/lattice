# Three-repository viewer acceptance

This acceptance uses actual source revisions and CLI exports, not hand-built graph fixtures. Every repository supplies Home, Explore, List, Views, Changes and node detail. Static URLs retain route state on reload. Scope and source links distinguish authored content, static interpretation and runtime evidence.

## Source coverage

| Repository | Source and history | Current graph | Interpretation |
| --- | --- | --- | --- |
| bs-mobile | `de2a5713ce7c9d9c9f38a663e0a1cae66bbfe5b5` to `bd228135353b8d9ace05355b53d412f8bb3514ca` | 443 nodes, 800 edges; designed visible content 163 + systems 13 | Runtime and designed layers remain separate. Current-lens projection labels historical analysis honestly. |
| Charter & Kin | `5b33a649c9c4cc20551a9ee28f107286d0948208` to `251f397eb6646b81fd1dda0597255ee474806b49` | 200 nodes, 977 edges, 394 facets, 3 findings, 3 authored views | Minimal example lens selects 197 TypeScript modules and 3 manifest accepted-reference records. Static dependencies and manifest approval claims are not gameplay/image acceptance. |
| Click | `06b2a678741131fd577ce170e23e5ca0aeba0309` to `2247b35ea1c47c727d7a06e51fa280e12a863ff6` | 455 nodes, 653 edges, 2 automatic findings | Zero lens/configuration. Documents, headings, Python modules and data produce automatic views. |

C&K source was read-only. Its original checkout status remained unchanged; a separate external clone and cache supplied pinned source. The example lens is committed only in Lattice. Click uses a separate public clone and no `.lattice` configuration. Source scope is not fabricated to claim whole-repository runtime analysis.

## Corrections exposed by real data

Relative TypeScript specifiers with dotted basenames were incorrectly treated as explicit extensions. Reusing the existing language classifier restores selected targets such as `engine.types.ts` while preserving ambiguity and explicit-extension rules. Two failing-first regression tests pass, and actual C&K local unresolved imports drop from 180 to 1. The remaining CSS import points outside the selected code graph; automatic findings now explicitly state that unresolved graph references do not prove a missing repository file.

Node detail now uses canonical typed facet links, separate incoming/outgoing/undirected groups and twenty-edge pages with original source disclosures. Source links and node IDs remain unchanged. A dedicated control-border token meets adjacent-surface contrast without strengthening every decorative divider.

The consumer lens excludes explicitly universal items instead of relying on missing `itemScope` being unequal to a string. The unchanged baseline verifier originally failed with 6/18/0/0/12/0 and passes after the lens fix with 6/15/11/7/12/0. Current v1.1 remains 0/0/2/2/0/3. Findings remain warnings without gates; catalog source is untouched.

## Verification

Strict build/typecheck, formatting and 115 tests passed. Installed package scenarios passed. Focused accessibility checks cover all six screens, control/text/focus contrast, typed links, directional counts, keyboard evidence disclosure and a real CLI Unicode/punctuation ID copied and reloaded from its URL. Forty-eight contrast combinations pass: minimum control boundary 3.107:1, text at least 4.5:1. Normal, protanopia, deuteranopia, tritanopia and achromatopsia renders retain names, shapes and patterns alongside color.

Final browser verification passed 108 viewport/theme measurements (three repositories × six screens × three widths × two themes), 22 interaction groups, and exact home inventories of 176 / 200 / 455 visible nodes. No page errors or whole-page horizontal overflow occurred. All 24 exported viewer assets matched the final build in each site. Two independent reviewers inspected all 18 desktop and nine mobile-dark captures; missing disclosure markers were corrected and rechecked before both final PASS verdicts. Detail/control screenshot differences were 6.45% / 0.61%, explained by directional evidence sections and contrast boundaries.

Live consumer deployment remains pending; local export acceptance alone does not complete L2-07 or L2-11. This report does not claim MCP integration, L4 reusable Action delivery, performance acceptance or device testing.


## Reproducible graph identities

All exports contain two actual revision snapshots. Both bs-mobile revisions use the consumer workflow's external current lens (`db8fb8c1d892535918202f8889c750aee83b02ae30d26d8d83e5646db41071bc`) and explicitly identify current-lens projection.

| Repository | Current graph SHA-256 |
| --- | --- |
| bs-mobile | `bab5f988f60e8ab7594650ce596edfc9fdf4f0b74f3cfd1ae55943195e62a3a1` |
| Charter & Kin | `15eb1182925ae4940aa6bd208a0a6e4a1d499423b4b21ff20bec617ff67424f0` |
| Click | `9edcf7569873b8da06f64cd7cc4b5553ea523c30d3bcddda8d5c8c0d96224073` |

C&K uses the [read-only example commands](../../examples/feudal-lord-simulator/README.md). Click needs no lens: run `lattice build`, `lattice diff <baseline>` and `lattice export --out <external-site>` against the pinned clone with an external `--cache-dir`. Consumer commands remain in bs-mobile's `.github/workflows/lattice-pages.yml`. Browser checks cover typed filter navigation, graph keyboard selection, matrix evidence, reversed snapshot comparison, directional/source disclosure and reloadable identifiers. These are browser/static-source checks, not game or device validation.

## Reviewed screens

| Source | Home | Explore | List | Views | Changes | Detail |
| --- | --- | --- | --- | --- | --- | --- |
| bs-mobile | [home](screens/l2/bs-home.png) | [explore](screens/l2/bs-explore.png) | [list](screens/l2/bs-list.png) | [views](screens/l2/bs-views.png) | [changes](screens/l2/bs-changes.png) | [detail](screens/l2/bs-detail.png) |
| Charter & Kin | [home](screens/l2/ck-home.png) | [explore](screens/l2/ck-explore.png) | [list](screens/l2/ck-list.png) | [views](screens/l2/ck-views.png) | [changes](screens/l2/ck-changes.png) | [detail](screens/l2/ck-detail.png) |
| Click (no lens) | [home](screens/l2/zero-home.png) | [explore](screens/l2/zero-explore.png) | [list](screens/l2/zero-list.png) | [views](screens/l2/zero-views.png) | [changes](screens/l2/zero-changes.png) | [detail](screens/l2/zero-detail.png) |
