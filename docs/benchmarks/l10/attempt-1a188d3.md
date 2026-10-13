# First L10 candidate: retained partial result

Candidate `1a188d33d325f25a2c25376b2b022a5143ccf0dd` (tree `e690a78788ae4da96517c5adb04ec60a3ef4fae1`). This is a failed intermediate measurement, not final L10 acceptance. Sources, questions and call samples were unchanged. Node25.8.2 on Apple M4 Max,14 logical CPUs,36GiB RAM; CI separately passed Node20/22/24. Generated-runtime fingerprint: `fab50eb3def24a8d219a95de9754c8f1509ac0f42deb1fe8ba9d760ad349ad33`.

The fixed call sample preserved50/50 exact edges and recovered24/32 exact oracle calls. Package dependency recall was100% on the four smaller nonempty oracles and4782/4859(98.42%) on source-resolved MSBuild declarations; this is not evaluated active MSBuild runtime truth. The large cold build took289.19seconds, within300seconds. Its export aborted with a default-heap OOM, so no large-site size, first-display or coverage acceptance can be claimed.

| Repository | Cold build s | Export bytes | Supported source files | Size gate | Warm MCP p95 ms |
| --- | ---: | ---: | ---: | --- | ---: |
| click | 1.23 | 3097949 | 91 | fail | 25.3 |
| excalidraw | 6.01 | 17347280 | 707 | pass | 41.7 |
| fzf | 1.13 | 2530552 | 90 | fail | 24.7 |
| nowinandroid | 1.85 | 3799829 | 350 | pass | 91.8 |
| ripgrep | 1.87 | 6589883 | 110 | fail | 28.0 |
| spring-petclinic | 0.40 | 1030791 | 50 | pass | 26.4 |
| fastify | 2.69 | 9235048 | 302 | fail | 27.7 |
| httpx | 0.79 | 2214888 | 60 | fail | 23.7 |
| unity-boatattack | 0.63 | 1579212 | 89 | pass | 34.5 |
| godot-demos | 0.92 | 3969936 | 497 | pass | 70.6 |
| sqlite | 1.42 | 3952635 | 102 | fail | 34.2 |
| runtime | 289.19 | unavailable: OOM | 33362 | fail | unavailable |

Every successful small export respected encoded/decoded256KiB pack caps. The denominator was independently inventoried supported tracked source files, including auxiliary code, not graph nodes; SQLite includes102 supported tooling files while C/C++ analysis remains unsupported. Six small exports exceeded the density limit despite substantial compression.

MCP used five preparation requests and thirty fully consumed and parsed sequential responses per small repository; all eleven measured p95s passed. The large first attempt encountered the dead writer lock left by the export crash. The exact lock and absent PID were recorded before removing that lock only. A separate retry then genuinely exhausted the default approximately4GB Node heap before its first response, after roughly44seconds. Neither attempt has warm samples; neither is counted as a performance pass.

The failed campaign, dead-lock evidence and retry remain separate. No heap-limit increase, scope reduction, source resampling or freshness bypass was used to turn these failures into passes. Follow-up work targets repeated detail payloads and graph-loading allocations. Final browser captures and the fresh36-run comparison remain pending.

Local evidence: `/tmp/l10-campaign/results-final/manifest.json`, `/tmp/l10-campaign/summary-final-1a188d3.json`, `/tmp/l10-campaign/mcp/attempt-1a188d3/summary-all.json`, and `/tmp/l10-campaign/mcp/attempt-1a188d3-runtime-retry/runtime/`. The directory name `results-final` is historical and does not indicate gate acceptance.

## Follow-up diagnostics before the next candidate

Uncommitted follow-up code is not a final candidate. Streaming source interning removed the default-heap preparation failure; strict observation overlap passed26 independent correctness cases, including ignored configuration creation/removal. Source-only five preparation plus thirty warm observations reached p95 955.254ms. The corresponding actual MCP run still failed: cold181.688s, warm median981.371ms, p95 1497.229ms, maximum8947.868ms. All thirty responses completed, no profiler was attached, and the runtime/source fingerprints were unchanged. These timings are distinct from the first candidate above. Evidence: `/tmp/l10-campaign/mcp/source-overlap-thirty.json` and `/tmp/l10-campaign/mcp/attempt-overlap-diagnostic/runtime/report.json`.

The current compact transport diagnostic reduced the110-source-file Rust sample to3,221,582bytes, still above its2,750,000byte limit. An independent review found that an embedded-JSON string optimization could reorder literal string contents. The producer optimization was removed; exact strings and canonical graph hashes now pass32 focused checks. The corrected sample size is unchanged. Compression and canonical sharing work continues; none of these intermediate results grants final acceptance.

A subsequent combined-asset diagnostic preserved native module behavior while grouping the viewer JavaScript into three bounded gzip archives. With level9 data-pack compression, the same Rust sample measured2,733,408bytes, below2,750,000bytes by16,592bytes. Its export took3.087seconds; this is diagnostic, not paired final timing. The earlier level6 combined export measured2,846,951bytes and remains retained. Four archive regressions, fifteen HTTP browser scenarios, ten live-generation checks and installed-package smoke passed. Strict self-only script CSP fails visibly: compressed modules require an allowed import map and Blob modules; no supplied policy is modified. Final corpus density and first-display gates remain pending. Evidence: `/tmp/l10-assets-gzip9-ripgrep-export.json`, `/tmp/l10-assets-live-tests.log`, `/tmp/l10-assets-package-smoke.log`, and `/tmp/l10-asset-independent/`.

The core-interning plus initial snapshot-order variant completed without OOM but regressed preparation: cold380,255.285ms, warm median1,025.611ms, p951,550.570ms, maximum1,587.789ms. All thirty responses completed without errors and implementation/source fingerprints were unchanged. It did not improve the one-second gate and doubled cold preparation against the previous streaming/overlap path. The core interning and initial-order experiment was therefore rejected; its evidence is retained under `/tmp/l10-campaign/mcp/attempt-cold-order-diagnostic/`. The stable candidate keeps streaming read interning and strict source-observation improvements. Final MCP measurement remains required; this decision does not turn the earlier1,497.229ms failure into a pass.
