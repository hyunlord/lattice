# bs-mobile prototype oracle and source audit

The supplied HTML is content reference only. Its UI, palette, hardcoded screens and scripts are not copied into the product. [Machine oracle](prototype-oracle.json) preserves per-ID classification for all 216 content records; it is test data, never core/viewer input used in place of actual extraction.

Inputs read on 2026-10-10:

- Brief: `ASTRA_GOAL_lattice_v0.1.md`, SHA-256 `05c5555feb777ae8f64780536a0ce10a15787918608fc2c1dbd2aa933412c01b`.
- Prototype: `lattice-reference-bs-mobile-numbers.html`, SHA-256 `2103b2790a4942a728dfc6e9dcfb0d5acbb8db7537620b6802be8fd80cc9f53e`.
- Embedded `window.ATLAS` is parsed as JSON, not executed. Source says `hyunlord/bs-mobile`, commit `90c8ca3`; full verified commit `90c8ca34f9de6755afca01d28c8eff4f2eae20be`.
- Read-only current checkout `/Users/rexxa/orca/workspaces/bs-mobile/seagrass` has that same HEAD. No consumer source changes were made.

## Classification oracle

| Kind | Total | Profile | Design | Stat | Base | Unique |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| weapon | 30 | 10 | 20 | 0 | 9 | 1 |
| tool | 40 | 8 | 32 | 0 | 5 | 3 |
| charter | 16 | 8 | 8 | 4 | 0 | 4 |
| item | 60 | 30 | 30 | 24 | 0 | 6 |
| evolution | 30 | 8 | 22 | 2 | 0 | 6 |
| enemy | 24 | 13 | 11 | 0 | 13 | 0 |
| vassal | 16 | 0 | 16 | 0 | 0 | 0 |
| Total | 216 | 77 | 139 | 30 | 27 | 20 |

Prototype footer rule: outside the first-playable profile → design; all actual effects are stat additions → stat; common weapon/tool/enemy behavior → base; at least one non-stat effect → unique. For reproducing this reference, “actual effects” means the prototype's original `runtimeProjection`, not a runtime observation or resolved profile override. Empty effects require the base/design rule, not vacuous `all([])`. Unique does not establish full design-intent implementation.

There are also five synthetic target hubs (221 total prototype graph nodes) and 196 edges: anti 22, grows 40, link 60, evo 50, targets 24. The generic extracted graph may include more document/module/meta nodes; the **216** metric must query the seven content kinds only, not all graph nodes.

## All eight finding contracts

1. **물품:** 게임에 들어간 물품 30개 중 24개가 공격력·속도 같은 수치 덧셈. Names/design describe estate-linked devices, while effects mostly add a number conditioned on equipment tags. Preserve the supplied interpretation that this does not change play, labeled authored interpretation. Intent example `core:ash_gathering_charm` is death traces → fertility; source projection is ranged-owned-tag `stat-add`, `attack-damage +3`. Both intent and implementation must be visible and queryable.
2. **무기:** 무기 10개가 기본 데이터 공격 형태로 4가지. Count `growth.attackModel` (fallback `activation.shape`): rays 5, disk 3, sector90 1, sector180 1. Preserve prototype commentary about similar forms and only harvest-scythe unique projected effects; attach the effective-profile correction below rather than asserting absent chain behavior.
3. **도구:** 8개 중 고유 성장 효과 3개 (`poison_sickle`, `rain_ladle`, `soup_ladle`). Targets across **all eight**, not only the other five: land 3/building 3/people 2. Preserve the interpretation that differentiated outputs/growth would make the tools-as-weapons premise legible.
4. **가신:** 설계된 가신 16명은 profile selection 0, 별도 판 밖 가신 6명은 percent modifiers. Compare the authored roles/costs (including ember carrier leaving the lord to guard kill sites) against meta vassal names and Attack/Health/Movement/Growth/Allies/Experience permille effects. The supplied monetization/personality critique is authored context, not a conclusion from JSON.
5. **챕터:** 10 chapters, one `bossId` (`core:winter_hart`), one ordered terrain-kind signature (`river+forest+hill`). Preserve the repeated-boss/terrain interpretation. Do not repeat “only health/threat differ” as a verified fact: source also varies enemy IDs, damage, map dimensions and placements.
6. **판 밖 경제:** four manor buildings + six meta vassals = 10 sinks; 10/10 require all four materials with positive base costs. Show reward-source and sink-cost matrices. Preserve wood-bottleneck/grain-accumulation interpretation as supplied analysis; a cost matrix alone does not prove economy simulation outcomes.
7. **영지 순환:** profile-selected `loopLinks` membership counts combat 20, growth 16, people 10, harvest 9, food 5, fertility 4. Preserve the interpretation that the estate-specific fertility link is thin. Label these authored links, never measured activations or contribution counts.
8. **적:** selected 13, targets building 4 / ripe 3 / lord 4 / seed 1 / people 1. Preserve target diversity and supplied behavior-gap commentary; actual handler support must be checked independently before any blanket statement that special behavior is absent.

