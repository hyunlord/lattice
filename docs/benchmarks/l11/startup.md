# L11 installed-package startup observations

Status: **partial**. The medium repository opens within60seconds; real large partial inventory appears early. The original large full-open attempt failed at the preregistered20minute deadline. This failure remains, rather than being replaced by partial-only verification.

| Candidate / trial | Listen ms | Partial ms | Full ms | Sampled peak GB | Console/HTTP errors |
|---|---:|---:|---:|---:|---:|
| 2b7c00f original / vitest-1440 | 533.6 | 758.1 | 19198.5 | 3.742 | 1/0 |
| 2b7c00f original / vitest-390 | 201.7 | 435.3 | 18338.8 | 3.991 | 1/0 |
| 2b7c00f original / runtime-1440 | 254.8 | 1265.8 | N/A: timeout | 4.478 | 1/0 |
| 940b23c fix / vitest-1440 | 544.5 | 818.3 | 26225.8 | 3.905 | 0/0 |
| 940b23c fix / runtime-partial-1440-attempt2 | 218.1 | 858.2 | N/A: deliberately partial only | 0.252 | 0/0 |
| 940b23c fix / runtime-partial-390 | 233.4 | 984.8 | N/A: deliberately partial only | 0.273 | 0/0 |
| 940b23c fix / boatattack-1440 | 252.8 | 491.5 | 3007.5 | 0.364 | 0/0 |
| 940b23c fix / excalidraw-1440 | 298.9 | 655.6 | 18834.7 | 2.095 | 0/0 |
| 940b23c fix / httpx-url-1440 | 354.7 | 1949.6 | 4535.7 | 0.337 | 0/0 |

## Method and environment

Apple M4 Max, Mac16,5, 36 GiB RAM; macOS 27.0.1 build 26A434, Node 25.8.2 with default heap and no NODE_OPTIONS, installed Chrome 155.0.8059.40. Desktop: 1440×900, CPU1. Mobile: 390×844, CPU4 and touch.

Browser launch precedes the CLI timer. Elapsed time includes listening, reading, analysis, export and browser rendering. Visible content plus two animation frames defines partial/full display; a CLI rebuilt event does not establish full browser display. Every open has a fresh Lattice cache and browser context, HTTP cache disabled, and service workers blocked. OS filesystem caches are not flushed; source/package hashing precedes timing. These measurements are not directly comparable to L10 static-export first-display times.

RSS is sampled asynchronously at nominal 100ms intervals across the CLI process tree, excluding browser and controller. It is not a continuous maximum. Original runtime has 10,987 samples with a maximum interval of 16.541s; transient peaks could be missed. No p95 or speedup is inferred from one-shot observations. Local source bytes remained unchanged; one harness metadata check needed the correction described below.

Fresh local npm installation took 0.62s originally and 1.04s for the fix, measured separately. npm cache was not reset; this does not establish cold registry download or publication. The actual HTTPX URL trial includes a GitHub clone and records HEAD b5addb64f0161ff6bfe94c124ef76f6a1fba5254. It is an operational URL observation, not a pinned comparison. Comparing source bytes before/after is N/A for a new clone.

## Preserved failures and qualifications

- Original runtime: partial display 1.266s; extraction began at 52.293s, resolution at 489.978s, and export at 592.687s. No full display by 1200s. Clean SIGINT shutdown at 1200.743s is not success. No finalized export was retained; a 1.467GB graph cache remains locally. The duplicate runtime390 cold run was omitted before this result. Fixed runtime1440/390 runs intentionally stop after partial display and do not replace the failed full run.
- Original console404s remain in raw reports. All fixed940b23c trials have zero console/HTTP errors and zero document overflow. Long manifest paths nevertheless visibly clip inside the partial390 panel. The subsequent6929309 wrapping fix was separately verified using the exact16manifest paths and actual browser client at1440/390; this does not retime or replace these startup observations.
- Fixed Vitest initially reported sourceUntouched:false because before metadata used indexEntries while after metadata used status. Retained HEAD and every file hash match. source-check-correction.json corrects the flag without rewriting the raw result or retiming. A preexisting CRLF fixture explains repository dirty:true despite git-clean source.
- First fixed runtime1440 partial preflight hit git stdout ENOBUFS before any product/browser launch. Its log remains. Raising the harness buffer to 64MiB permitted attempt2; no completed timing was discarded.
- secondary-overlap-failure.json preserves an initial scheduling concern. secondary-overlap-correction.json uses exact timestamps to show Boat CLI and all postflight hashes completed before Excal CLI launch, with a 244.961ms gap after result write. No secondary product timing overlap or rerun occurred.
- Lightweight manifest progress fixture Chrome QA may have overlapped secondary/URL work. Fixture artifacts span 07:23:37.491Z–07:25:35.349Z, intersecting HTTPX's measured 07:24:23.808Z–07:24:28.408Z. Exact Chrome lifetime was not continuously recorded. No concurrent heavy analyzer was reported, but exclusive machine access is not claimed. The fixture uses no CPU throttling. Original2b7c00f trials predate it.
- BoatAttack and Excal screens report no confidently identified entrypoint or representative flow. Successful startup does not establish logic coverage or human understanding.

Compact evidence is in [startup.json](startup.json). Raw logs, RSS samples, package hashes and screenshots remain under /tmp/l11-startup-measurement/. Each trial has independent output, and original observations were not overwritten. The measurement lane made no source/product edits.
