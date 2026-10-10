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

The unconfigured map uses the existing paper, ink, border and accent tokens. At most nine folder chunks appear in a view; child folders use the same component with a parent breadcrumb and nine-chunk pages. Acyclic dependencies run from users above to foundations below. Only strongly connected components receive a rounded dashed cycle enclosure. The selected chunk uses a two-pixel accent outline; no execution marker appears when every status is unknown.

Chunk padding is 6px vertically and 12px horizontally (12px on mobile), horizontal layer gaps are 32px, and path titles use the existing mono family at 1rem. Names break only after slash separators; unusually long individual segments scroll within the title instead of splitting a word or widening the document. Dependency paths use an 8px routing grid around measured cards and label rectangles. Labels state shortest-unique source → target paths and importing-file counts at 11px. They occupy 192px-wide slots on a 240px grid: a 40px base plus 48px per two-line label row (64px for three lines when the endpoint pair exceeds thirty characters). Labels begin 32px below the preceding layer. Distinct 8px ports and reserved route segments avoid shared arrowheads and collinear runs where space permits; the drawing records routing fallbacks. These data-driven bands may grow for dense graphs; arrows never use node interiors as shortcuts. The structural desktop header uses 8px top padding and 4px section margins; tab padding is 6px above and 5px below, without reducing text sizes. Counts mean distinct importing source files. Long prose URLs wrap within their cards; path-title segments retain slash-only wrapping. A complete textual dependency disclosure accompanies the drawing and opens if an edge cannot be routed.

Descriptions use source-backed deterministic text before optional AI notes. Source evidence stays in a disclosure. The short external-agent instruction is secondary text at .8rem. Configured domain loops retain their approved layout and summaries.

When a visible dependency graph exceeds twelve connections, the initial arrows show the selected chunk's incoming and outgoing neighborhood. The control states both displayed and total counts and can show every arrow. Every connection remains in the complete textual disclosure and selected-node explanation. This reduces routing clutter without deleting topology or evidence.
