# Lattice

A repository-neutral system map for people and agents. Deterministic extraction creates one graph for a static browser viewer and MCP tools; declarative lenses add repository-specific meaning.

**Status: first published map is live; document-aware builds are available.** JSON/CSV/Markdown/code → optional declarative lens → CLI build/export → home/list/node detail. Full L1/L2 and later milestones remain pending. See [delivery scope and evidence](docs/review/first-published-map.md).

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
node bin/lattice.mjs build --root /path/to/repository
# Optional domain interpretation:
node bin/lattice.mjs build --root /path/to/repository --lens /absolute/path/to/lens.json
node bin/lattice.mjs export /path/to/site --root /path/to/repository
node bin/lattice.mjs check --root /path/to/repository
node bin/lattice.mjs diff HEAD~1 --root /path/to/repository --json
node bin/lattice.mjs serve --root /path/to/repository --port 4173
```

`check` rebuilds from current inputs and evaluates findings with an explicit `gate`. Exit codes are 0 when all gates pass (or none are configured), 1 for failed or unknown gates, and 2 for invalid configuration or build errors. Informational findings without gates do not fail the command. See [gate syntax and verification](docs/review/l1-check.md).

`diff <ref>` compares a Git commit with current files, including uncommitted additions, edits and deletions. It reads Git objects without checking out the reference. Text output lists changed identities; `--json` returns full before/after records. Historical lenses are preserved, and using a current lens on an older tree is explicitly labeled. Clean builds and comparisons retain commit snapshots; export includes their catalog and graphs. See [history evidence and limits](docs/review/l1-history.md).

Builds reuse raw per-file extraction when content, path, selection and adapter implementation match. Every build still verifies file contents and recomputes references and lens results. CLI counters show parsed/reused files; `.lattice/cache/build.json` and `inputs.json` record the latest counters and input manifest. See [incremental build verification](docs/review/l1-incremental.md).

`serve` runs on `127.0.0.1:4173` and checks selected file contents every 500 ms after the previous check completes. Source changes refresh the browser while retaining its route and filters. Failed updates display an explicit stale-map message and recover after correction. Ctrl-C stops the server. See [local serving evidence and limits](docs/review/l1-serve.md).

`export` builds a complete staging directory before replacing its destination. Repeated exports replace Lattice-owned output and remove obsolete assets. A nonempty unowned directory is refused unless `--force` is explicit; use a dedicated output directory. The replacement uses two directory renames, so a static server may observe a brief missing-directory interval. Use `serve` for a live local map.

Use [the bs-mobile lens](examples/bs-mobile/lens.json) for that repository, or a JSON lens with your own file patterns and rules. Use `serve` for local source watching, or host the export directory with any static HTTP server. Installed packages provide the `lattice` command. Git is required. Without a lens, build discovers JSON, CSV, Markdown and code files, extracts records/headings/ADR metadata and resolves references/document links plus static JS/TS/Python imports. A default `.lattice/lens.json` is used when present. Explicit lenses limit input to their patterns. Other recognized code languages provide file-only modules. YAML and optional Graft import are still pending. See [document extraction evidence and limits](docs/review/l1-markdown.md).

[Open the published bs-mobile map](https://hyunlord.github.io/bs-mobile/).

See [module extraction evidence and limits](docs/review/l1-modules.md).

## Current verification

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
git diff --check
```

Node >=20 is supported; CI runs Node 20, 22 and 24. The strict library test/format/typecheck pipeline is present; the remaining CLI commands are still L1 deliverables. bs-mobile integration is PR-only; Charter & Kin is read-only. No Graft implementation is copied. Licensed under MIT.
