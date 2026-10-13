# Lattice Design System

## 1. Atmosphere & Identity

A picture map first, with a compact repository workbench available on demand. The first screen explains regions, their contents and directed connections. Provenance remains available through an evidence disclosure; detailed inspection retains the navigation rail and dense aligned rows. No game identity, marketing hero, decorative art, gradients or ornamental animation. The user's information-density contract overrides spacious promotional-layout examples in generic design references.

## 2. Color

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `--canvas` | `#f5f6f8` | `#14171c` | Workbench background |
| `--surface` | `#ffffff` | `#1d2229` | Tables and graph |
| `--surface-active` | `#e9edf2` | `#2b333d` | Selected/hovered row |
| `--text` | `#202630` | `#edf0f4` | Primary text |
| `--muted` | `#505d6d` | `#b0bccb` | Supporting text |
| `--border` | `#bbc3ce` | `#596677` | Structural divisions |
| `--control-border` | `#7b8796` | `#8491a3` | Input, select and button boundaries; at least 3:1 against adjacent surfaces |
| `--accent` | `#275dad` | `#9dbfff` | Links/selection |
| `--focus` | `#164695` | `#b8d0ff` | 2px focus outline |
| `--gate-fail` | `#a31536` | `#ffb3c3` | Failure text + octagonal stop mark |
| `--gate-pass` | `#315e28` | `#b8d6a7` | Pass text + check mark |
| `--gate-unknown` | `#61456e` | `#d9bce5` | Unknown text + question mark |

Kind swatches use the color-vision-aware Okabe–Ito categorical palette in stable order: blue `#0072b2`, orange `#e69f00`, sky `#56b4e9`, green `#009e73`, yellow `#f0e442`, vermilion `#d55e00`, purple `#cc79a7`, gray `#777777`. The palette is not a text palette: all labels use primary text; nodes have contrasting outlines. Kinds pair a swatch with a labeled shape (circle, square, diamond, triangle, hexagon, cross, pentagon, double-circle); after eight kinds, continue labels and shape/fill-pattern combinations. Status uses reserved stop/check/question symbols and the separate status tokens above, never an unlabeled category swatch. Contrast and color-deficiency simulation remain L2 checks, not claims made by this document.

## 3. Typography

System sans: `system-ui, -apple-system, 'Segoe UI', sans-serif`. Mono: `ui-monospace, 'SFMono-Regular', Consolas, monospace`. No remote fonts.

| Token | Size/line-height | Weight | Use |
| --- | --- | --- | --- |
| `--type-title` | 24px/32px | 650 | Screen title |
| `--type-section` | 18px/24px | 600 | Sections |
| `--type-body` | 14px/21px | 400 | Tables, forms, prose |
| `--type-meta` | 12px/18px | 400 | Commit/line metadata, never primary body |

IDs/counts use tabular figures and mono. Labels wrap; IDs can wrap anywhere or be copied in full. Never truncate the only source of identity.

## 4. Spacing & Layout

Human view sizing tokens: gallery minimum 20rem, text matrix cell minimum 12rem/maximum 20rem, matrix region maximum 70vh. These sizes constrain data regions, not the page.

Base spacing tokens `--space-1` through `--space-6`: 4, 8, 12, 16, 20, 24px; `--space-8`: 32px. Rail 200px, inspector 320px, minimum main column 320px. App fills viewport width; content panels have 16px padding and 24px section gaps. Table row minimum 36px desktop; touch controls 44px. Workbench border radius 4px, border 1px, focus offset 2px. The picture map uses island radius 20px on desktop and 16px on mobile, a 24px point target containing a 16px kind shape, and desktop gaps of 32px horizontally and 40px vertically. Mobile island titles remain 16px; never shrink them to fit the desktop composition.

Breakpoints: under 640px navigation becomes a disclosure with full labels and inspector moves below content; 640–1023px collapsed rail and one content column; 1024px+ full rail and optional inspector. Data tables use `--table-min-width: 960px` when multiple descriptive columns are present. No page-level horizontal overflow; wide data tables have a labeled, keyboard-scrollable region. Test 375, 768, 1280px.

