# Lattice v0 acceptance ledger

Statuses: **designed** means a reviewed contract exists, not implementation; **pending** means missing evidence; **verified** requires exact source/build/command or live artifact evidence. L0 docs CI cannot pass L1–L5. The [brief](../design/brief-v0.1.md) remains authoritative. All product rows are pending at bootstrap.

| ID | Milestone / requirement | Authoritative proof required | Status |
| --- | --- | --- | --- |
| L0-01 | Full brief, model, adapters, references, lens, storage | Design + original brief hash + review PR | designed |
| L0-02 | Viewer wireframes + neutral tokens before code | viewer.md + DESIGN.md commit predating implementation | designed |
| L0-03 | Determinism / core-domain separation / evidence ADRs | ADR 0001–0004 and review | designed |
| L1-01 | Strict TypeScript, Node LTS, npm package | clean install/build/typecheck/format/test CI + installed package CLI | pending |
| L1-02 | JSON/YAML/CSV records with source lines | quoted multiline/array/duplicate-key/malformed fixtures, real builds | pending |
| L1-03 | Markdown headings/links/ADRs | [Existing 12 fixtures, real docs, installed CLI and browser](l1-markdown.md) | verified |
| L1-04 | Optional Graft import + own file/module fallback | validated real sample; missing/malformed schema fixture | pending |
| L1-05 | Git metadata and reference auto-join | alias collisions/missing IDs/add/delete/source-pointer assertions | pending |
| L1-06 | Lens schema, kinds, fields, edges, facet expressions | valid/invalid lens integration tests, zero domain branches | pending |
| L1-07 | Views/findings/gates/code-link rules | non-game rules + unsupported/unknown/real dispatch fixtures | pending |
| L1-08 | init skeleton, idempotence | real CLI temp-repo invocation and unchanged unrelated files | pending |
| L1-09 | Incremental build / content hashes | parse/reuse counters plus add/edit/delete/rename/lens/code changes | pending |
| L1-10 | check exit status | real CLI pass=0/fail=1/unknown gate=1/config error=2 | verified: [installed CLI scenario](l1-check.md) |
| L1-11 | diff nodes/edges/facets/findings incl changes | real two-commit repo, before/after and dirty worktree preservation | verified: [installed historical comparison](l1-history.md) |
| L1-12 | Static export + graph / serve watch | package-installed CLI, static HTTP load, source change refresh, SIGINT cleanup | pending |
| L2-01 | Home counts, freshness, automatic findings + lens facets | real three-repository screens with meaningful data | pending |
| L2-02 | Graph kinds/neighbors/path/facets/hubs | browser inputs and asserted matching graph results | pending |
| L2-03 | List inferred/configured columns search/sort/filter/intent | browser checks and source-linked comparison | pending |
| L2-04 | Auto matrix + distribution; four generic lens view types | browser matrix drill-down/cycle/distribution/table | pending |
| L2-05 | History list/two snapshot compare/facet trend/finding changes | actual historical exports, live selectors and added/resolved violations | pending |
| L2-06 | Node properties/source/edges/history/facets/findings | browser deep-link reload incl non-ASCII IDs | pending |
| L2-07 | Stable node/view/diff URLs + MCP-ready links | static Pages reload and route identity assertions | pending |
| L2-08 | Thousands of nodes aggregate → expand | 5,000-node browser QA with counted clusters and responsive controls | pending |
| L2-09 | Neutral theme/mobile/keyboard/color-vision access | light/dark, 375/768/1280 screenshots + contrast and keyboard checks | pending |
| L2-10 | Three repositories × six screenshots attached to PR | 18 route-indexed real screenshots + interaction evidence | pending |
| L2-11 | bs-mobile Pages URL reported FIRST when L2 ends | consumer PR merge + successful deployment + HTTP/browser verification | pending |
| L3-01 | stdio MCP lifecycle and freshness before every tool | protocol client + changed-input rebuild on all 8 tools, stdout purity | pending |
| L3-02 | overview/find/node/trace | typed results/filter/path/impact/source/link parity with exported graph | pending |
| L3-03 | matrix/findings/diff/freshness | query parity/gates/history/current fingerprint and stale handling | pending |
| L3-04 | init AGENTS + Claude skill + MCP JSON + Codex | coexistence with Graft, invalid-config atomicity, repeated init byte equality | pending |
| L3-05 | --no-global + workflow skill instructions | home sentinel unchanged; before-work overview and after-work diff instructions | pending |
| L4-01 | Reusable lattice-action build/check/export | external consumer workflow run from pinned release | pending |
| L4-02 | Default-branch Pages publication | deployment URL at exact source SHA and direct browser read | pending |
| L4-03 | PR system-diff comment | real PR marker comment with graph differences, update idempotence | pending |
| L4-04 | Pages unavailable artifact + documented limitation | tested artifact fallback; fork-token limitation and safe permissions | pending |
| L5-01 | bs-mobile 216/77/20 | actual YAML-lens graph assertions and per-ID oracle comparison | pending |
| L5-02 | Items 24/30; forms 4; boss 1; sinks 10/10 all 4 | lens metrics at prototype source commit, source evidence and labels | pending |
| L5-03 | All 8 findings, classifications and intent comparisons | actual YAML rules, rendered text, metrics/targets/provenance match | pending |
| L5-04 | Code handler support beyond prototype | positive/negative/comment-only/alternate-path tests at actual source | pending |
| L5-05 | bs-mobile PR lens + Action + Pages (D1 replacement) | merged PR, CI and live URL | pending |
| L5-06 | Charter & Kin minimal example, strictly read-only | real source graph + external cache/output + unchanged git status | pending |
| L5-07 | Lensless public non-game repo, core unchanged | actual repository source SHA + useful screens/graph, same tool binary | pending |
| L5-08 | bs full build ≤10s / unchanged freshness ≤50ms / MCP ≤1s | repeated timed runs with mode/hardware/Node/source/file count | pending |
| L5-09 | Same commit two independent builds same hash | cold-cache commands and actual identical semantic graph hashes | pending |
| L5-10 | Claude Code tool list and stat-only-items/intent query | real client transcript with exact tool names, answers and hashes | pending |
| L5-11 | Codex tool list and same query | real client transcript; protocol harness alone insufficient | pending |
| INV-01 | No Graft code copy / no domain-aware core / no LLM stage | diff/source review and package dependency inspection | pending |
| INV-02 | No data editor, hosted auth, multiuser scope | scope review and shipped surface | pending |
| INV-03 | bs-mobile PR-only / Charter & Kin no commits | remote PR/history + before/after read-only checkout checks | pending |
| REPORT | L0–L5 ≤10-line summaries + commit/PR/CI | linked milestone reports | pending |

