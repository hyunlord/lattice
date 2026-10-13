# L11 frozen-candidate evaluation

Status: 36/36 trials persisted; 36/36 independently graded. Accuracy gate: **fail**. Primary aggregate time gate: **unavailable-incomplete-coordinator-timing**.

Candidate analysis: **2b7c00f**; frozen registration: **44f735a**. Later release fixes were not applied to these exports or answers. Each arm has a maximum 360 points. Direct score: **324/360**; map score: **318/360**.

The map arm scored -6 points relative to direct GitHub (88.33% versus 90.00%). The frozen accuracy threshold was not relaxed. The accuracy gate failed. The supplemental timing bounds also miss the 50% target across the entire interval. These observations do not support declaring the combined usability goal achieved. They apply to the frozen candidate and this single agent trial per cell; later release fixes are outside this study.

| Repository | Direct score | Map score | Direct seconds | Map seconds | Map export |
| --- | ---: | ---: | --- | --- | --- |
| click | 16/20 | 18/20 | 300 self-report only | 291.2–310.0 | ready |
| excalidraw | 17/20 | 19/20 | 263.1–286.5 | 278.9–293.9 | ready |
| fzf | 20/20 | 17/20 | 198.4–238.0 | 331.4–345.2 | ready |
| nowinandroid | 18/20 | 17/20 | 256.8–268.3 | 326.1–343.6 | ready |
| ripgrep | 20/20 | 15/20 | 269.9–309.7 | 250.3–263.4 | ready |
| spring-petclinic | 16/20 | 17/20 | 172.8–186.9 | 209.1–224.1 | ready |
| fastify | 19/20 | 18/20 | 173.5–197.2 | 266.3–278.8 | ready |
| httpx | 17/20 | 16/20 | 227.6–237.7 | 226.8–241.6 | ready |
| unity-boatattack | 15/20 | 17/20 | 244.2–266.3 | 222.8–239.2 | ready |
| godot-demos | 20/20 | 20/20 | 142.7–156.5 | 172.2–185.8 | ready |
| sqlite | 18/20 | 18/20 | 225.0–240.1 | 217.3–234.4 | ready |
| runtime | 19/20 | 17/20 | 285.3–303.4 | 341.2–353.6 | full-export-unavailable |
| starlette | 19/20 | 18/20 | 240.4–252.5 | 262.1–280.9 | ready |
| axum | 19/20 | 18/20 | 228.3–241.8 | 251.2–264.1 | ready |
| chi | 19/20 | 18/20 | 196.5–208.4 | 166.3–178.6 | ready |
| swift-argument-parser | 18/20 | 20/20 | 146.6–161.6 | 186.4–199.3 | ready |
| dapper | 19/20 | 18/20 | 191.8–202.2 | 219.7–234.7 | ready |
| vitest | 15/20 | 17/20 | 358.3–370.8 | 277.1–290.7 | ready |

Timing values are host-monotonic delivery-to-answer-persistence bounds. Lower/upper endpoints bracket dispatch uncertainty; waits and real tool queries are included. The original Click direct trial lacks coordinator timing and retains its 300-second self-report. It was neither replaced nor dropped. Thus the strict preregistered 18-repository primary time aggregate cannot be established.

Supplemental 18-repository aggregate, substituting Click's unverified 300-second self-report: direct 4121.3–4427.7s; map 4496.3–4761.9s; map/direct ratio 1.015–1.155. This is not an authoritative primary timing result.

Coordinator-only paired subset: 17 repositories; direct 3821.3–4127.7s; map 4205.0–4452.0s; map/direct ratio 1.019–1.165. This subset does not replace the full cohort or change its 50% threshold.

## Conditions and limitations

