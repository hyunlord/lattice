# L6 human-facing views

Local acceptance: five real bs-mobile tasks pass within two clicks from home at 375, 768 and 1280 pixels (15 task/viewport observations). The initial public deployment was verified at consumer commit `86b8c56`; the navigation follow-up below closes an additional visual finding.

## Generic contract

Gallery and status reuse expression-materialized table columns and rows. Graph preserves individual nodes and selected edge kinds. Label matrices expose authored sentences, sticky headings and a target filter. Home and detail composition come from presentation settings. Empty-layer views are absent from the selector; direct links offer actual input layers. Cross-layer reference resolution uses the complete graph without changing row membership. Existing no-lens defaults remain.

No dependencies were added. Existing DOM/canvas/table primitives and token styles are reused. The Charter & Kin example applies the same gallery, curated home and detail relationships to actual modules; source remains read-only at `251f397eb6646b81fd1dda0597255ee474806b49`.

## Verification

`npm run check`: 155 tests, typecheck, format and documentation checks pass. Installed package smoke passes. Browser Chrome/Playwright evidence is `/tmp/lattice-l6-qa/evidence.json`; C&K evidence is `/tmp/lattice-l6-qa/ck-evidence.json`. Screenshots are adjacent. Both runs report zero page errors. Current and historical consumer verifiers pass; historical oracle remains 6/15/11/7/12/0. These local runs use a changed lens on source `d2969eb`, not a clean published commit.

| Task | Click path | Answer checked |
| --- | --- | --- |
| Iron blade | Home → weapons → iron blade | Seed bag → sowing sworddance; wave-1a program exists |
| Timber | Home → materials → timber | Carpenter/cart sources; carpentry/salvage/seed-storage sinks and original action text |
| Seed bag | Home → tools → seed bag | Bitter seed dust and crop guard signet |
| Program scope | Home → layer status | 28 programs, 135 without a program in this profile; observation not assessed |
| Land influences | Home → text matrix → land target | Six incoming explanations shown directly |

Visual inspection found and corrected a mobile matrix width issue: a selected target now fits a two-column table. Further checks cover individual graph focus, raw-detail disclosure and wrong-layer recovery. Child review sessions hit their account usage limit; implementation integration and browser review continued in the parent session. No independent final dual-review result is claimed.

## Public navigation follow-up (#62)

The public build passed all 15 answer/path checks and matched all 26 validated package assets. Screenshot inspection then exposed retained gallery scroll: after opening iron blade, Chrome reported `scrollY=1277` and heading top `-1147`, before and after full-page capture. A failing-first browser assertion required the new detail to start at its summary. Resetting document scroll after route rendering changes the same reproduction to `scrollY=0`, heading top `130`. This is generic navigation behavior; no lens or dependency is added. The five-task harness now also requires newly opened detail/status headings in the first viewport. `npm run check` still passes all 155 tests.