## Milestone evidence

L0: repository created and cloned; design/reference artifacts prepared. Independent design review passed; local documentation and negative checks passed. [Remote L0 CI passed](https://github.com/hyunlord/lattice/actions/runs/37972697599) and [PR #4 merged](https://github.com/hyunlord/lattice/pull/4). See [L0 evidence](l0.md). Product CLI, viewer, Pages, MCP, Action, performance and agent acceptance have **not** run.

L1 foundation: typed model, canonical graph construction and npm library packaging now have local Node24 evidence in [the slice report](l1-foundation.md). This does not fulfill the full L1 CLI or any later gate; those rows remain pending.

L1 JSON/CSV slice: strict source-aware parsing and deterministic reference resolution have [library and actual read-only source evidence](l1-data-extraction.md). YAML, full repository discovery, lens classifications and CLI remain pending; no acceptance row is upgraded by this partial slice.

The user approved a [thin first publication](first-published-map.md) before broader adapters/screens. Home/list/detail and build/export are [published](https://hyunlord.github.io/bs-mobile/) via [consumer PR139](https://github.com/hyunlord/bs-mobile/pull/139); full milestone rows remain pending until their complete contracts are proven.

L1 document integration: [Markdown extraction and zero-config CLI evidence](l1-markdown.md) verifies L1-03. Other L1 rows remain pending.

L1 module integration: [own-module extraction and CLI evidence](l1-modules.md) supplies static JS/TS/Python dependencies and other-language file nodes. L1-04 remains pending until validated Graft import is implemented.

## Open decisions and risks

- MIT license approved by the user on 2026-10-10; [decision issue #3](https://github.com/hyunlord/lattice/issues/3) is resolved by the first published-map change.
- Prototype 4 base forms / 20 unique classifications must coexist with 10 effective profile forms / 16 unique effective projections. See [source audit](../reference/bs-mobile-oracle.md).
- A documented Graft JSON schema has not yet been verified; importer cannot guess it.
- The 50ms freshness target is not proven, especially cold strict content checks. Correctness is required even if the performance gate fails.
- L2 needs early consumer Pages plumbing before the L4 reusable Action; [ADR 0004](../adr/0004-delivery-and-permissions.md) sequences this without declaring L4 early.