- Eighteen pinned public repositories, identical ten frozen questions per repository, rotated within-repository arm order, one fresh context per cell, 600-second task cap, no retakes. This is an agent evaluation, not a human usability study.
- Evaluators inherited the session default model and reasoning. Authoritative exact model/reasoning metadata and token telemetry were unavailable; no token estimates were invented.
- Both arms used pinned public GitHub web tree/blob/raw access. Direct evaluators could not read local sources or maps. Map evaluators additionally accessed actual exported maps and a bounded read-only wrapper around real stdio MCP. Whole-agent access restrictions were instructional; wrapper restrictions were enforced in transport.
- Seventeen complete maps were prepared outside timed tasks. Cold setup and MCP prewarm logs are retained separately. At most two prepared MCP sessions and active map trials were permitted; coordinator policy prohibited eviction during active trials.
- Historical session-close requests were not written to the transport event log. The coordinator reports closing sessions only after each trial; independent logs can verify active trial intervals and prewarm/query events, but cannot independently reconstruct every close or eviction. Final infrastructure termination is recorded separately.
- Runtime's full export failed at the original 20-minute startup deadline. Its single bounded MCP preparation attempt failed after 10.751 seconds using the interrupted startup cache. The Runtime map trial retained the real partial screenshot and public-source fallback. This availability failure remains in the cohort; it does not prove that every clean Runtime invocation fails.
- Early MCP sessions used shared-worktree code before the later semantic link repair, with export graph hashes matched. Subsequent sessions used the exact original installed 2b7c00f package, verified against 365 recorded file hashes. Later permalink repairs were not used to retake answers.
- First four newly coordinated direct trials received inline prompts; later trials read a prepared prompt file, consuming task time. Exact question text remained frozen.
- Independent fresh graders received only assigned fixed answers, frozen questions/references, and pinned sources. They did not receive timings, target attainment, product implementation or other grades. Citation-line drift, partial answers and tool errors remain recorded in per-cell grades and answers.
- GitDiagram: N/A because equivalent pinned-revision access was not verified. No paid competitor calls were made.

## Reference issues retained

- map/nowinandroid: Oracle q2 cites docs/ModularizationLearningJourney.md:68-70 whose NiaNavHost example is stale relative to app/ui/NiaApp.kt:257-270 (entryProvider/NavDisplay). Required app scaffolding fact remains valid; evaluated answer explicitly recognizes the stale name.
- direct/sqlite: sqlite-q8 oracle selects test_exec/Tcl/exec.test, but the exact question asks for an evidenced direct consumer without restricting which one. Pinned src/table.c:146 establishes sqlite3_get_table as another valid direct consumer, accepted rather than silently treating the oracle selection as exhaustive.
- map/sqlite: No pinned oracle excerpt/hash contradictions found: all oracle references matched pinned Git blobs. q8 oracle requiredFacts enumerate test_exec/Tcl/exec.test, but the exact frozen question asks for a direct consumer without naming one. The independently verified sqlite3_get_table alternative answers that question; oracle evidence is preserved unchanged.
- direct/swift-argument-parser: q9 frozen question permits a test OR example; oracle requiredFacts specifically demand RepeatExampleTests.repeatBasic. The supplied Repeat example satisfies the stated alternative. Oracle evidence itself matches pinned source bytes and excerpts.

## Evidence

Machine-readable results: results.csv and results.json. Aggregate bounds: summary.json. Trial dispatch/persistence and answer hashes: ledger.json. Frozen contract and schedule: manifest.json. Actual MCP/preparation calls: transport-events.jsonl. Export/source identities: exports/. Original answer artifacts: direct-*.json and map-*.json. Independent scoring: grades/. Package identity: frozen-package-verification.json. Detailed conditions: OPERATIONS.md.

Independent integrity audit: independent-audit.json. It found no arithmetic, hash, identity or CSV/JSON discrepancies across the 36 trials and grades, four frozen contract hashes, 365 installed package files and 17 export graph identities. It verified a maximum of two overlapping timed map trials and no transport restart during a map trial. The Click timing/order and historical session-close logging limitations remain explicit. Infrastructure shutdown is recorded in infrastructure-shutdown.json; minimal integration guidance is in MINIMAL-EVIDENCE.md.
