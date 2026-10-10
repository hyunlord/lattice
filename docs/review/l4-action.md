# L4 reusable delivery verification

Implementation is tracked in [issue 42](https://github.com/hyunlord/lattice/issues/42). Hosted consumer and publication evidence is pending until its linked PRs finish. This document distinguishes local behavior from GitHub runtime acceptance.

## Local verification

`npm run check` passes strict TypeScript, formatting, 149 tests and documentation contracts. `npm run test:package` passes installed-package CLI, extraction, history, shared graph and export checks. No dependencies were added.

The new focused tests execute the real CI runner against Git repositories, including a failed lens gate that still writes a map/report and a PR comparison retained alongside a separate current-lens historical projection. HTTP-backed tests exercise Pages availability and real comment transport, bot ownership, pagination, update/unchanged behavior, stale/fork skips and trusted-context mismatch. These tests do not constitute a hosted Actions run.

## Delivery contract

The [action contract](../design/action.md) defines immutable matching workflow/tool pins, permissions, artifacts and fork limitations. The read-only source job may run an explicitly selected consumer verifier. Comment and Pages jobs check out only trusted pinned tooling; artifact data is never executed as scripts. Existing Pages settings are read, never automatically changed.

The self-test workflow exercises the composite action without Pages write permission and retains the map/report artifacts. External consumer verification will preserve bs-mobile's existing current and historical catalog oracle, then verify actual Pages and a single bot-owned PR comment. L4 acceptance remains pending until those execution records are attached.
