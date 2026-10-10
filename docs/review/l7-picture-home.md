# L7 picture home

Lattice issue #66 and consumer bs-mobile issue #191 implement the approved
picture-map design. The first screen uses hub regions, one primary point per
content, kind shapes, status colors, directed influence arrows and nearby cards.
Secondary memberships remain visible in the card. Empty hubs remain regions.
Metadata is inside **근거 보기**, and existing analysis screens are under
**자세히**. No domain identifiers or bs-mobile conditionals enter the renderer.

## Verification

- `npm run check`: strict typecheck, format, 166 tests and documentation checks pass.
- `npm run test:package`: installed CLI/package smoke checks pass, including
  exported assets, read-only sources, history, incremental builds and serve.
- Native import details and resolution limits: [C# and Rust](l7-native-imports.md).
- Actual bs-mobile source `55681271f8afb3480a5700c7da37e1eebc63d01e` plus this
  consumer lens: 13 hubs, 163 unique content points, 274 memberships and 41
  directed influence arrows. Independent membership/status verifier passes.
- Chrome desktop 1280×800: document height 800, all 13 hub names inside viewport,
  initial engineering metadata matches 0. Mobile 375/390: 16px hub names,
  horizontal overflow 0. Cards, Escape/focus, arrow explanation and keyboard
  scrolling of dense point clouds pass. No browser runtime errors.
- Lens-free requests source `611c6162cbc4ac2020a2f91c7cfa4f3abf9bbb60`:
  6 folder regions, 36 module points, 3 aggregated import arrows.
- Read-only C&K source `251f397eb6646b81fd1dda0597255ee474806b49` with the
  example lens: 14 folder regions, 56 aggregated import arrows. Both examples
  support point → nearby card → full detail at 1280 and 390 pixels; metadata and
  horizontal overflow remain absent. No commit or write to either source.

These are static source and browser interaction checks. Program presence is not
runtime completion. Missing status stays unknown. The user judges 30-second
comprehension on the published Pages URL after deployment; it is not claimed as
passed here. Dense folder graphs can have crossing arrows; hover, focus or tap
reveals each directed relationship. Dense clouds scroll locally with a visible
scroll affordance rather than dropping nodes.

## Screens

[bs-mobile desktop](evidence/l7-bs-desktop.png) ·
[bs-mobile mobile](evidence/l7-bs-mobile.png) ·
[requests without a lens](evidence/l7-requests.png) ·
[C&K example lens](evidence/l7-ck.png)

The consumer workflow and PR system-difference comments remain the maintenance
path after this approved L7 exception. No new feature stage or performance work
is opened by this change.
