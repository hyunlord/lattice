# lattice-v0 - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** A reusable repository system map with CLI, static browser viewer, agent queries, and continuous publication. The first consumer is bs-mobile; the same tool also maps Charter & Kin read-only and a public non-game repository without configuration.

**Why this approach:** One deterministic graph serves people and agents; repository-specific meaning lives in a declarative lens. Reference counts remain reproducible while code-support evidence is shown separately.

**What it will NOT do:** Copy the prototype UI or Graft implementation, edit source data through the viewer, add hosted authentication, or write to Charter & Kin.

**Effort:** XL
**Risk:** High - correctness of provenance, lens expressiveness, freshness budgets, three-repository rendering and real agent integrations all need separate proof.
**Decisions to sanity-check:** Preserve historical and effective-profile classifications separately; publish the first Pages map before reusable automation. Licensing is tracked as a decision issue.

Next action: continue the user-authorized L0 → L5 execution without an approval handoff. Full execution detail follows below.

---

> TL;DR (machine): XL; full L0–L5 scope; explicit evidence ledger; no narrowed completion.

## Scope
### Must have
Every row in docs/review/acceptance.md, derived from the preserved docs/design/brief-v0.1.md. Six ordered milestones, all eight findings and tools, three real repositories, live Pages, real agent transcripts.
### Must NOT have (guardrails, anti-slop, scope boundaries)
No domain logic in core/viewer, copied Graft code, changed bs-mobile design originals, Charter commits, LLM processing, data editing or auth hosting. Never report source analysis as runtime observation.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: boundary-focused fixtures before risky core/rule/cache edits, tests alongside implementation with node:test, actual CLI subprocess and browser/stdio/client QA. Documentation-only L0 uses structural/link/oracle checks and independent review.
- Evidence: .omo/evidence/task-<N>-lattice-v0.<ext>

