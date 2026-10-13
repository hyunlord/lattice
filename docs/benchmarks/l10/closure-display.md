# L10 closure first-display gate at 12bc48f

Status: **FAIL, 11 of 24 comparisons regress**. PR95 must remain unmerged. The integrated 1,203 checks, installed-package check and Node20/22/24 CI passed, but they do not supersede this browser gate. No maintenance transition or consumer publication is claimed.

## Fixed protocol and provenance

The preregistered paired unchanged-main comparison ran 96 navigations: one desktop sample and three mobile samples per arm for each of the twelve frozen repositories. Desktop AB/BA ordering was balanced6/6; mobile18/18. Fresh contexts used installed Chrome, cache disabled, service workers blocked, gzip/no-store loopback serving, CPU1 at1440×900 and CPU4 at390×844. Readiness remains the first station plus two animation frames. No retries, exclusions or tolerance were introduced.

Baseline exports were produced by d4f4c5f; all63 viewer assets match unchanged main ac54bf46 and the static-producing source diff is empty. Candidate data are frozen accca83 exports with12bc48f assets overlaid, **not fresh extractions or exports**. Complete baseline inventory, candidate before/after inventories, served baseline assets and requested data were hash-bound. Unrequested baseline shards were not all rehashed after execution. Historical21/24 and later15/24 failures remain separate evidence.

## Results

Times below are milliseconds. Desktop is a single observation; mobile is the median of three. These observations are not confidence intervals.

| Repository | Width | Baseline | Candidate | Change | Gate |
| --- | ---: | ---: | ---: | ---: | --- |
| click | 1440 | 163.3 | 129.2 | -20.88% | PASS |
| click | 390 | 466.4 | 250.9 | -46.20% | PASS |
| excalidraw | 1440 | 129.9 | 111.0 | -14.55% | PASS |
| excalidraw | 390 | 400.8 | 262.1 | -34.61% | PASS |
| fzf | 1440 | 80.4 | 95.2 | +18.41% | FAIL |
| fzf | 390 | 219.1 | 252.5 | +15.24% | FAIL |
| nowinandroid | 1440 | 227.7 | 112.7 | -50.51% | PASS |
| nowinandroid | 390 | 763.7 | 437.3 | -42.74% | PASS |
| ripgrep | 1440 | 151.0 | 118.8 | -21.32% | PASS |
| ripgrep | 390 | 398.5 | 299.9 | -24.74% | PASS |
| spring-petclinic | 1440 | 80.7 | 67.1 | -16.85% | PASS |
| spring-petclinic | 390 | 215.9 | 236.0 | +9.31% | FAIL |
| fastify | 1440 | 83.7 | 77.9 | -6.93% | PASS |
| fastify | 390 | 214.1 | 249.1 | +16.35% | FAIL |
| httpx | 1440 | 82.5 | 87.0 | +5.45% | FAIL |
| httpx | 390 | 199.1 | 222.7 | +11.85% | FAIL |
| unity-boatattack | 1440 | 140.3 | 120.5 | -14.11% | PASS |
| unity-boatattack | 390 | 438.0 | 362.7 | -17.19% | PASS |
| godot-demos | 1440 | 97.4 | 96.9 | -0.51% | PASS |
| godot-demos | 390 | 273.3 | 288.8 | +5.67% | FAIL |
| sqlite | 1440 | 74.9 | 78.8 | +5.21% | FAIL |
| sqlite | 390 | 207.3 | 240.3 | +15.92% | FAIL |
| runtime | 1440 | 106.6 | 136.6 | +28.14% | FAIL |
| runtime | 390 | 309.3 | 349.7 | +13.06% | FAIL |

All96 navigations were valid. Maximum candidate observation444ms; console/page errors, HTTP failures, horizontal overflow and initial full-graph requests were zero. All twelve physical export caps passed. Twelve package-map screens passed supplementary card/marker geometry; the other twelve had no equivalent surface and remain UNVERIFIED. Eight pointer/native-touch checks passed.

## Bounded follow-up diagnostics

These separate fixed three-pair experiments compare against12bc48f, not the full baseline gate. None was integrated or used to replace a failed observation.

| Candidate | Control median | Candidate median | Disposition |
| --- | ---: | ---: | --- |
| Lazy initial barrel | 234.7 | 231.7 | Insufficient recovery |
| Initial home chrome class | 237.7 | 232.2 | Insufficient recovery |
| Direct inflate stream | 243.5 | 239.7 | Small, inconsistent benefit |
| Async preparation | 249.9 | 251.9 | Slower; generation-check microtask gap also found |

A native trace found the overview request at125.4ms in baseline versus173.1ms in12bc. Final layout was comparable59.9/64.3ms. The interval after archive download cannot all be attributed to decompression: measured Inflate events total1.615ms; other native/program time remains unattributed. Profiling adds overhead and is not acceptance timing.

Raw native initial code is not a valid rollback under the existing physical cap: frozen ripgrep export2,725,594B has24,406B spare, while replacing its initial compressed code adds at least231,703B before any lazy bridge. Byte-identical duplicated files: zero. Existing file-index inlining has already consumed the earlier47.6KB saving. No dependency, size allowance, readiness rule or layout redesign was introduced.

## Evidence locators

Local raw artifacts are retained outside git: `/tmp/l10-paired-final-12bc48f/` (comparison, all samples, bindings, postflight, screenshots and cleanup), `/tmp/l10-l9-12bc-startup/` (native trace), `/tmp/l10-initial-barrel-pair/`, `/tmp/l10-loading-chrome-12bc/`, `/tmp/l10-direct-inflate-pair/`, and `/tmp/l10-async-bootstrap-evidence/`. These are local evidence paths, not public durable artifacts. All owned measurement browser/server processes were closed.

The original six equal-width before/after sheets are `sheets/contact-1440.png` and `sheets/contact-390.png` under the paired evidence directory. A future actual fix requires its own validation; repeated timing without a causal change is not authorized by this report.

## User acceptance — 2026-10-13

The user explicitly accepted the eleven first-display regressions as [residual issue97](https://github.com/hyunlord/lattice/issues/97) and authorized PR95 merge followed by consumer Pages publication and maintenance. The measured failures above remain failures; this decision supersedes their merge-blocking status. The maximum444ms observation is nowinandroid390 (a passing comparison), not one of those eleven regressions. Cold MCP349.8s/5.30GB and steady-warm p95898ms are recorded in [issue98](https://github.com/hyunlord/lattice/issues/98) and README, preserving sampling and later warm-memory limits. No further click UX changes are included in this release.