## 5. Components

Initial implementation patterns (not implemented at L0):

- Navigation: semantic `nav` + anchor list, active `aria-current=page`, skip link, 44px mobile target.
- Provenance strip: repository/commit/hash/freshness text with source link and dirty indicator; no color-only status.
- Filter bar: labeled native input/select/button, active filters as removable text tokens, clear action.
- Data table: caption, scoped headings, sort buttons with `aria-sort`, row node links and explicit pagination.
- Finding row: severity and gate text, metrics, message, evidence links; authored interpretation visibly identified.
- Inspector: titled section, close button, logical focus return, source links and incoming/outgoing relation lists.
- Graph: SVG nodes and directional edges plus equivalent accessible neighbor/cluster list; selected node shares state with inspector.

Every control has hover, active, visible keyboard focus, disabled and busy states; empty/error/loading states include cause and recovery action. No status is conveyed by color alone. Generic matrix/distribution/table/cycle components take graph-derived definitions only.

## 6. Motion & Interaction

No entrance or ambient motion. Optional 120ms opacity transition for inspector/theme; disable for reduced motion. Graph uses deterministic layout on first render, no perpetual simulation. Expansion, keyboard selection and viewport pan remain stable when filters change. Escape closes transient panels; route changes focus the main heading. Theme supports system/light/dark and stores preference locally.

## 7. Depth & Surface

Borders-only depth. One-pixel separators, flat surfaces, no shadows. Selected rows use `--surface-active`; highlighted graph neighbors use outline/dash/label in addition to color. UI colors, typography and spacing must trace to these tokens. More detail: [screen wireframes](docs/design/viewer.md).

## Human reading views

Gallery cards use the existing flat panel, 16px padding, 16px gaps and a minimum 256px (`--card-min-width`) column. Their title is the primary node link; labeled summary, badge and status fields are lens data, never inferred from domain IDs. Status remains text, including absent evidence. Matrix explanations wrap in 256px (`--matrix-text-width`) cells; the first column and header stay sticky within the scroll region. A target selector reduces dense matrices to one destination. Individual graph views default to a selected node and its neighborhood, with full names in a parallel accessible list. The picture-map home precedes curated links and findings, which remain under 자세히. Detail summaries and named relationships precede raw attribute disclosure; provenance remains accessible.

Final human-view polish uses the same tokens and DOM components: galleries show eight records per page, default to collapsed relationship evidence, and sort by name or lens badge/status fields. Individual graphs require a selected center. Grouped sentence matrices show member names without changing graph topology.


## Picture-map home (L7)

The approved first screen is one full-width map with large named islands, kind-shaped content points, directed influence arrows and a single-line legend. Lens configuration selects hub kinds, membership edge kinds, influence edge kinds, a primary-membership facet and a status facet. A point appears only in its primary island; its small card lists other memberships. Empty hubs remain visible so their incoming and outgoing arrows explain their role. Arrow width expresses connection count; hover or keyboard focus exposes the relationship text. Kind and status also have non-color cues.

At 1280×800, every hub name must fit without document scrolling. Mobile uses a vertical island layout with readable titles at native scale, not a miniature desktop canvas. Clicking a point opens an anchored card containing its name, short summary and a bounded list of three to five connections, and a 자세히 link. Existing galleries, matrices, status boards and full evidence remain available below that disclosure.

Without configured picture-map hubs, folder areas contain file/module points and static imports become arrows. This fallback also applies when a lens exists but has no picture-map configuration, including the Charter & Kin example. Unknown execution status stays unknown rather than becoming completion evidence.

The initial map hides the layer selector, source snapshot, graph hash, input coverage and provenance wording under 근거 보기. The expanded evidence retains these values and their meaning. Approved shape and spacing do not imply a passed visual gate: collect desktop/mobile browser screenshots and assert metadata hiding, hub-label visibility and interactions against the built export. Human 30-second comprehension remains the user's public-Pages check.