## Source map for the YAML lens

Paths below are relative to bs-mobile at the baseline. Every lens result must keep file:line and exact JSON pointer.

| Meaning | Source |
| --- | --- |
| Seven content kinds | `data/{weapons,tools,charters,items,evolutions,enemies,vassals}/*.json` |
| Identity / intent | `id`, `name`, `concept`, `tags`, `effect.trigger/benefit/cost`, `loopLinks` |
| Profile membership | `data/profiles/first-playable.json`: `selection.weapons/tools/enemies`, `runtime.charters/items/evolutions` |
| Reference effects | record `runtimeProjection.effects[]` including trigger/operation/subject/conditions |
| Effective effects | profile `runtimeOverrides.{equipment,charters,items,evolutions}[id]` before original projection |
| Base form / effective form | record `growth.attackModel` or `activation.shape` / profile `firstPlayable.weapons[id].form` |
| Tool / relation facts | `growth.target/output/primaryRoute`, `antiSynergy`, `linkedToolIds`, `inputIds`, `target` |
| Meta | `data/meta/progression.json`: `materials`, `economy.rewardRules`, `manorBuildings`, `vassals`, `chapters`, `challenges` |
| Costs | building `baseCost`, vassal `levelCostBase`; higher-level costs remain separate |
| Territory | `data/estates/sprout_march.json`, `data/heroes/frontier_knight.json` |

## Separately verified static corrections

[Runtime loader precedence](https://github.com/hyunlord/bs-mobile/blob/90c8ca34f9de6755afca01d28c8eff4f2eae20be/core/src/SowSiege.Sim/RuntimeContentLoader.cs#L33) resolves overrides first. Four charters (`guarded_harvest`, `repair_tithe`, `meal_oath`, `rally_boundary`) have stat-only overrides. Thus the separate effective-effects projection has charter stat 8/unique 0 and total stat 34/unique 16, versus the required reference 30/20. Retain both named projections.

[First-playable combat](https://github.com/hyunlord/bs-mobile/blob/90c8ca34f9de6755afca01d28c8eff4f2eae20be/core/src/SowSiege.Core/FirstPlayableCombat.cs#L59) handles ten profile forms: sector90, sector180, projectile, orbit, piercing, boomerang, chain, field, volley, nova. It includes an actual chain path. The required four-form metric counts a different base-data field.

[Runtime dispatch](https://github.com/hyunlord/bs-mobile/blob/90c8ca34f9de6755afca01d28c8eff4f2eae20be/core/src/SowSiege.Core/RuntimeSystem.cs#L95) applies ownership, triggers, conditions and costs. `stat-add` uses `Modify` and `planting-bias` uses `PlantingPosition`; neither is absent merely because it is outside the `Apply` switch. Code-link tests must cover those paths and reject a token found only in validation/comments. Static handler evidence is not measured runtime execution.
