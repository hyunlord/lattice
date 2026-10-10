# L4 reusable delivery verification

Implementation [PR43](https://github.com/hyunlord/lattice/pull/43) merged as `b6e65efe6eed4771dcd220897b7ecfe06829c8cc`, tagged `v0.1.0-l4`. [Node20/22/24 CI](https://github.com/hyunlord/lattice/actions/runs/38010313234) and the [hosted action run](https://github.com/hyunlord/lattice/actions/runs/38010313321) pass. Consumer build, comment and public Pages/browser evidence below verifies L4. L5 performance and combined real-use acceptance remain pending. This document distinguishes local behavior from GitHub runtime acceptance.

## Local verification

`npm run check` passes strict TypeScript, formatting, 149 tests and documentation contracts. `npm run test:package` passes installed-package CLI, extraction, history, shared graph and export checks. No dependencies were added.

The new focused tests execute the real CI runner against Git repositories, including a failed lens gate that still writes a map/report and a PR comparison retained alongside a separate current-lens historical projection. HTTP-backed tests exercise Pages availability and real comment transport, bot ownership, pagination, update/unchanged behavior, stale/fork skips and trusted-context mismatch. These tests do not constitute a hosted Actions run.

## Delivery contract

The [action contract](../design/action.md) defines immutable matching workflow/tool pins, permissions, artifacts and fork limitations. The read-only source job may run an explicitly selected consumer verifier. Comment and Pages jobs check out only trusted pinned tooling; artifact data is never executed as scripts. Existing Pages settings are read, never automatically changed.

The self-test workflow exercises the composite action without Pages write permission and retains the map/report artifacts. The external consumer preserves bs-mobile's current and historical catalog oracle and maintains one bot-owned PR comment. Public Pages/browser verification is recorded below.

## Actual artifact-only acceptance

Downloaded `lattice-map` and `lattice-report` from the hosted action run, served the extracted static directory over loopback, and drove Chrome through six routes at 375/1280 pixels. All twelve route/reload checks passed with zero page errors and no document overflow. Matrix evidence, two-commit history and original node source links worked. The graph/report hash matched `1f1c2caeb651e130361b3e95ea642406604fff71c92c5a352fdd924ad0494839`, with 447 nodes and 673 edges from source `34185e4deb9664f40531bfa14efe881f8e3ff597`. The screenshot was opened for visual inspection; the browser and server were closed. [Structured evidence](evidence/l4-artifact-browser.json).

This actual workflow has only `contents: read` and no Pages permission. It proves useful artifact-only delivery. The Pages API 404 branch is covered by HTTP-backed tests, not a claimed live disabled-Pages deployment; private/free-account consumers can explicitly set `pages: false`.

## Actual consumer build and comment

[bs-mobile PR161](https://github.com/hyunlord/bs-mobile/pull/161) invokes the reusable workflow and tool at the identical release SHA. Its [map workflow](https://github.com/hyunlord/bs-mobile/actions/runs/38010662116) built and verified 443 nodes, 800 edges and 1,140 facets, with the historical catalog values **6/15/11/7/12/0** and current values **0/0/2/2/0/3**. Current and exported graph hashes agree with `76253be0d1545f2c7467849e25792212f0bd2d33e1b1381d3600fe89365d1c48`. No designed warning was promoted to a gate. The [actual report](evidence/l4-consumer-report.json) records the PR head/base and zero semantic graph changes.

The [bot comment](https://github.com/hyunlord/bs-mobile/pull/161#issuecomment-6091875834) was created by run attempt 1. Rerunning only the comment job in attempt 2 returned `unchanged` with the same ID `6091875834`; exactly one marker comment remains, and its update timestamp did not change. [Attempt/job evidence](evidence/l4-comment.json). This proves actual identical-report idempotence; changed-body PATCH is covered separately by HTTP-backed tests.

Consumer [full required CI](https://github.com/hyunlord/bs-mobile/actions/runs/38010661585) passed, including the quality and secret checks. Immediately before merge, `origin/main` was fetched and ADR paths in every open PR were inspected. Only PR161 was open; it modified existing ADR0040 and allocated no new number. [Recorded check](evidence/l4-adr-recheck.json). PR161 then merged through the normal PR policy as `7aebd2e9046c4926d14fcb2d6f597dd02c5744f8`. Its [default-branch publication](https://github.com/hyunlord/bs-mobile/actions/runs/38011293150) is the deployment evidence target; a successful PR build is not itself a public Pages verification.

## Actual default-branch Pages acceptance

[Deployment run38011293150](https://github.com/hyunlord/bs-mobile/actions/runs/38011293150) passed both build and publish jobs. [Execution record](evidence/l4-deployment.json). The public [designed-v1 map](https://hyunlord.github.io/bs-mobile/#/home?layer=designed-v1) serves source `7aebd2e9046c4926d14fcb2d6f597dd02c5744f8`, with the same verified graph hash. Chrome checks covered all six routes at 375/1280 pixels: no page errors or document overflow, 24 exact viewer asset hashes, 176 visible designed nodes, 13×13 matrix with 41 directed influence edges, stable Korean node detail/source links, and explicit historical comparison reload. The downloaded historical/current graphs independently passed the original catalog oracle. [Live browser evidence](evidence/l4-pages-browser.json). Browser and monitoring processes were closed.

History retains the historical projection plus both current-lens and repository-lens coverage at the current commit. The latter two have identical graph hashes; the home screen's default latest-two comparison therefore shows zero changes. The [explicit historical comparison](https://hyunlord.github.io/bs-mobile/#/changes?base=d135b1e349f4a2a8d6c44230f5b389a6973e077f5317cb7b6b56c20540e57de1&head=a90d0b0a5dc0e4ff39f7f958cbc093cf3d1de4cf9432b4e5d7a3a7e42f67ea52&layer=designed-v1) selects de2a571 and the current commit and shows the catalog changes. This coverage distinction is preserved rather than reported as two different source commits.

## Limits

No viewer layout changed in L4. Actual identical-report comment idempotence and artifact-only delivery are proven; fork comments remain deliberately unavailable, and Pages-404 behavior is HTTP-tested rather than a live private-account claim. The consumer PR build/check/history/export job took 6m42s, which is not a single-build benchmark. L5's full-build, freshness, MCP timing and combined acceptance remain outstanding.
