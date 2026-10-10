# Reusable CI maps

The root composite action builds, checks, compares and exports a repository map. The reusable workflow adds isolated PR comments and default-branch Pages publication. Both use the same deterministic CLI, graph, lens rules and viewer as local commands. Completion evidence remains in the [acceptance ledger](../review/acceptance.md).

## Install the reusable workflow

Verified release: `v0.1.0-l4`, commit `b6e65efe6eed4771dcd220897b7ecfe06829c8cc` ([implementation PR43](https://github.com/hyunlord/lattice/pull/43)). Use this SHA for both placeholders below.

Commit this caller in the consumer repository through its normal PR process:

```yaml
name: Repository map
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
  actions: read
  pull-requests: write
  pages: write
  id-token: write
jobs:
  map:
    uses: hyunlord/lattice/.github/workflows/lattice.yml@<LATTICE_COMMIT_SHA>
    with:
      tool-ref: <LATTICE_COMMIT_SHA>
      # lens: .lattice/lens.json
      # pages: false
```

Replace both placeholders with the **same complete 40-character Lattice commit SHA**. The workflow reference and checked-out tool are separate GitHub inputs; keep them synchronized when upgrading. Do not use `main` or a movable tag for either pin. Change `main` in the trigger if the consumer's default branch differs. No consumer secrets or personal access token are required.

The caller grants a permission ceiling. The reusable workflow narrows the source build to `contents: read`, the comment job to `contents: read`, `actions: read` and `pull-requests: write`, and publication to `contents: read`, `pages: write` and `id-token: write`. Existing repository and organization policies still apply; these settings do not override them.

The workflow checks out the actual PR head, with full Git history and no persisted checkout credentials. `pull_request_target` and `workflow_run` are not used. The build checks the PR base against that head, not GitHub's synthetic merge commit. On ordinary pushes it builds the selected commit without inventing a PR comparison.

## Inputs and artifacts

| Input | Composite action | Reusable workflow | Meaning |
| --- | --- | --- | --- |
| `tool-ref` | Action reference itself | Required | Immutable Lattice SHA, identical to the workflow pin |
| `root` | `.` | Source checkout selected automatically | Repository to inspect |
| `lens` | Empty | Empty | Optional lens path; otherwise use normal default discovery |
| `base-ref` | PR base SHA by default | PR base SHA automatically | Git comparison revision |
| `history-ref` | Empty | Empty | Additional historical snapshot, separate from the PR comparison |
| `history-current-lens` | `false` | `false` | Explicitly project the current lens onto that additional historical tree |
| `verification-script` | Not applicable | Empty | Optional repository-relative Node verifier, described below |
| `node-version` | `22` | `22` fixed | Node runtime for the tool |
| `artifact-name` | `lattice-map` | `lattice-map` fixed | Static map artifact |
| `report-artifact-name` | `lattice-report` | `lattice-report` fixed | Validated summary artifact |
| `pages` | Not applicable | `true` | Allow configured default-branch Pages deployment |

Generated cache, site and report live in separate dedicated paths under `RUNNER_TEMP`, outside source. The source tree is not changed by normal extraction/export. The static map artifact includes graph evidence and retained snapshots; the report artifact contains `report.json`. Download the static artifact and serve its extracted directory with a static HTTP server to inspect it locally.

The action outputs `site-path`, `cache-path`, `report-path`, `graph-hash` and `check-status`. Only findings with an explicit lens gate affect `check-status`; failed or unknown gates fail the action **after** available map/report artifacts have been uploaded. An operational build/configuration failure is distinct from a completed graph whose gate failed, and may have no complete artifact to upload. Warning findings without gates remain warnings.

## Optional consumer verification

A consumer of the reusable workflow may set `verification-script` to a repository-relative Node script, for example `.lattice/verify-ci.mjs`. The source-build job runs it after generating the map, using the selected Node executable and separate arguments:

```text
node <repository>/<verification-script> <absolute-cache-directory> <absolute-site-directory>
```

The verifier may inspect the generated graph, snapshots or exported site and fail on consumer-specific expectations. Keep domain counts and rules in the consumer lens/verifier, not in Lattice. This is an explicit opt-in to execute consumer code, including PR changes, **only in the read-only-token source-build job**. A script is not a sandbox: it has that job's runner access. Do not supply secrets to it. Neither the comment job nor the Pages job checks out the consumer or runs this verifier; neither executes scripts downloaded from artifacts.

## PR system-diff comment

For a same-repository PR, a separate job checks out the pinned Lattice tool and downloads only the summary artifact. Before writing, it validates the summary schema and matches repository, run ID, event, PR number, source head and comparison base/head to trusted Actions metadata. It fetches the current PR and skips closed PRs or runs whose head/base are no longer current.

The publisher paginates issue comments and finds a `github-actions[bot]` comment beginning with `<!-- lattice:system-diff -->`. It updates that comment, creates one if absent, and performs no write when the rendered body is unchanged. A user-authored comment containing the same marker is never edited. The body reports graph counts, gate outcomes, added/removed/changed counts and bounded finding summaries, with workflow/artifact links. Source text is escaped and truncated; it cannot introduce raw Markdown, HTML or mentions.

Fork PRs receive the read-only build and downloadable artifacts; the privileged comment job is skipped. Do not add broad credentials or a `pull_request_target` workaround to enable fork comments.

## Pages and fallback

Publication is a separate job, after a successful build, for the repository's default branch and never for a PR. It uses pinned Lattice code and the generated static artifact, without checking out or executing consumer source. Pages environment approval and branch restrictions remain effective.

The workflow checks the existing repository Pages configuration. A `404` means Pages is unavailable: it skips deployment and leaves the ordinary map/report artifacts available. It does not create a Pages site or change repository settings. Other API failures remain failures, rather than silently being presented as lack of Pages support. Set `pages: false` for an explicit artifact-only publication policy, including a private repository on a GitHub plan that does not support Pages (such as a private repository on GitHub Free). A missing Pages deployment must not be reported as a working public URL.

## Use only the composite action

A custom read-only job may use the root action directly after checking out its source with full history:

```yaml
- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1
  with:
    ref: ${{ github.event.pull_request.head.sha || github.sha }}
    fetch-depth: 0
    persist-credentials: false
- uses: hyunlord/lattice@<LATTICE_COMMIT_SHA>
  with:
    root: .
    lens: .lattice/lens.json
```

This produces artifacts and enforces gates; it does not grant permissions, publish Pages or post comments. The caller owns checkout, triggers and job permissions. Use unique artifact names if invoking the action more than once in a run.

## Summary schema

`report.json` is schema version `1`, parsed by `parseCiReport` before privileged use. Unknown fields and invalid values are rejected. It contains:

- `repository`, `runId`, `eventName`, `sourceCommit` and `graphHash` for provenance.
- `counts`: nonnegative integer counts for nodes, edges, facets, findings and views.
- `gates`: nonnegative `passed`, `failed` and `unknown` counts.
- For PRs, `pullRequest`: positive `number`, exact `headSha` and `baseSha`.
- When compared, `difference`: `baseCommit`, `headCommit`, per-entity `added`/`removed`/`changed` counts, and matching finding-summary arrays. Each array has at most ten entries with `id`, `ruleId`, `severity` and `message`.

A summary is bounded evidence, not a replacement for the complete graph or source provenance. Validation establishes its shape and association with this run; repository-derived descriptions remain untrusted text. See [delivery and permissions ADR](../adr/0004-delivery-and-permissions.md).
