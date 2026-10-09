# Lattice

A repository-neutral system map for people and agents. Deterministic extraction creates one graph for a static browser viewer and MCP tools; declarative lenses add repository-specific meaning.

**Status: L0 merged; L1 core foundation implemented.** The ESM graph library can be built and tested; the CLI, viewer, MCP server and reusable action remain pending. See [foundation evidence](docs/review/l1-foundation.md).

- [Original v0.1 brief](docs/design/brief-v0.1.md)
- [Architecture and lens contract](docs/design/lattice-v0.md)
- [Viewer wireframes](docs/design/viewer.md) and [design system](DESIGN.md)
- [Prototype content oracle and source corrections](docs/reference/bs-mobile-oracle.md)
- [L0–L5 execution plan](.omo/plans/lattice-v0.md)
- [Requirement and evidence ledger](docs/review/acceptance.md)
- [Contributor boundaries](AGENTS.md)

## Current verification

```sh
npm ci --ignore-scripts
npm run check
npm run test:package
git diff --check
```

Node 24 LTS is the target. The strict library test/format/typecheck pipeline is present; the complete CLI is still an L1 deliverable. bs-mobile integration is PR-only; Charter & Kin is read-only. No Graft implementation is copied. Licensing is tracked separately before a license or public package release is claimed.
