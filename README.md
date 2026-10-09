# Lattice

A repository-neutral system map for people and agents. Deterministic extraction creates one graph for a static browser viewer and MCP tools; declarative lenses add repository-specific meaning.

**Status: first published map is live; document-aware builds are available.** JSON/YAML/CSV/Markdown/code → optional declarative lens → CLI build/export → home/list/node detail. Full L1/L2 and later milestones remain pending. See [delivery scope and evidence](docs/review/first-published-map.md).

- [Original v0.1 brief](docs/design/brief-v0.1.md)
- [Architecture and lens contract](docs/design/lattice-v0.md)
- [Viewer wireframes](docs/design/viewer.md) and [design system](DESIGN.md)
- [Prototype content oracle and source corrections](docs/reference/bs-mobile-oracle.md)
- [Requirement and evidence ledger](docs/review/acceptance.md)
- [Contributor boundaries](AGENTS.md)

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

`init` creates a generic YAML lens and `.lattice/.gitignore` entries for cache/site output. Repeating it preserves an existing lens and unrelated files. It writes no home configuration; agent wiring remains L3 work. YAML 1.2 mappings, sequences, multiline scalars, multiple documents and bounded aliases carry original source lines. See [YAML/init evidence and format limits](docs/review/l1-yaml-init.md).

`check` rebuilds from current inputs and evaluates findings with an explicit `gate`. Exit codes are 0 when all gates pass (or none are configured), 1 for failed or unknown gates, and 2 for invalid configuration or build errors. Informational findings without gates do not fail the command. See [gate syntax and verification](docs/review/l1-check.md).

`diff <ref>` compares a Git commit with current files, including uncommitted additions, edits and deletions. It reads Git objects without checking out the reference. Text output lists changed identities; `--json` returns full before/after records. Historical lenses are preserved, and using a current lens on an older tree is explicitly labeled. Clean builds and comparisons retain commit snapshots; export includes their catalog and graphs. See [history evidence and limits](docs/review/l1-history.md).

All six CLI commands accept `--json` for automation. Build/check report graph identity, extraction counters, diagnostics and gate results; init/export report their output paths. Serve emits newline-delimited ready/rebuild/error/recovery/shutdown events. Check retains exit 1 for failed or unknown gates, and operational errors exit 2 with a JSON error. Diff preserves its existing deterministic payload. See the [structured output contract](docs/design/cli-json.md).

Builds reuse raw per-file extraction when content, path, selection and adapter implementation match. Every build still verifies file contents and recomputes references and lens results. CLI counters show parsed/reused files; `.lattice/cache/build.json` and `inputs.json` record the latest counters and input manifest. See [incremental build verification](docs/review/l1-incremental.md).

`serve` runs on `127.0.0.1:4173` and checks selected file contents every 500 ms after the previous check completes. Source changes refresh the browser while retaining its route and filters. Failed updates display an explicit stale-map message and recover after correction. Ctrl-C stops the server. See [local serving evidence and limits](docs/review/l1-serve.md).

`export` builds a complete staging directory before replacing its destination. Repeated exports replace Lattice-owned output and remove obsolete assets. A nonempty unowned directory is refused unless `--force` is explicit; use a dedicated output directory. The replacement uses two directory renames, so a static server may observe a brief missing-directory interval. Use `serve` for a live local map.

Use [the bs-mobile lens](examples/bs-mobile/lens.json) for that repository, or a YAML/JSON lens with your own file patterns and rules. Use `serve` for local source watching, or host the export directory with any static HTTP server. Installed packages provide the `lattice` command. Git is required. Without a lens, build discovers JSON, YAML, CSV, Markdown and code files, extracts records/headings/ADR metadata and resolves references/document links plus static JS/TS/Python imports. A single `.lattice/lens.yaml`, `.lattice/lens.yml` or `.lattice/lens.json` is used when present; multiple defaults require an explicit `--lens`. Explicit lenses limit input to their patterns. Other recognized code languages provide file-only modules. Unity tagged YAML is not supported. Optional Graft import uses validated source hashes and falls back to standalone extraction. See [document extraction evidence and limits](docs/review/l1-markdown.md).

[Open the published bs-mobile map](https://hyunlord.github.io/bs-mobile/).

See [module extraction evidence and limits](docs/review/l1-modules.md).

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

Without an export destination, a cache physically outside the repository uses its sibling `<cache-dir>-site`; a cache inside the repository retains `.lattice/site` so exports are not collected as source. Custom in-repository cache files are excluded from working-input discovery and dirty observation. `init` rejects `--cache-dir` because it intentionally writes source configuration. See [external cache verification](docs/review/l1-external-cache.md).

## Current verification

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
git diff --check
```

Node >=20 is supported; CI runs Node 20, 22 and 24. The strict library test/format/typecheck pipeline is present; the remaining CLI commands are still L1 deliverables. bs-mobile integration is PR-only; Charter & Kin is read-only. No Graft implementation is copied. Licensed under MIT.
