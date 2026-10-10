# L5 performance investigation

Status: partial. This report records an improvement, not completion of L5. [Issue 46](https://github.com/hyunlord/lattice/issues/46) remains open while any requested timing or final acceptance evidence is missing.

## Method

Measurements use Node 24.21.0 on macOS Darwin 27 arm64, Apple M4 Max (14 cores, 38,654,705,664 bytes memory). Each build starts with a distinct empty external cache. The MCP process starts with another empty cache, receives its first query, twenty unchanged freshness queries and three calls to each of the eight tools. Every timing includes the actual response; the first query's rebuild is not excluded. Coordinated builds and tests are paused during measurement. Unrelated desktop processes can still run; later cases preserve host samples outside timed spans and do not claim an idle machine. Timings are machine observations, not a platform-wide guarantee.

The original consumer is clean bs-mobile `7aebd2e9046c4926d14fcb2d6f597dd02c5744f8`, with JSON lens digest `db8fb8c1d892535918202f8889c750aee83b02ae30d26d8d83e5646db41071bc`. It has 443 nodes, 800 edges, 1,140 facets and 22 findings. Baseline tool `7d45e88ce9a2546c915f1261cf473ce86998736e` takes 13.174–13.353 seconds for three cold builds, 13.305 seconds for the first MCP query, 353 ms p95 for unchanged freshness, and 41.597–45.496 seconds for warm HEAD comparison.

## Changes and evidence boundaries

Canonical JSON, source projection and cloning reuse repeated object identities within one operation. They retain cycle/depth checks, detached frozen graphs, full provenance and exact semantic comparisons even with a custom digest that collides. Ordinary provenance paths use iteration while wildcard evidence remains distinct.

Repository observations overlap independent Git queries, reuse parsing only for identical lens bytes and paths, and read/hash each unique input once per observation. The next observation reads every input again. Full artifact bytes are hashed concurrently; file timestamps and sizes are never substitutes for content. Historical blobs use bounded batch size checks before reading. Historical build reuse requires an exact observed fingerprint.

Storage retains atomic writes and complete-byte validation. It reuses serialization of immutable graph fields and avoids repeated UTF-8 encoding. Snapshot metadata does not require rebuilding an unchanged graph. Identity-based diff shortcuts never trust digest equality alone.

The initial optimization checkpoint passed strict TypeScript, formatting, 151 tests and documentation validation. Independent reviews found no blocking semantic, provenance, scope or dependency issues. The complete optimized baseline graph, including source/repository metadata and snapshots, equals the original graph; its hash remains `76253be0d1545f2c7467849e25792212f0bd2d33e1b1381d3600fe89365d1c48`.

A faster direct macOS Git binary was investigated but rejected: `/usr/bin/git` also establishes SDK-related environment variables. Bypassing that shim would change subprocess semantics. Reported measurements retain the selected Git command and environment.

## Recorded measurements

[The machine-readable record](evidence/l5-performance.json) pins compiled module bytes and source/lens identities for each case. The expanded YAML consumer is commit `6a0fb5b7ad5af6cd4244b34cc6053fcdb0dd5287`. Its local optional Graft input is 2,271,865 bytes and is absent from HEAD; therefore that comparison must process genuinely different input fingerprints. The separate CI-equivalent checkout has no optional Graft input. Both conditions are retained rather than treating one as a replacement for the other.

| Case | Cold build maximum | First cold MCP | Unchanged freshness p95 / maximum | Warm HEAD diff maximum |
| --- | --- | --- | --- | --- |
| Original JSON lens | 2.075 s | 1.982 s | 47.52 / 49.18 ms | 0.692 s |
| Expanded YAML, local Graft | 2.895 s | 2.842 s | 56.99 / 63.69 ms | 4.145 s |
| Expanded YAML, CI-equivalent | 2.839 s | 2.739 s | 51.53 / 55.51 ms | 1.084 s |

All 45 tool calls succeed in each case and all three builds in each case have the same graph hash. Expanded YAML has 449 nodes, 1,013 edges, 2,030 facets, 25 findings and five views. Its five graph collections agree between optional-Graft and CI-equivalent cases after accounting for observation provenance. Cold builds pass the ten-second requirement. The first MCP response remains above one second; expanded YAML also exceeds the freshness and diff thresholds. These are failures, not waived gates.

## Remaining acceptance

Final timing evidence and the installed package run accompany this change. A passing cold build does not waive the first MCP response requirement. Final consumer publication, the same installed artifact on three repositories, and actual Claude Code/Codex discovery and query records are separate L5 checks. Earlier milestone reports remain historical evidence.

## Facet-provenance candidate follow-up

[PR48](https://github.com/hyunlord/lattice/pull/48), merged as `0a20ebe`, corrects generic facet provenance. Package SHA-256 `40b1c2ea543c13a9af6ae95ab70a9c7003b0f01c95e6ae236cb5862d72477ba2` was independently installed and measured on clean consumer `1ea90743f2d2cfa47135b426d1278dd8a791adf6`, with no optional Graft directory or input. This is a verified intermediate candidate; subsequent rule-provenance work is not covered by these measurements.

Three empty-cache builds took at most **2.392s**, with identical hashes. The first empty-cache MCP request took **2.280s**, exceeding one second. Twenty unchanged freshness calls reached **51.69ms p95 / 52.34ms maximum**, exceeding50ms. Three calls to each warm tool all passed, including HEAD diff at **0.574s maximum**; all45 tool calls succeeded. The aggregate MCP gate still fails because the cold request is included. Graph hash is `9aa9921ceefcbf593a97fef836bdf442f0b807a88ba4038e80a666d0fd2f5ce1`.

The new `facet-provenance-candidate-ci` case is appended to the machine-readable record. Earlier failures and the distinct optional-Graft condition remain intact. These observations establish improvement and remaining failures, not L5 completion.

## Rule-provenance candidate follow-up

[PR49](https://github.com/hyunlord/lattice/pull/49), merged as `d8a689`, further corrects generic rule provenance. Its installed package SHA-256 is `89a188a741c8d83960eba19e202c11376312879ef5be4f342e638bac92b0a765`. The same measurement protocol ran against clean source `3363bb1aaf4ae11c25a6889d457bdf1477914b6e`, with no optional Graft input, Node24.21.0 and the recorded Apple M4 Max environment.

Three independent builds reached **2.148s maximum** and retained equal hashes. The first cold MCP call took **2.047s**, still failing one second. Twenty unchanged freshness calls reached **47.93ms p95 / 50.423ms maximum**; the maximum still fails50ms, despite the passing p95. All eight warm tools passed, with HEAD diff **0.524s maximum**. All45 calls succeeded. Graph hash is `1ed8ce8c513d61e05689aa83d2ff7ca40d21d7a855de7d7efce64d44887d5413`.

The appended `rule-provenance-candidate-ci` case preserves all earlier observations. Performance and L5 remain incomplete; public consumer/browser and real-client records for this candidate are separate evidence, not inferred from successful timings or older artifacts.

## Linked-item lens controlled projection

[bs-mobile issue164](https://github.com/hyunlord/bs-mobile/issues/164) and [PR165](https://github.com/hyunlord/bs-mobile/pull/165) replace the linked-item facet's whole-edge scan with the original designed item link lists. The layer, kind, target identity, universal-item exclusion and unique source-item semantics remain the same. The domain rule stays in the consumer lens; generic provenance is not discarded. Both expressions agree on all449 current and436 historical nodes, and the current full graph agrees on all non-source values after excluding graph identity/lens/snapshot metadata. Every applicable predicate and link-list read retains its field or original-record span.

The controlled pair uses the same installed `d8a689` package, clean consumer `c162509897333940d7a8124d58b1be75963c35d4`, Node24.21.0 and the hardware/protocol above, with no optional Graft input. Both lenses are external projections. The source checkout remains clean before and after each run, preserving immutable source links equally. This avoids mistaking dirty-source URL removal for a lens improvement. Lens hashes, graph identities, full warm-tool summaries and all failed gates are appended to [the evidence record](evidence/l5-performance.json).

| Clean-source external projection | Graph bytes | Cold build maximum | First cold MCP | Unchanged freshness p95 / maximum | Warm HEAD diff maximum |
| --- | --- | --- | --- | --- | --- |
| Original linked-item expression | 55,786,248 | 2.136 s | 2.044 s | 49.085 / 51.126 ms | 0.506 s |
| Direct item-link expression | 47,205,555 | 1.938 s | 1.834 s | 48.038 / 48.569 ms | 0.462 s |

Both runs retain deterministic builds and all45 successful tool calls. The candidate passes the recorded freshness maximum and reduces graph bytes by15.38%; **cold MCP still fails one second**. These are controlled projections, not final published-consumer acceptance. The subsequent published-source run below records PR165 CI, publication, browser and performance separately. L5-08 and the overall milestone report remain incomplete; all earlier failures are retained.

## Published linked-item lens follow-up

[PR165](https://github.com/hyunlord/bs-mobile/pull/165) merged as `03c5f22f528ad005f6367b66ba0878c95ae142fb` after [full CI38018070629](https://github.com/hyunlord/bs-mobile/actions/runs/38018070629) and [map CI38018070918](https://github.com/hyunlord/bs-mobile/actions/runs/38018070918) passed. [Pages deployment38018970891](https://github.com/hyunlord/bs-mobile/actions/runs/38018970891) succeeded. This run uses the actual default repository lens on that clean merged source, with no optional Graft input, and the same installed `d8a689` package89a188a7. Later Lattice main `8709844` is not the tool measured or published here.

Three empty-cache builds reached **1.970s maximum**. The first cold MCP request took **1.828s**, still failing one second. Twenty unchanged freshness calls reached **48.004ms p95 / 53.439ms maximum**; the maximum fails50ms. The controlled external projection's passing maximum does not supersede this failure. All45 tool calls succeeded; all eight warm tools passed, including HEAD diff at **0.489s maximum**. Build determinism passed.

The public browser and local performance graph match exactly at `3c5e5e544e9d1b3e8e3e66660e549cb4f764143b8c35261ecbb44646aecf23b1`. Browser verification passed22 route/width cases and8 interaction groups with zero errors or overflow, including historical comparison and reload. [Compact evidence](evidence/l5-performance.json) appends this actual default-lens case, publication links and the premerge ADR scan. Earlier external projections, actual-client observations and all timing failures remain historical evidence. L5-08 and REPORT remain pending; cold MCP and maximum freshness are not waived.

## Installed PR53–PR57 follow-up

[PR53](https://github.com/hyunlord/lattice/pull/53), [PR54](https://github.com/hyunlord/lattice/pull/54), [PR55](https://github.com/hyunlord/lattice/pull/55) and [PR56](https://github.com/hyunlord/lattice/pull/56) were measured as independent installed packages on clean `03c5f22`, using its default lens without optional Graft input. Exact candidate commits, package/compiled digests, all eight tool summaries and failed gates are appended to [the evidence record](evidence/l5-performance.json). Each case retains three empty-cache builds and all 45 successful tool calls; no passing warm result waives the first cold call.

| Installed candidate / condition | Build maximum | First cold MCP | Freshness maximum | HEAD diff maximum |
| --- | --- | --- | --- | --- |
| PR53 validation traversal | 1.988 s | 1.921 s | 47.082 ms | 0.502 s |
| PR54 buffers, external tests/Graft active | 1.882 s | 1.762 s | 60.009 ms | 2.921 s |
| PR54 separate case, later transfer activity | 1.969 s | 1.914 s | 49.383 ms | 0.356 s |
| PR55 query probe | 1.572 s | 1.442 s | 43.269 ms | 0.347 s |
| PR56 glob cache | 4.464 s | 1.404 s | 45.562 ms | 0.272 s |

PR53 includes PR51 provenance changes relative to published `d8a689`; its hash difference is not merely metadata. The five non-source collections remain equal, while PR54–PR56 retain the exact PR53 graph `c4fa05cc00a6fdc5b0d11099b6e612868463f28c857b65add5156954223c7393`. The PR54 second directory's `idle` name describes an intended condition only: new rsync/ssh/Tailscale activity appeared. PR56 also captured unrelated Node activity. These observations remain recorded without attributing timing changes to a single cause or discarding busy failures.

A separate direct-correspondence lens pair used the same PR56 package and clean `03c5f22`, with explicit external copies both named `lens.yaml`. It reduced graph bytes from 47,154,025 to 28,800,020. Baseline/candidate cold MCP was 1.477/1.312s, freshness maximum 48.509/82.832ms and diff maximum 1.886/1.496s. Both are projections, not published default-lens acceptance; candidate TypeScript/Node contention was observed. Both failed the aggregate MCP gate. The rejected encoder experiment was not included in these installed candidates.

## Final PR174 publication and retained failures

[bs-mobile PR174](https://github.com/hyunlord/bs-mobile/pull/174) merged as `8bf662918b57d4bff95707c2fd55fc2933ace195`. The measured installed [PR57](https://github.com/hyunlord/lattice/pull/57) candidate is `a334b026e91120c1aaa2fc649a0141d908476c6d`, merged into Lattice as `c5f026c`. Package SHA-256 is `e165b5cdf9493b70a0019871458ae52a60c1d6cc1b6a6bb4ce4aa8e993ef5aec`; compiled aggregate is `1c66fb380f924d6296c17493e69ddc1787513a8d5d28427f95d030f58a395036`. The default lens digest is `f88b7eef3b298fb7af244be97b1c0995571c22762ea9abdb221712422e8ecee4`. This source includes PR172 content changes, so older graph counts are not a same-source comparison.

The first final-source run was Git-clean but contained ignored optional Graft wiring. Its failure remains a distinct augmented-input case. A fresh detached checkout then established CI-equivalent input provenance, asserting optional Graft absence before/after each build and after MCP. This was a separate input condition, not a replacement of failed evidence.

| Final default-lens input condition | Build maximum | First cold MCP | Freshness p95 / maximum | HEAD diff maximum |
| --- | --- | --- | --- | --- |
| Ignored optional Graft wiring present | 1.757 s | 1.631 s | 50.805 / 50.809 ms | 2.113 s |
| Pristine, optional Graft absent | 1.906 s | **1.831 s FAIL** | **329.427 / 348.760 ms FAIL** | 0.576 s |

Both cases retain45 successful calls, three equal build hashes, exit code 0 and empty MCP stderr. Both observed 233 checked inputs; the graph input manifests contain 225 versus 224 entries, differing by optional wiring. Their graph sizes are 62,488,672 versus 62,488,040 bytes, with 516 nodes, 1,503 edges, 2,065 facets, 27 findings and 7 views. The pristine slow warm calls spend most time observing inputs without rebuilding. A later instrumented diagnostic observed a 44.6 ms warm response and did not reproduce the slowdown; it is not an acceptance rerun or a passing replacement case. The cause is unproven; host mediaanalysis/Unity/clawdbot activity does not establish causality. Cold build passes ten seconds, but **cold MCP and maximum unchanged freshness still fail**. L5-08 and REPORT remain pending under [issue46](https://github.com/hyunlord/lattice/issues/46).

[Pages deployment attempt 2](https://github.com/hyunlord/bs-mobile/actions/runs/38024501827/attempts/2) succeeded. Attempt 1's HTTP 403 is retained as an unexplained publication failure; the same code/settings succeeded on retry. The [public map](https://hyunlord.github.io/bs-mobile/) and pristine measurement have exact graph hash `0b7c27c5a87966160dd636ea1bf512c49bbaae36eef96066ef57483a00e2a9f2` and source commit `8bf662918b57d4bff95707c2fd55fc2933ace195`. The pristine measurement records source fingerprint `9fcdcbc5fa04393ce69640f62553ac45ab26b7ad094dd175899ab4811fad4a14`. Public browser evidence covers 22 route/width cases, 31 matching graph responses and 24 byte-identical assets, with no browser errors or overflow; current/history and upstream primitive-support checks pass. Long object-valued facet distributions remain a readability limitation.

The same installed package also passes Charter & Kin and Click build/check/export plus home/list/detail browser checks, with unchanged sources and exact equality of all five graph collections including provenance against their earlier graphs. These bounded reruns establish three-repository artifact portability, not new gameplay or Python runtime execution evidence. Actual Claude Code 2.1.280 and Codex 0.162.0 each discover all 8 tools; their 3 and 6 recorded calls respectively succeed on the final public graph, retaining the exact authored interpretation and 24/30 item statistic. Codex's repeated sequence is preserved. These scenarios invoke overview/find/findings only; functional client success does not supersede the strict performance failures.
