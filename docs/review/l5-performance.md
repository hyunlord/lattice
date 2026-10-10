# L5 performance investigation

Status: partial. This report records an improvement, not completion of L5. [Issue 46](https://github.com/hyunlord/lattice/issues/46) remains open while any requested timing or final acceptance evidence is missing.

## Method

Measurements use Node 24.21.0 on macOS Darwin 27 arm64, Apple M4 Max (14 cores, 38,654,705,664 bytes memory). Each build starts with a distinct empty external cache. The MCP process starts with another empty cache, receives its first query, twenty unchanged freshness queries and three calls to each of the eight tools. Every timing includes the actual response; the first query's rebuild is not excluded. Other builds and tests are stopped during measurement. Timings are machine observations, not a platform-wide guarantee.

The original consumer is clean bs-mobile `7aebd2e9046c4926d14fcb2d6f597dd02c5744f8`, with JSON lens digest `db8fb8c1d892535918202f8889c750aee83b02ae30d26d8d83e5646db41071bc`. It has 443 nodes, 800 edges, 1,140 facets and 22 findings. Baseline tool `7d45e88ce9a2546c915f1261cf473ce86998736e` takes 13.174–13.353 seconds for three cold builds, 13.305 seconds for the first MCP query, 353 ms p95 for unchanged freshness, and 41.597–45.496 seconds for warm HEAD comparison.

## Changes and evidence boundaries

Canonical JSON, source projection and cloning reuse repeated object identities within one operation. They retain cycle/depth checks, detached frozen graphs, full provenance and exact semantic comparisons even with a custom digest that collides. Ordinary provenance paths use iteration while wildcard evidence remains distinct.

Repository observations overlap independent Git queries, reuse parsing only for identical lens bytes and paths, and read/hash each unique input once per observation. The next observation reads every input again. Full artifact bytes are hashed concurrently; file timestamps and sizes are never substitutes for content. Historical blobs use bounded batch size checks before reading. Historical build reuse requires an exact observed fingerprint.

Storage retains atomic writes and complete-byte validation. It reuses serialization of immutable graph fields and avoids repeated UTF-8 encoding. Snapshot metadata does not require rebuilding an unchanged graph. Identity-based diff shortcuts never trust digest equality alone.

The full check passes strict TypeScript, formatting, 151 tests and documentation validation. Independent reviews found no blocking semantic, provenance, scope or dependency issues. The complete optimized baseline graph, including source/repository metadata and snapshots, equals the original graph; its hash remains `76253be0d1545f2c7467849e25792212f0bd2d33e1b1381d3600fe89365d1c48`.

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
