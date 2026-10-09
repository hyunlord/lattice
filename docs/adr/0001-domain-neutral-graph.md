# ADR 0001: Keep repository meaning in a declarative lens

Status: Accepted for L0 design; implementation pending.

## Context
The same tool must explain bs-mobile, a TypeScript content repository, and an unconfigured non-game repository. A port of the prototype would entrench domain-specific UI and counts.

## Decision
Use one versioned, serializable graph and a declarative JSON-compatible lens stored as YAML. A pure core owns normalization, stable identity, reference joins, a bounded expression evaluator, aggregation, findings, and diffs. Adapters own parsing and provenance. CLI, viewer, and MCP consume the same materialized graph and query primitives. No domain-specific branches or node IDs in core/viewer code. Numeric regression expectations live only in consumer/example tests.

Expressions are data (not JavaScript); missing fields and unknown code support stay explicit. Reject unknown keys/operators. No `eval`, repository code execution, shell interpolation, or default `.lattice/lens.ts` loading. The optional TypeScript extension in the brief is unnecessary for v0 acceptance and reserved for a separately trusted future extension contract.

## Alternatives
- A custom page per repository: rejected; cannot satisfy zero-config screens.
- Run arbitrary TypeScript lens code: rejected; exposes untrusted PR execution and nondeterminism.
- Language-aware AST for every language: rejected for v0; file/module extraction and bounded source evidence cover the stated minimum.

## Consequences
The lens language must express joins, effective-value precedence, grouping and evidence predicates; fixture tests must prove this with the real bs-mobile YAML lens. Renderer templates may differ by generic view type, never domain. Static source matches must not be reported as observed gameplay.
