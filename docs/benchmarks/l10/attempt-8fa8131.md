# L10 candidate8fa8131: retained failed large export

Candidate `8fa8131eeb9f6bf9d7dbbc1ca5f750218203c1c0`, Node25.8.2, Apple M4 Max,14 logical CPUs,36GiB RAM. The formal large cold build was terminated at300.099seconds under the unchanged300-second gate. A separate, clearly supplemental900-second operational run produced a305.72-second build and then default-heap export OOM after258.23seconds. Neither is a passing large result; no heap override or source resampling was used.

All eleven smaller exports had byte-identical totals in the formal and supplemental runs. They passed their independent supported-source density limits and the encoded/decoded256KiB limits, including viewer JavaScript archives.

| Repository | Export bytes | Supported source files |
| --- | ---: | ---: |
| click | 1312566 | 91 |
| excalidraw | 6744228 | 707 |
| fzf | 1125202 | 90 |
| nowinandroid | 1576625 | 350 |
| ripgrep | 2733266 | 110 |
| spring-petclinic | 458605 | 50 |
| fastify | 3686892 | 302 |
| httpx | 947304 | 60 |
| unity-boatattack | 717864 | 89 |
| godot-demos | 1630640 | 497 |
| sqlite | 1685474 | 102 |

The unchanged call samples yielded exact precision50/50 and recall24/32. CI passed Node20/22/24,669 tests, typecheck, formatting, benchmark/doc guards, installed-package smoke and the artifact workflow. These successes do not establish the still-pending final MCP, browser or fresh36-arm gates.

## Subsequent isolated memory diagnosis

The failed export had completed43,662 detail documents and258 logic documents, but no overview. Passing structured overview values directly to the pack writer avoids a whole-model stringify/parse round trip while streaming the same content hash. Independent25-test coverage and272 reconstructed documents matched legacy output, including bindings and optional fields.

An instrumented, default-heap diagnostic using the same complete cache passed the former failure point: overview completed at279.08seconds and full graph at306.44seconds. It then exhausted the heap during snapshot reading at330.80seconds, RSS4,653,334,528bytes. Roughly11.8million canonical records remained indexed at that point. This diagnostic identifies a later retained-index pressure problem; it is not a successful export or a formal timing result. The next correction is restricted to exact full-digest indexing, preserving every reference and output value.

Local evidence: `/tmp/l10-campaign/results-8fa8131/manifest.json`, `/tmp/l10-campaign/results-8fa8131-supplemental900/manifest.json`, `/tmp/l10-campaign/summary-8fa8131-supplemental900.json`, `/tmp/l10-overview-fix-runtime.log`. Original failure logs and source/candidate fingerprints remain retained.

The follow-up observation change caches only canonical input-list serialization after source witnesses have been refreshed. It retains identity, order, path and hash checks and all final freshness barriers. Thirty-one focused tests plus an independent28-test review and100 legacy-hash comparisons passed. This is correctness evidence only; the prior warm MCP p951497.229ms failure remains authoritative until a separately recorded candidate measurement.

The compact full-digest index passed an independent Map-based producer comparison: all269 pack/index/manifest files were byte-identical. Two independent index tests covered growth, copied keys, full-digest collision resolution and safe integer references, including one million keys under a64MiB JavaScript heap. This bounded correctness/stress result does not establish total-process memory or the large export gate.

The subsequent instrumented default-heap export completed488.58seconds with maximum RSS5,187,190,784bytes and peak footprint5,283,762,384bytes. Snapshot loading, snapshot details/full graph and final pack integrity validation completed. Published logical size was278,853,321bytes in14,210files; largest file98,857bytes. Graph hash remained `629f31ec3b1fb75cfb4deff28c578fb5983f196045d97f68f84ce6e9eb9732a1`. This is a successful memory diagnostic using the existing complete cache, not an uninstrumented cold-build or final candidate measurement. Evidence: `/tmp/l10-digest-index-runtime.log`, `/tmp/l10-digest-index-runtime-size.json`.

The derived-fingerprint follow-up MCP diagnostic completed all thirty responses without errors: cold206,073.814ms, warm median900.558ms, p951,280.203ms and maximum1,319.869ms. It still fails the1,000ms gate. Source and generated-code fingerprints were unchanged during measurement. The graph/source identity matches the earlier observation diagnostic, but the corrected executable-ranking policy selects a different first function, and this run uses the complete supplemental cache; this is not an isolated identical-request A/B comparison. Response outliers were within about2ms of their observation duration. Evidence: `/tmp/l10-campaign/mcp/attempt-fingerprint-diagnostic/runtime/report.json`.
