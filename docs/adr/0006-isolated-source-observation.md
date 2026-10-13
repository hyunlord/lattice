# ADR 0006: Isolate strict source observation from resident query graphs

Status: Experimental; correctness checks and performance acceptance are separate.

## Decision

Async MCP freshness uses one owned, lazy Node worker for source observation. Every request runs the unchanged full observer: fresh Git inventories, source and configuration checks, speculative inventory reconciliation, and final file and ancestor witnesses. A response contains only the source fingerprint, checked-input count and observation mode, bound to a request and worker generation. No source text, graph, lens, environment values or exception details cross the response boundary.

The parent still verifies graph.json and presentation.json with ArtifactDigests and retains graph/query state. A matching source summary alone never authorizes a cache hit. Snapshot preparation, locking, persistence and artifact recording remain the existing parent operations; this does not add independent snapshot verification.

On a cold or stale result, the parent takes a new full local observation with an ephemeral options identity and builds exclusively from it. The worker summary is not reused as rebuild provenance. The build result does not retain that options identity, source reader or observation; it retains graph, presentation, coverage, media and extraction records. This allows the temporary parent source cache to become collectible but does not guarantee low peak memory. The synchronous API remains local.

Worker generations bind options, cwd and a captured environment snapshot. Environment values are not logged. Mutations during a request reject it; later requests restart with the new context. Parent graph generations also invalidate pending proofs after a synchronous publication or disposal. Worker failure, malformed/duplicate replies and unexpected exits reject the request, retire that worker and permit only a later explicit request to recover. No automatic retry or stale fallback masks failure.

The MCP handler owns an async dispose method; stdio disposes in finally after EOF or protocol failure. Programmatic users must dispose their handler. Disposal rejects pending and queued checks and awaits termination. EOF drains already accepted protocol requests before disposal, preserving stdio framing semantics. There is no new wire-level cancellation method; explicit handler disposal cancels its active observer.

## Consequences

The hypothesis is that fresh filesystem-stat allocations on a separate heap interfere less with a large resident graph. This is not a measured speedup. Startup, duplicate cold observation, total RSS, worker heap and unchanged warm p95 must be measured with the original default-heap protocol before acceptance. The prior failing measurements remain failures.

No TTL, watcher-only acceptance, skipped filesystem validation, private Node bindings, new dependency or repository-specific path is introduced. Files can still change after the last validation barrier, as before; this is not an atomic filesystem snapshot. Observer race suites, worker-boundary/lifecycle tests and installed-package stdio cleanup remain required. Revisit this experiment if isolation adds memory pressure without sufficient measured latency improvement.
