---
slug: lattice-v0
status: executing-l1
intent: clear
pending-action: finish JSON/CSV extraction PR/CI, then remaining adapters and lens implementation under issue 5
approach: one graph, declarative lenses, generic viewer and shared MCP query service
---

# Draft: lattice-v0

## Components (topology ledger)

| id | Outcome | Status | Contract |
| --- | --- | --- | --- |
| core | deterministic adapters/lens/cache/diff | active | docs/design/lattice-v0.md |
| viewer | six useful generic screens | active | docs/design/viewer.md |
| agents | eight fresh MCP tools + managed init | active | docs/design/lattice-v0.md |
| delivery | reusable action + Pages + PR comments | active | ADR0004 |
| evidence | three-repo oracle/performance/client proof | active | docs/review/acceptance.md |

## Open assumptions (announced defaults)

TypeScript strict + Node24; one ESM npm package; native DOM/SVG viewer, no UI framework; declarative YAML, no executable lens extension needed. Preserve prototype and effective-profile projections separately. License is a separate issue, not silently granted.

## Findings

Repository absent: `gh repo create hyunlord/lattice --public --clone` succeeded. Source and prototype match bs-mobile 90c8ca34; base attack-model count4 differs from profile form count10. Four charter overrides change effective unique20→16. Source audit and hashes in docs/reference.

## Decisions

ADRs 0001–0004. Read complete brief before any project work. User explicitly authorizes full implementation and autonomous milestone continuation, superseding optional skill approval/plan-only handoffs. No external production changes outside the requested GitHub repository/PR/Pages scope.

## Scope IN

Complete L0–L5 without scope reduction, exactly as original brief and acceptance ledger.

## Scope OUT (Must NOT have)

Graft code copying, Charter writes, domain-aware engine/viewer, source data editing UI, LLM processing, auth hosting.

## Open questions

No blocking product-scope questions. MIT recommendation recorded as decision issue before license/release. Graft schema sample, exact dependency versions, protocol/client support and performance are discovery/verification work in their implementing milestones.

## Approval gate

status: user-authorized-execution
The original goal and workspace autonomy directive already authorize design and implementation through all milestones. Do not ask to proceed or stop at a planning-only handoff.
