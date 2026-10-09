# Lattice

A repository-neutral system map for people and agents. Deterministic extraction creates one graph for a static browser viewer and MCP tools; declarative lenses add repository-specific meaning.

**Status: L0 design under review.** No CLI, viewer, MCP server or reusable action is released yet. Product acceptance remains pending; documentation CI proves documentation integrity only.

- [Original v0.1 brief](docs/design/brief-v0.1.md)
- [Architecture and lens contract](docs/design/lattice-v0.md)
- [Viewer wireframes](docs/design/viewer.md) and [design system](DESIGN.md)
- [Prototype content oracle and source corrections](docs/reference/bs-mobile-oracle.md)
- [L0–L5 execution plan](.omo/plans/lattice-v0.md)
- [Requirement and evidence ledger](docs/review/acceptance.md)
- [Contributor boundaries](AGENTS.md)

## Current verification

```sh
node tools/check-docs.mjs
git diff --check
```

Node 24 LTS is the target. The full npm/TypeScript CLI and its test/format/typecheck pipeline arrive in L1. bs-mobile integration is PR-only; Charter & Kin is read-only. No Graft implementation is copied. Licensing is tracked separately before a license or public package release is claimed.
