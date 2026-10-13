# Guide and historical verification

**Status: L10 accepted; maintenance scope.** The user accepted the connected package/logic maps, bounded exports and map+source96/96 evaluation (16.96% elapsed saving). Eleven first-display regressions remain explicitly accepted residuals in [#97](https://github.com/hyunlord/lattice/issues/97), including the separate maximum444ms observation. See the [paired results](benchmarks/l10/closure-display.md), [frozen benchmark](benchmarks/l9/README.md) and earlier [L9 evidence](review/l9-package-logic.md). Preserve historical failures and unresolved static dispatch limitations. Complete the approved consumer Pages release, then make only fixes for reported usage problems; additional box-click UX work belongs to a separate small task.

- [Original v0.1 brief](design/brief-v0.1.md)
- [Architecture and lens contract](design/lattice-v0.md)
- [Viewer wireframes](design/viewer.md) and [design system](../DESIGN.md)
- [Prototype content oracle and source corrections](reference/bs-mobile-oracle.md)
- [Requirement and evidence ledger](review/acceptance.md)
- [Contributor boundaries](../AGENTS.md)

## Build a map

```sh
npm ci --ignore-scripts
npm run build
node bin/lattice.mjs init --root /path/to/repository --no-global
node bin/lattice.mjs build --root /path/to/repository
# Optional domain interpretation:
node bin/lattice.mjs build --root /path/to/repository --lens /absolute/path/to/lens.json
node bin/lattice.mjs export /path/to/site --root /path/to/repository
node bin/lattice.mjs check --root /path/to/repository
node bin/lattice.mjs diff HEAD~1 --root /path/to/repository --json
node bin/lattice.mjs serve --root /path/to/repository --port 4173
```

`init` creates a code-and-Markdown starter YAML lens and `.lattice/.gitignore` entries for cache/site output. JSON, YAML and CSV records are opt-in: add a record kind with explicit domain-data paths (a commented example is included), rather than selecting every repository configuration file. Selected data remains strictly parsed; the starter does not change existing or explicitly supplied lenses. Repeating it preserves an existing lens and unrelated files. It also installs managed AGENTS/Claude instructions and MCP/Codex settings alongside existing Graft configuration. Use `--no-global` to leave home configuration untouched; default init additionally registers this repository in global Codex settings. See [MCP setup and preservation limits](design/mcp.md). YAML 1.2 mappings, sequences, multiline scalars, multiple documents and bounded aliases carry original source lines. See [YAML/init evidence and format limits](review/l1-yaml-init.md).

`check` rebuilds from current inputs and evaluates findings with an explicit `gate`. Exit codes are 0 when all gates pass (or none are configured), 1 for failed or unknown gates, and 2 for invalid configuration or build errors. Informational findings without gates do not fail the command. See [gate syntax and verification](review/l1-check.md).

`diff <ref>` compares a Git commit with current files, including uncommitted additions, edits and deletions. It reads Git objects without checking out the reference. Text output lists changed identities; `--json` returns full before/after records. Historical lenses are preserved, and using a current lens on an older tree is explicitly labeled. Clean builds and comparisons retain commit snapshots; export includes their catalog and graphs. See [history evidence and limits](review/l1-history.md).

The six original CLI commands accept `--json` for automation. Build/check report graph identity, extraction counters, diagnostics and gate results; init/export report their output paths. Serve emits newline-delimited ready/rebuild/error/recovery/shutdown events. Check retains exit 1 for failed or unknown gates, and operational errors exit 2 with a JSON error. Diff preserves its existing deterministic payload. See the [structured output contract](design/cli-json.md).

Builds reuse raw per-file extraction when content, path, selection and adapter implementation match. Every build still verifies file contents and recomputes references and lens results. CLI counters show parsed/reused files; `.lattice/cache/build.json` and `inputs.json` record the latest counters and input manifest. See [incremental build verification](review/l1-incremental.md).

`serve` runs on `127.0.0.1:4173` and checks selected file contents every 500 ms after the previous check completes. Source changes refresh the browser while retaining its route and filters. Failed updates display an explicit stale-map message and recover after correction. Ctrl-C stops the server. See [local serving evidence and limits](review/l1-serve.md).

`export` builds a complete staging directory before replacing its destination. Repeated exports replace Lattice-owned output and remove obsolete assets. A nonempty unowned directory is refused unless `--force` is explicit; use a dedicated output directory. The replacement uses two directory renames, so a static server may observe a brief missing-directory interval. Use `serve` for a live local map.

Use [the bs-mobile lens](../examples/bs-mobile/lens.json) for that repository, or a YAML/JSON lens with your own file patterns and rules. Use `serve` for local source watching, or host the export directory with any static HTTP server. Installed packages provide the `lattice` command. Git is required. Without a lens, build discovers JSON, YAML, CSV, Markdown and code files, extracts records/headings/ADR metadata and resolves references/document links plus static JS/TS/Python/C#/Rust/Go/Java/Kotlin/Swift/GDScript imports and named definitions. A single `.lattice/lens.yaml`, `.lattice/lens.yml` or `.lattice/lens.json` is used when present; multiple defaults require an explicit `--lens`. Explicit lenses limit input to their patterns. Unsupported code languages retain file-only modules. Static extraction is not compiler or runtime verification. Unity tagged YAML is not supported. Optional Graft import uses validated source hashes and falls back to standalone extraction. See [document extraction evidence and limits](review/l1-markdown.md).

Go files also expose conservative same-package declaration-type references with exact use and definition locations. These are separate from imports and do not change importing-file counts. Qualified, shadowed, ambiguous or unsupported declarations are omitted; this is not a complete call graph or execution-order analysis. Flat-folder previews can use these references without inventing connections from AI prose.

[Open the published bs-mobile map](https://hyunlord.github.io/bs-mobile/).

See [module extraction evidence and limits](review/l1-modules.md).

## Code structure and logic

Without a lens, build manifests define package boundaries and internal dependencies; source imports remain separate evidence. Package cards include folded descendants and distinguish manifest declarations from observed importing files. Root package metadata or README supplies the repository introduction. Deterministic module documentation and public names remain useful without AI summaries.

The viewer's entrypoint list opens bounded function flows and caller/callee detail. JS/TS, Python, Go, Rust, Java/Kotlin and C# use CLI-side syntax trees. Only uniquely resolved lexical or imported targets produce exact call edges. Dynamic dispatch, ambiguous bindings and unsupported syntax remain explicit limits; a static flow is not observed execution. Unsupported languages retain file locations and a visible limitation notice.

Initial navigation fetches a source-bound overview. Function records, calls and flow pages load on demand; legacy detailed graph views and source evidence retain their separate lazy paths. See [L9 extraction and transport](design/l9-analysis.md).

## Query from agents

Large-repository cold cost ([#98](https://github.com/hyunlord/lattice/issues/98)): the frozen49,457-input sample's first MCP request includes a cold build and took **349.8seconds**, with a sampled process-tree RSS peak of **5.30GB** under the default Node heap. Steady-warm p95 was **898ms**. These are different operating states: the first later worker-start request took7.04seconds and later warm peak memory was6.40GB. RSS sampling can miss short peaks. See [exact environment, source and measurement limits](benchmarks/l10/closure-mcp.md); cold MCP time is not a standalone build benchmark.

Run `lattice mcp --root /path/to/repository` for stdio MCP, or use `init` to configure installed clients. Eleven read-only query tools inspect overview, filtered nodes, detail, paths, matrices, findings, Git differences, freshness, entrypoints, calls and bounded flows. Three additional interpretation tools read source-bound module/folder context, write AI notes, and save an inactive lens draft. Each query checks actual file contents before serving graph evidence. See [agent notes and optional external CI summarization](review/l7-interpretation.md). [Protocol, pagination, viewer links and setup](design/mcp.md) describe the contract.

## Automate maps in GitHub Actions

Use the reusable workflow at `hyunlord/lattice/.github/workflows/lattice.yml@<LATTICE_COMMIT_SHA>` and set its `tool-ref` input to the same complete commit SHA. It builds the actual PR head with read-only permissions, uploads map/report artifacts, and updates a bot-owned system-diff comment for same-repository PRs. Fork PRs retain artifacts without privileged comments. A separate job publishes successful default-branch builds only when Pages is already configured; `pages: false` keeps artifact-only delivery.

The root composite action `hyunlord/lattice@<LATTICE_COMMIT_SHA>` is also available for custom build jobs. Optional `verification-script` runs consumer-specific checks only in the read-only source-build job. See [workflow examples, permissions, inputs and report schema](design/action.md). L4 deployment acceptance is recorded in the ledger.

## Explore relationships

The Explore screen filters node/edge kinds, text and facets; follows directed shortest paths or incoming/outgoing N-hop neighborhoods; and ranks connected hubs. Layers stay separate. Kind/folder groups expand into paginated members, with exact totals and complete accessible node/relationship lists. Large maps aggregate above 50 nodes; readable diagram labels, keyboard pan/zoom and explicit paging keep all 5,000-node test members reachable. A lens can derive the generic boolean node attribute `pinned` to select initial hubs; URL pins override it. See [Explore behavior and browser evidence](review/l2-explore.md).

## Read-only source repositories

Skip `init` when the source must remain unchanged. Supply the same dedicated cache path to each command:

```sh
lattice build --root /path/to/source --cache-dir /path/to/external-cache
lattice check --root /path/to/source --cache-dir /path/to/external-cache
lattice diff HEAD~1 --root /path/to/source --cache-dir /path/to/external-cache --json
lattice export /path/to/site --root /path/to/source --cache-dir /path/to/external-cache
lattice serve --root /path/to/source --cache-dir /path/to/external-cache --port 4173
```

An external `--lens` can add meaning without creating source configuration. Relative cache paths resolve from the calling directory; existing symlink ancestors are canonicalized. Graphs, extraction shards, diagnostics, snapshots, diff output and writer locks all use that directory. Explicit caches bind to one canonical repository root and reject mixed histories. Choose an empty dedicated directory when starting a new explicit cache.

Without an export destination, a cache physically outside the repository uses its sibling `<cache-dir>-site`; a cache inside the repository retains `.lattice/site` so exports are not collected as source. Custom in-repository cache files are excluded from working-input discovery and dirty observation. `init` rejects `--cache-dir` because it intentionally writes source configuration. See [external cache verification](review/l1-external-cache.md).

## Current verification

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
git diff --check
```

Node >=20 is supported; CI runs Node 20, 22 and 24. The library, CLI, static viewer and live-refresh client are checked with strict TypeScript. Authored sources live in `src/`, `cli/`, `viewer/*.ts` and `browser/`; `npm run build` emits the existing `dist/`, `bin/` and `viewer/*.js` runtime paths. Generated JavaScript is included in npm packages and excluded from Git. `@types/node` supplies development-only Node 20 API declarations; browser builds use DOM types without Node globals. bs-mobile integration is PR-only; Charter & Kin is read-only. No Graft implementation is copied. Licensed under MIT.
