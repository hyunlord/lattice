# Lattice Design System

## 1. Atmosphere & Identity

A compact repository workbench: precise, quiet and readable. Its signature is persistent provenance beside every inspection, with a stable navigation rail and dense aligned rows. No game identity, marketing hero, decorative art, gradients or ornamental animation. The user's information-density contract overrides spacious promotional-layout examples in generic design references.

## 2. Color

| Token | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `--canvas` | `#f5f6f8` | `#14171c` | Workbench background |
| `--surface` | `#ffffff` | `#1d2229` | Tables and graph |
| `--surface-active` | `#e9edf2` | `#2b333d` | Selected/hovered row |
| `--text` | `#202630` | `#edf0f4` | Primary text |
| `--muted` | `#505d6d` | `#b0bccb` | Supporting text |
| `--border` | `#bbc3ce` | `#596677` | Structural divisions |
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

Base spacing tokens `--space-1` through `--space-6`: 4, 8, 12, 16, 20, 24px; `--space-8`: 32px. Rail 200px, inspector 320px, minimum main column 320px. App fills viewport width; content panels have 16px padding and 24px section gaps. Table row minimum 36px desktop; touch controls 44px. Border radius 4px, border 1px, focus offset 2px.

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