## Execution strategy
### Parallel execution waves
Each milestone is a hard ordered wave. Independent bounded subtasks may be delegated with explicit ownership; interfaces must be agreed before concurrent writes. L0 is one reviewed design package.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | none | 2–16 | none |
| 2–5 | 1; 3 after 2; 4 after 3 | 6 | docs/research inside own scope |
| 6 | 2–5 | 7–10 | none |
| 7–9 | 6; 9 after 7–8 | 10 | viewer/docs vs example lens |
| 10 | 7–9 | 11–12 | none |
| 11–12 | 10 | 13–14 | MCP vs managed config after API agreement |
| 13–14 | 11–12 | 15–16 | action docs vs security tests |
| 15–16 | 13–14 | final audit | read-only independent acceptance checks |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [x] 1. L0: reviewed design, source oracle and delivery ledger
  What to do / Must NOT do: Preserve full brief and hashes; review every L0 requirement, classify future work pending, push design PR and verify documentation CI.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/design/lattice-v0.md; docs/adr/0001–0004; docs/design/viewer.md; DESIGN.md; docs/reference/*; docs/review/acceptance.md. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: node tools/check-docs.mjs; git diff --check; independent Metis review. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Temporarily alter a copied brief/oracle/link in a disposable clone; checker must fail and original files remain unchanged.
  Evidence: .omo/evidence/task-1-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | docs(design): make system-map semantics reviewable before implementation

- [ ] 2. L1: strict npm package and versioned graph model
  What to do / Must NOT do: Create package.json/lock, tsconfig, src/core/model.ts, canonical.ts; expose CLI bin, engines Node24, scripts build/typecheck/format:check/test/check. No generic engine domain vocabulary.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/design/lattice-v0.md sections Architecture and Graph; ADR0001/2. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm ci && npm run check; npm pack --dry-run; canonical graph fixtures across key order. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Reject invalid JSON/schema IDs and prove semantic array reorder changes hash.
  Evidence: .omo/evidence/task-2-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(core): give repository facts stable identities

- [ ] 3. L1: data, document, module and optional Graft adapters
  What to do / Must NOT do: Implement src/adapters JSON/YAML/CSV, Markdown, code module and git input adapters; locate fields accurately; derive exact-ID references; validate independently observed Graft sample, fallback on absence/schema mismatch.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/design/lattice-v0.md Inputs; platform-contracts.md; src/core/model.ts (created in task2). Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm test -- adapters; real temporary repo build with all formats and local imports. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Malformed YAML/CSV, symlink escapes, duplicate IDs, misleading code fences and unsupported Graft schema produce explicit errors/coverage.
  Evidence: .omo/evidence/task-3-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(adapters): preserve source evidence across repository formats

- [ ] 4. L1: declarative lens, rules, code support and query parity
  What to do / Must NOT do: Implement validation, bounded expression interpreter, views/facets/findings/gates and source-dispatch scanner. Demonstrate profile lookup and override handling in fixtures without a bs-specific core branch.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/design/lattice-v0.md Lens; docs/reference/bs-mobile-oracle.md; src/adapters (task3). Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm test -- lens; non-game lens and bs-shaped fixtures exercise all operators and code-link routes. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Unknown operator, cyclic derived values, empty all, comment-only handler and malformed dispatch return errors/unknown, never false support.
  Evidence: .omo/evidence/task-4-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(lens): express meaning without executable repository code

- [ ] 5. L1: incremental service and historical diff
  What to do / Must NOT do: Implement src/service input discovery/shards/atomic cache/locks/history and src/core/diff.ts. Refuse silent stale reads; resolve git refs without checkout; support external cache.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: ADR0002; graph model and adapter/rule outputs from tasks2–4. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm test -- cache; real two-commit fixture checks add/delete/change of nodes/edges/facets/findings. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Preserved-mtime same-size edit, lens/profile/handler dependency edit, interrupted writer, malicious/invalid ref; no consumer worktree modification.
  Evidence: .omo/evidence/task-5-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(cache): retain trustworthy current and historical graphs

- [ ] 6. L1: complete CLI command surface and CI gate
  What to do / Must NOT do: Implement init/build/check/diff/export/serve with real minimal generic static viewer and watcher. CI runs tests/format/typecheck on Node24. Publish L1 report only after installed-package subprocess checks.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: CLI table; completed tasks2–5; acceptance L1-01 through L1-12. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run check; npm pack then install in temp prefix; invoke every command with real inputs; browser static load. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: check fail exits1, invalid config exits2, export outside owned output refuses, watcher reports edit and closes on SIGINT.
  Evidence: .omo/evidence/task-6-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(cli): make system maps reproducible from a clean installation

- [ ] 7. L2: complete six-screen generic viewer
  What to do / Must NOT do: Implement home/explore/list/views/changes/node, stable encoded routes, snapshot selection/trends and all view types. Finish keyboard/mobile/theme and all missing/loading/error states.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/design/viewer.md; DESIGN.md; graph/query outputs task6. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run test:browser; browser walkthrough six routes plus path/filter/sort/matrix/history/deep-link actions. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Malformed graph, unknown ID/snapshot, empty filters, literal script text and disconnected path show safe useful state.
  Evidence: .omo/evidence/task-7-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(viewer): expose evidence and relationships in every repository

- [ ] 8. L2: example lenses and real three-repository exports
  What to do / Must NOT do: Implement examples/bs-mobile/lens.yaml and examples/charter-kin/lens.yaml; choose pinned public non-game repository after reading its format. Use external work/cache for Charter. Materialize actual two-snapshot history; record source SHAs and graph hashes.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: docs/reference oracle; acceptance L2-10/L5-01–07; completed core task6. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run test:examples; run same installed binary on all three; compare oracle per ID and computed findings. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: No lens must still produce meaningful views; remove selected handler in disposable fixture and verify support change; Charter before/after git state identical.
  Evidence: .omo/evidence/task-8-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(examples): prove domain meaning can stay outside the core

- [ ] 9. L2: visual acceptance and scale
  What to do / Must NOT do: Capture eighteen actual route screenshots; mobile/tablet/light/dark/focus/error, category contrast and color-deficiency checks; 5000-node aggregate→expand test. Attach accessible screenshot index to PR.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: viewer spec QA section; tasks7–8. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run test:browser; inspect screenshots with image viewer; browser logs clean; record routes/viewport/hash in evidence. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Keyboard-only selection, narrow screen overflow, missing snapshot and large expansion must remain usable.
  Evidence: .omo/evidence/task-9-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | test(viewer): verify evidence remains readable across datasets

- [ ] 10. L2: early bs-mobile Pages delivery through PR
  What to do / Must NOT do: Open consumer issue/PR adding lens + minimal pinned Pages workflow, preserve originals, await required CI and merge, deploy and open actual returned page_url. Report Pages URL first, then commit/PR/CI within ten lines.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: ADR0004; task9; bs-mobile AGENTS/runbooks. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: gh pr checks; gh run view; HTTP and browser six-route/deep-link checks at deployed SHA. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: If Pages unavailable produce artifact and accurate blocker; do not mark L2 passed or invent URL.
  Evidence: .omo/evidence/task-10-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | ci(map): publish the first reusable repository map

- [ ] 11. L3: eight fresh stdio tools and graph links
  What to do / Must NOT do: Implement src/mcp with negotiation, schema validation, object/text results and all eight tools; every request passes ensureFresh and same queries used by web.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: MCP section; official protocol baseline; tasks6/10. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run test:mcp; real stdio tools/list/tools/call on all eight and graph-hash parity. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Malformed JSON/RPC args, unknown IDs, input edits between calls, cache failure, stdout noise and EOF tested.
  Evidence: .omo/evidence/task-11-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(mcp): let agents inspect the same current graph

- [ ] 12. L3: managed agent configuration and actual client smoke
  What to do / Must NOT do: Implement init managed AGENTS/Claude skill/MCP/Codex sections, --no-global and rollback on parse failure. Preserve Graft. Run actual installed clients listing tools and asking stat-only items with intent.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: MCP integration section; task11; existing local Codex/Claude configs read first. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run test:init; repeated temp-config runs byte-equal; codex and claude client transcripts. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Invalid JSON/TOML or managed-section conflicts leave configs untouched; no-global preserves home sentinel. Missing client/auth is an explicit pending gate, not simulated pass.
  Evidence: .omo/evidence/task-12-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | feat(init): connect agents without replacing their existing setup

- [ ] 13. L4: reusable action and safe PR summaries
  What to do / Must NOT do: Create lattice-action reusable action build→check→export with pinned package input and output manifest; default branch Pages deployment orchestration and independent artifact upload. Marker PR diff comments from validated data, minimal permissions.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: ADR0004; platform-contracts; tasks11–12. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: Action fixture/consumer CI; actual default-branch Pages and same-repo PR comment update. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Gate failure stops publish; fork read-only tokens create summary/artifact; untrusted artifact content never executes.
  Evidence: .omo/evidence/task-13-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | ci(action): continuously publish and review system changes

- [ ] 14. L4: consumer integration and fallback
  What to do / Must NOT do: Update early bs-mobile workflow through a new PR to reusable action. Document Pages limitations/local serve and artifacts; test Pages-disabled/fork fallback.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: task13; bs-mobile PR-only rule. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: gh PR/CI/deployment + artifact download and local serve; comment references base/head hashes. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Missing Pages permissions does not drop graph artifact; do not label artifact URL live preview.
  Evidence: .omo/evidence/task-14-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | docs(action): make publication limits observable

- [ ] 15. L5: full fidelity, portability, determinism and timing
  What to do / Must NOT do: Use same built package on all three actual repositories. Assert seven named totals, all 216 per-ID depths, all eight findings, intent and code support. Run isolated repeated builds; collect full/cold/warm/strict freshness/MCP timings with metadata.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: All acceptance rows L5 and INV; complete tasks2–14. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: npm run acceptance; node tools/benchmark.mjs --root <bs-mobile>; stored source/hash/measurement records. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: Mutate profile/code/lens in isolated fixture and confirm corresponding changes; no core edits between repositories; fail each over-budget metric visibly.
  Evidence: .omo/evidence/task-15-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | test(acceptance): measure the full real-repository contract

- [ ] 16. L5: both agent transcripts, final evidence audit and release
  What to do / Must NOT do: Run actual Claude Code and Codex tool discovery and exact stat-only-items/intent query, compare to graph. Reconcile every acceptance row with current PR/CI/live artifact evidence. Release npm artifact/tag only with licensing resolved; no evidence ZIP.
  Parallelization: follow dependency matrix; milestone ordering mandatory.
  References: L5-10/11; all ledger rows; task15. Paths named in later tasks are created by their dependencies, not existing L0 code.
  Acceptance criteria / happy QA: actual client transcripts + independent final scope/code/QA/requirement audits; check live Pages exact graph hash. Add the named package scripts in the implementing task before claiming execution.
  Failure QA: If any requirement lacks direct proof keep goal active, not complete; protocol mock never substitutes agent evidence.
  Evidence: .omo/evidence/task-16-lattice-v0.md plus CI/artifact URLs.
  Commit: Y | docs(release): make completion traceable to current evidence

## Final verification wave
> Runs after all implementation tasks. Independent reviewers must inspect current evidence. The user explicitly authorized autonomous completion; no additional approval handoff is required, but every requirement must pass.
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real manual QA
- [ ] F4. Scope fidelity

## Commit strategy
Issue-linked short branches; intent-first Conventional Commits and honest Lore trailers. Await required CI before merge. bs-mobile PRs only, Charter read-only. Report each milestone with commit/PR/CI and at most ten summary lines.

## Success criteria
Every requirement in docs/review/acceptance.md has direct current evidence; no required gate is pending. L2 live Pages, both agent transcripts, all eight findings and tools, numerical oracle, three repositories, timing and determinism must all pass. Only then mark the persistent goal complete.
