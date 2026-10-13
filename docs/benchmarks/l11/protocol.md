# L11 preregistration: generic first impressions

Status: source-reviewed registration, not measured product evidence. Tracking: [#100](https://github.com/hyunlord/lattice/issues/100). The user replaced the box-selection task; [#99](https://github.com/hyunlord/lattice/issues/99) remains deferred. Historical L9/L10 registrations and accepted limitations remain unchanged.

## Corpus and questions

Eighteen public repositories are pinned in [repositories.json](repositories.json): twelve regression samples and six additional samples. These are language/ecosystem-diverse, not eighteen distinct languages. Preserve unsupported C and the large runtime repository as explicit controls. Do not run target installation or build scripts. Source-only oracle writers instantiate the [ten-question template](question-template.md), preserving source paths, line spans, file hashes and atomic expected facts. Independent source review and a hash freeze precede product implementation. Corrections after freeze are additive errata with original scores retained.

The six public demos are fzf, HTTPX, ripgrep, nowinandroid, spring-petclinic and excalidraw. The required three first-screen subjects are HTTPX, ripgrep and nowinandroid, each at1440×900 and390×844. Configured game maps are separate lens examples, never the main product introduction or evaluation standard. Example names stay in documentation/demo inputs, not production analysis branches.

## Independent-agent task study

This is an agent proxy study, not a claim about human thirty-second comprehension. Use a fresh independent context for each repository/arm with no implementation history, no reference answers, and no answers shared between arms. Same model/reasoning setting and ten questions,600seconds maximum per repository. Rotate arm order by repository index. Record actual model, tool access, timestamps, output, errors and enforcement limitations.

- GitHub-direct: pinned GitHub tree/blob pages and native navigation/search. No local checkout, shell source search, Lattice, MCP or oracle.
- Lattice+source: the map and MCP plus the same pinned GitHub source access.
- Optional GitDiagram+source: enroll only if the same pinned revision can be verified and no unapproved spending/credential use is needed. Unavailable or mismatched revisions are N/A with the actual reason, not a zero score.

A read-only source reviewer independently grades each answer0/1/2: wrong/absent, partial, or complete with source citations. An invented connection prevents full credit. The maximum is20per repository and360per arm. Correctly stating an analyzer limitation is reported separately and does not replace a factual answer when source is available. References identify direct consumers; do not demand or fabricate dynamic whole-program impact.

Elapsed time uses coordinator monotonic timing from task delivery until the final answer is persisted, including reasoning/tool waits. Preserve timeouts and partial answers; no replacement trials or selective exclusions. Authoritative token telemetry is optional; unavailable is recorded rather than estimated as actual usage. Report per-repository and aggregate scores/time. Primary target: Lattice+source score at least GitHub-direct and aggregate elapsed time at most50% of GitHub-direct. A miss stays a miss; one trial per cell provides limited statistical certainty.

## Startup and progressive display

Report installed-package invocation, source revision, Node/browser/OS/hardware, cache state, file counts and exact timestamps. Distinguish tracked files, selected inputs and product-code files. Source inventory before candidate timing selects Vitest (3189tracked files) as the primary supported-language medium stress sample, conservatively above the approximately2000-file request. Also report BoatAttack1376 and Excalidraw1312 rather than presenting them as2000-file inputs. SQLite2287 is a separate unsupported structural control, not a substitute supported-language performance success. No sample count is inflated; selected-code counts are reported alongside tracked files.

Measure process start to browser launch, first meaningful partial inventory, and complete first-impression display. For GitHub URL runs include clone/network time; separately report npm install/download overhead and local-path cold/warm times. The medium complete-display target is60seconds. Large input must show actual progress and source-backed partial inventory before full analysis; do not count a spinner or invented zero dependencies as a meaningful partial map. Existing L10 memory/startup observations remain historical, not silently reclassified by new methods.

## Product evidence and limits

A complete summary contains purpose, automatically computed dependency/cohesion components, entrypoints, one to three source-supported static flows where available, and technology facts. If fewer real components/flows exist, disclose that instead of manufacturing units. Deterministic fallback uses source text or explicit inventories/public names; no first-screen instruction to run summaries to fill missing content.

Optional AI sentences require validated citations to supplied graph/source identities, line spans and hashes. Freshness and citation validity do not prove semantic entailment; retain the AI label, show supporting excerpts and review claims. Invalid, stale or uncited claims fall back to deterministic facts. No automatic model requests or discovery of unrelated credentials.

Real-browser checks cover both requested widths, keyboard/navigation, zero console errors and horizontal overflow, deferred evidence, source-generation binding, progress→partial→complete and failures/cancellation. Screenshots and measurements must name the actual candidate commit and distinguish frozen-data viewer overlays from fresh extraction.
