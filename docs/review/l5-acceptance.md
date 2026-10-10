# L5 source, portability and agent acceptance

Status: partial. Source/oracle, portability and actual-client evidence below does not waive the failed [performance requirements](l5-performance.md). Final publication of the expanded consumer lens is pending [bs-mobile PR163](https://github.com/hyunlord/bs-mobile/pull/163). L5 and the overall goal remain incomplete.

[Lattice PR47](https://github.com/hyunlord/lattice/pull/47) merged as `b9da44c0f22e0133fff675a9dd4c916b6b716fa9`; [Node20/22/24 CI](https://github.com/hyunlord/lattice/actions/runs/38014061877) passed. The earlier separately installed candidate `61d419b` matches PR47, package SHA-256 `3abdb704a6ffbc1502d24d761ac1363b54fd6cdbefd442c0ab1d70ebf2a6bedb`. [PR48](https://github.com/hyunlord/lattice/pull/48), merged as `0a20ebe`, subsequently corrected generic facet provenance. That candidate `09e7764` has package SHA-256 `40b1c2ea543c13a9af6ae95ab70a9c7003b0f01c95e6ae236cb5862d72477ba2`. Node24.21.0 runs the CLI and clients. [PR49](https://github.com/hyunlord/lattice/pull/49), merged as `d8a689`, subsequently corrected generic rule provenance. The latest three-repository prototype/source/browser checks use package SHA-256 `89a188a741c8d83960eba19e202c11376312879ef5be4f342e638bac92b0a765`. Earlier records remain retained with their identities; bs-client calls still await the final published-source rerun. Failed performance requirements remain.

## Prototype and eight findings

The expanded YAML lens was applied to prototype source `90c8ca34f9de6755afca01d28c8eff4f2eae20be` with installed candidate `d8a689` / package `89a188a7…0a765`. Every one of the 216 IDs, kinds, selection flags and reference-depth classifications matched the independent [prototype oracle](../reference/prototype-oracle.json). Graph `5039ef99b947106f26777c124823901baa4b84311829bd983941f0343fea8ed3` records 77 selected and 20 reference-unique records; the separate effective projection has 16 unique records. That recorded build reads clean source through an external lens/cache, and preserves the same metrics and classifications after the provenance correction. Source status and lens hash are preserved in [structured evidence](evidence/l5-portability.json).

| Finding | Independently verified values |
| --- | --- |
| Items | 24 stat-only of 30 selected |
| Weapons | 10 selected; base forms4 (rays5/disk3/sector90=1/sector180=1); effective forms10 |
| Tools | 3 unique of 8; land3/building3/people2 |
| Vassals | 16 candidate designs, 0 profile-selected, 6 separate meta vassals |
| Chapters | 10 chapters, 1 boss ID, 1 ordered terrain-kind signature |
| Economy | 10 sinks, all10 require all4 materials with positive base costs |
| Estate loop | combat20/growth16/people10/harvest9/food5/fertility4 authored memberships |
| Enemies | 13 selected; building4/ripe3/lord4/seed1/people1 targets |

The verifier derives results from source records, profile selection/overrides and meta data, then compares graph metrics, exact target IDs, source locations, intent and effective effects. The fixed oracle is only a verifier input, never a graph-generation substitute. Current-source verification does not hardcode the historical counts. All eight findings retain authored interpretations, warning severity and no gate. Four base forms do not mean the actual chain path is absent; costs do not establish measured economy outcomes; authored loop membership is not execution frequency.

Chrome checked the downloaded [consumer Actions artifact](https://github.com/hyunlord/bs-mobile/actions/runs/38015638247) across ten routes at375/1280 pixels: all eight authored findings, selected77/unique20 filters, ash-charm intent/effective effects/static support, reward and sink tables, and preserved designed home/list/detail/influence. Twenty route/width checks had no page errors or whole-page overflow. This candidate artifact uses clean source `3363bb1aaf4ae11c25a6889d457bdf1477914b6e` and graph `1ed8ce8c513d61e05689aa83d2ff7ca40d21d7a855de7d7efce64d44887d5413`; it is not public Pages proof. [Structured evidence](evidence/l5-portability.json) includes the refreshed prototype/current verifiers and browser record alongside earlier observations. Designed historical/current oracles remain `6/15/11/7/12/0` and `0/0/2/2/0/3`.

## Static code support

The consumer YAML selects effective operation values and inspects `RuntimeSystem.Apply`, `Modify` and `PlantingPosition`. Actual prototype graph evidence includes twelve operation values with source handler spans, including the alternate `stat-add` and `planting-bias` paths. Fourteen available handler labels in the [earlier direct source inspection](l1-code-links.md) and twelve operation values used by selected records are different scopes.

Positive actual-source facets are combined with the existing generic adapter tests for absent/comment-only/unrelated/local-function/lambda/ambiguous cases, and installed code-only-change/history/export checks. The consumer verifier's literal-span assertion alone is not proof of negative handler coverage. This establishes static source support, not runtime reachability, game execution or design-intent fulfillment. The ash-charm page displays authored fertility intent alongside ranged-conditioned attack-damage +3 and separate handler evidence.

## Final portability artifact and retained bs evidence

The earlier candidate `61d419b` serves clean expanded bs source `6a0fb5b7ad5af6cd4244b34cc6053fcdb0dd5287`, yielding graph `7358f9dda9f51af1431d4c070a7906338cbe364e0046a4f627b615a3fadde807`. This remains intermediate bs evidence. The latest package89a188a7 also verifies bs source `3363bb1` and graph `1ed8ce8c…5413` through source assertions and downloaded-artifact browser checks. C&K and Click have been rebuilt, checked, exported and read in the browser using the same verified candidate package `89a188a7…0a765`, without core changes between repositories:

| Repository | Pinned source | Graph and result |
| --- | --- | --- |
| Charter & Kin | `251f397eb6646b81fd1dda0597255ee474806b49` | 200nodes/977edges/394facets/3findings/3views; graph `15eb1182925ae4940aa6bd208a0a6e4a1d499423b4b21ff20bec617ff67424f0` |
| Click | `2247b35ea1c47c727d7a06e51fa280e12a863ff6` | 455nodes/653edges/2automatic findings; graph `9edcf7569873b8da06f64cd7cc4b5553ea523c30d3bcddda8d5c8c0d96224073` |

Both latest candidate reruns used external cache/export paths, retained identical clean HEAD/status, and produced matching exported viewer assets. C&K preserves exact nodes, edges, facets, findings and views with zero provenance changes against its prior graph; its simple field/count facets were unaffected by PR48 and PR49. C&K used the [minimal example lens](../../examples/feudal-lord-simulator/README.md); Click had no configuration before or after and a null lens digest. No C&K commit or push occurred. Actual home/list/detail browser reads had no errors; all24 asset hashes and semantic graph identities agree with the [prior six-screen L2 acceptance](l2-acceptance.md). The bounded rerun does not claim a new full accessibility sweep or Python/game runtime execution. [Compact portability evidence](evidence/l5-portability.json).

## Actual Claude Code and Codex

[Sanitized client evidence](evidence/l5-clients.json) records the earlier package `3abdb704…6bedb` with Claude Code2.1.280 and Codex0.162.0. Final-package calls against published bs source remain pending. A transparent byte-preserving stdio capture observed each real client's `tools/list` request and response containing all eight tool names. This closes the earlier Codex discovery-record gap; a synthetic protocol client was not substituted.

Both recorded clients called overview, item find with selected/referenceDepth filters, and item-stat-projection findings against clean source `6a0fb5b` and graph `7358f9dd…e807` above. Both received total24 and finding24/30, plus the exact lens-authored intent and ash-charm identity. Claude called the sequence once; Codex repeated it, and all six successful calls are retained. Detailed raw transcripts stay outside the repository; the compact record retains wire/transcript hashes, all call arguments/results, timings, discovery names and exact finding wording. Temporary explicit configuration and external caches left the source and host settings unchanged. Actual-client success does not establish the one-second latency target: the initial calls took about2.9seconds.

## Scope and remaining work

Bounded source review found no domain-specific core branch, added dependency, model stage, product data editor, hosted authentication or multiuser surface. Runtime dependencies remain YAML only; the optional Graft path independently validates an external graph and does not invoke or import Graft implementation. MCP declares the eight read/query tools. Local serving accepts GET/HEAD on loopback; generation and init writes remain the requested cache/export/agent-configuration operations.

Consumer changes are limited to `.lattice/`, map workflow and the authorized existing ADR0040. Catalog/Core/Unity sources are unchanged. Final PR/CI/Pages and the immediate premerge ADR-collision check remain publication evidence to add. Three independent cold builds per recorded case have equal hashes, proving the recorded determinism check; [candidate performance evidence](l5-performance.md) still fails cold MCP and expanded-lens freshness targets; its warm diff now passes. Earlier diff failures remain preserved. No failing requirement is redefined or waived, and the final milestone report remains pending.
