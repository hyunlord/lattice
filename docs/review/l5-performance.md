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