## Structural dependency overview (L8)

Unconfigured maps begin with the whole visible structure, without selecting a folder or opening its detail panel. The header alone carries the repository introduction and source root. Entry/public-API folders receive the existing accent outline and an explicit entry label; this is a reading hint, not a selected item or an execution claim. A URL selection remains authoritative. The scope row names the primary-source focus and separately counts excluded outside-root and auxiliary files. The all-repository toggle retains every source file. Scope, selected folders, focus and catalog remain addressable.

At most nine physical folder cards appear at once. Names are model-provided paths relative to the displayed source root; outside-root paths carry an explicit repository prefix. There are no representative-name or unrelated-remainder bundles. Cards state file counts and child-folder counts only. Clicking a card exposes its actual folder children and dependency evidence. Names wrap only at slash boundaries, with intact long components scrolling locally rather than widening the page.

Dependency layers use the complete projected graph, independent of the visible arrow subset. Mutually dependent folders share one dashed enclosure labeled “서로 참조하는 폴더 · 안쪽 연결 생략”; individual physical folder names remain visible inside it. Internal arrows are omitted. External arrows touch that enclosure boundary. This visual mutual-reference grouping does not assert a source-file cycle.

The first drawing shows the five strongest unordered external endpoint pairs, ranked by distinct importing files. Opposite directions use one continuous path, arrowheads at both ends and separate directional counts. Arrow width grows logarithmically from 1.5px to 6px. The count is centered on its own path segment, never placed in a separate label grid. Sparse paths use distinct outer lanes and measured card/enclosure boundaries; endpoint corridor rows use a 4px grid so different routes never share a segment. Labels use the existing 12px mono metadata type with a paper-colored 6px stroke behind the glyphs. Endpoint identities and precise counts remain in hover text and the complete dependency disclosure; no dependency is removed from evidence. Selected-folder inspection can narrow arrows, and a visible “전체 구조” action clears selection.

Desktop card layers reserve 48px corridors and 40px side routing space; mobile reserves 72px corridors and 32px side space. Desktop folder-page controls use 28px height; mobile retains 44px targets. Folder cards keep existing panel/border/accent tokens, 12px radii for mutual-reference enclosures and 12px enclosure gaps. Diagram and role list share the existing two-column layout above 900px; below it the role list follows the map. Role prose remains 13px/18px with a three-line overview preview. Folder selection exposes the full description; AI notes additionally retain their accessible summary/evidence disclosure. Original summaries remain unchanged and public-symbol lists never substitute for roles. Only source-backed folder documentation or a fresh scoped AI note explains a folder. Missing roles state “역할 설명 없음 — 요약 실행 필요”; old interpretation evidence stays available without becoming a current role. The external-agent instruction remains secondary. Configured domain loops retain their approved structure, labels, colors and interaction.

Browser verification measures actual SVG paths and labels after layout settles: continuous routes with boundary endpoints, labels on their own route, no route/card intersection or shared segments, no internal mutual-reference arrows, no document overflow, no raw documentation markup, at most folder/file units, and neutral initial selection. Screenshots at 1280 and 390 accompany expansion, scope, deep-link and browser-history checks. These deterministic checks do not replace the independent first-screen comprehension score.

## L9 package and execution views

The L9 user contract supersedes folder-only presentation when build manifests declare packages/modules: offer those named units first and retain folder fallback for uncovered product files. Label declaration dependencies separately from distinct importing-file counts. Repository purpose comes from root metadata only. Before optional AI summaries, cards may show explicitly labelled representative public names as factual contents, never as an invented responsibility description. Preserve configured lens views.

Expose source-backed entrypoints, callers/callees and bounded static flows. Distinguish public API exports, framework callbacks and executable starts. Unknown dispatch stays unknown; a static path is not runtime execution proof. Precompute a versioned overview so initial rendering does not require the full graph. Source/evidence and deeper partitions load on demand with commit/hash consistency and visible recoverable failures. Match1440px desktop and390px mobile without horizontal overflow, keep raw engineering metadata under evidence, and preserve sharing/back navigation.

