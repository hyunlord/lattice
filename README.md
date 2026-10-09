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
```

Use [the bs-mobile lens](examples/bs-mobile/lens.json) for that repository, or a JSON lens with your own file patterns and rules. Serve the export directory with a static HTTP server. Installed packages provide the `lattice` command. Git is required. Without a lens, build discovers JSON, CSV, Markdown and code files, extracts records/headings/ADR metadata and resolves references/document links plus static JS/TS/Python imports. A default `.lattice/lens.json` is used when present. Explicit lenses limit input to their patterns. Other recognized code languages provide file-only modules. YAML, optional Graft import and Git history are still pending. See [document extraction evidence and limits](docs/review/l1-markdown.md).

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
