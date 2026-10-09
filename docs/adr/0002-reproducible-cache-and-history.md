# ADR 0002: Separate graph identity from observation metadata

Status: Accepted for L0 design; implementation pending.

## Context
A graph must be deterministic, incrementally maintained, fast to query, and meaningfully comparable across commits. Filesystem time and absolute paths cannot determine its identity.

## Decision
Hash UTF-8 content with SHA-256. Canonical JSON recursively sorts object keys, keeps semantic array order, and sorts graph collections by stable identity. Graph hash covers exactly `{schemaVersion, nodes, edges, facets, findings, views, lensDigest, adapterVersions, inputDigests}` after canonicalization. It excludes its own `hash`, the repository/observation envelope, snapshots/history catalogs, cache state, and artifact paths. Before hashing, strip `revision` and generated URLs from every nested source record in nodes, edges, facets, findings and views; retain path, line, pointer and content digest. Input digests are sorted relative-path/content-hash pairs. Identical source must hash identically with empty or populated history caches. Exclude observation time, duration, mtime, absolute checkout path, and source commit from semantic identity; keep commit and dirty provenance in the envelope. Provenance line/field changes remain graph changes.

Store input manifests, per-file extraction shards, graph, and commit snapshots in `.lattice/cache/`. Include untracked eligible inputs, additions, deletions, renames and lens changes. Exclude generated/cache/VCS/dependency/build outputs. Cached parse shards key on content plus adapter version; reference/facet/code-link dependencies are recomputed or invalidated when their inputs change. Do not reuse a derived classification because only its data file is unchanged.

A persistent service maintains a watched manifest for fast checks; cold checks still verify inputs. Stat signatures are a performance hint, never an unconditional freshness proof. Strict content verification must detect same-size, preserved-mtime edits. Track warm/cold/strict timings separately; never satisfy the 50ms gate by checking only git HEAD. An explicit stale/unknown state is preferable to fabricated freshness.

`diff <ref>` resolves a commit and reads its tree without checking out or modifying the caller's worktree. Historical refs use the historical lens when present. If absent, use an explicitly labeled current-lens projection, include its hash and never imply a historical lens existed. Commit snapshots are stored by commit + lens/adapter identity; current dirty state is separate. A git-less directory has a content snapshot and no invented commit.

Writers use a lock, atomic temporary-file rename and schema/hash validation. Interrupted builds preserve the previous valid graph; readers await rebuild or return a visible error, never silent stale success. Exported history is bounded and includes snapshot manifests needed for browser comparisons.

## Alternatives
- Full parsing on each MCP call: rejected; unnecessary repeat work.
- mtime-only cache: rejected; can silently miss changes.
- Whole-repo checkout for diff: rejected; mutates user work and cannot safely serve concurrent calls.

## Consequences
Performance gates include strict correctness fixtures and a reproducible file count, hardware, Node version, source commit and measurement mode. Git metadata changes can refresh the envelope without changing the semantic graph hash.