## L10 visible package directions and meaningful starts

For declared package maps, the initial drawing shows the twelve strongest directed internal dependencies, or every dependency when fewer exist, with the remaining connections available through expansion. This supersedes the L8 five-pair limit and omission of mutual-group internal directions for packages. Preserve source-backed direction and distinct importing-file counts; reciprocal arrows may share a line only when both directions and counts remain clear. Route endpoints touch their actual package cards. A mutual-reference enclosure describes a cycle without inventing an internal hierarchy or replacing member-to-member direction with an opaque group.

Reserve64px between members of mutually dependent package groups. Start layer corridors at48px on desktop and72px on mobile, retrying72px,96px and128px when routing needs more room without dropping selected directions. These dimensions are multiples of the existing4px spacing unit. Labels remain on their own line segment, arrow width expresses count, and hover/keyboard evidence identifies both endpoints. Use the existing surface, accent, border, mono metadata and focus tokens. Account for actual rendered arrows; a route omitted by geometry is a visible failure, not a successful twelve-arrow model count. Mobile retains readable package titles and touch targets without document overflow.

Only executable evidence receives the start badge. Public package APIs, exported-type public methods and framework callbacks have distinct labels and do not imply that every library is executable. Examples, tests and build scripts remain available through explicit inspection but are absent from default entry lists. The overall home remains unselected. Individual focus defaults to a product executable, then a public API, then a product function with the most proven callers; explicit selected-item URLs remain authoritative. Details, flows and evidence use the same classification and graph generation across browser and MCP.


## Compact mobile package directions

The mobile package overview tries up to six measured layouts: two or three columns with a one-column readable fallback, 44px interactive name cards, the existing 12px/16px mono label and 4px internal padding. Layer channels use 24/32/48/56px and mutual-member channels use 48/64/80px, all on the existing 4px grid. Wide intact names occupy a full row; wrapping is allowed at slash boundaries. Exact shared path/name prefixes can appear once in a visible numbered legend, with matching node markers and complete accessible names; no prefix is silently removed. Grouped-folder labels use their actual directory path, keeping counts in details.

The compact map prioritizes endpoints of the unchanged strongest twelve directions, retaining every member of a mutual group. The entire package model remains available through a clearly labeled full-map control and role details. Actual cycles keep their membership without a fabricated internal hierarchy. Full counts, descriptions and evidence remain in selected details and the expanded map. Routing reserves shorter local directions before long ones without changing the selected dependency set. Candidate search stops at the first complete, readable drawing whose cards, paths, count labels and transformed marker geometry fit the remaining viewport; no second route calculation is needed to restore the chosen drawing. Unfittable chains or dense graphs remain explicit geometry failures rather than dropping arrows or shrinking text. Desktop layout and configured lens loops retain their existing rules. A compact support-limitation notice stays visible, with full unsupported-language counts/explanation in evidence.

## L11 generic first impression

The default unconfigured home is a compact repository introduction: sourced purpose, language/build facts, five to nine meaningful dependency/cohesion components where the input supports that many, executable/public entrypoints and up to three conservative static paths. Smaller or unsupported inputs retain truthful inventories and limitations rather than invented roles or blank requests to run AI. Each component links to members and source evidence; the detailed physical map remains reachable.

Use the existing canvas/surface/text/accent/focus tokens and spacing/type scale. The desktop composition puts purpose and technology facts first, followed by the component/dependency picture and the entry/path overview. Mobile reflows in the same reading order, retaining readable text and44px controls without horizontal document overflow. No external fonts, decorative hero, game artwork or arbitrary display numbers. A partial inventory is visibly labelled as analysis in progress and never resembles a complete dependency result. Optional AI claims carry an AI label and immediate supporting evidence. Configured lens examples preserve their own existing views behind explicit example navigation.
