# L9 structure and logic analysis

Build packages come from Cargo workspaces, Gradle settings and local convention plugins, npm workspaces, Go modules, Python package metadata, Maven modules, MSBuild projects and Unity assembly definitions. Package membership follows source roots and the nearest unambiguous owner. Declared dependencies retain scope, condition and declaration evidence; file imports do not multiply into every file in the target package.

The analyzer reads project data without executing project scripts, tasks, plugins or dependency installation. MSBuild handles bounded literal substitutions, ancestor imports and whitelisted pure path operations. Recognized SDK defaults retain their upstream rule provenance. Conditional or dynamic expressions that cannot be established from these inputs remain diagnostics; declaration evidence is not an evaluated build configuration.

The CLI uses the [documented AST parser](l9-parser-decision.md) for JS/TS, Python, Go, Rust, Java/Kotlin and C#. Function identities include their source position. Lexical scope, explicit imports, unique static owners and package bindings constrain call resolution. Overloads, unknown receivers, reassigned bindings and parser errors cannot silently become exact calls. Source hash changes invalidate cached facts. Verified Graft symbols and AST symbols share identities only when their source locations and hashes agree unambiguously.

Entrypoints carry the rule and source line: language main functions, package exports/bin targets, Python console scripts and main guards, Android lifecycle declarations, route registration and Spring markers. Framework markers describe possible entrypoints, not proof that a particular invocation occurs. Each function exposes callers and callees; bounded traversal reports its depth, cycles and truncation.

Static export writes an overview and content-addressed logic pages. The first screen does not download the canonical graph. Bounded entrypoint, function and call requests validate graph identity. Node detail and its historical evidence use separate bounded packets; other legacy aggregate views can still load the graph explicitly. Evidence remains lazy and source-bound. Unsupported source languages retain file inventory with a visible notice rather than fabricated relationships.

Validation uses the [frozen L9 benchmark protocol](../benchmarks/l9/README.md). Keep partial results, source-declaration versus evaluated-build evidence, and agent-only comprehension measurements distinct. The product coverage gate is90%; the complete large-repository build budget is300seconds. Neither a cached rebuild nor a small fixture substitutes for those measurements.

### Bounded node detail transport

`details/index.json` and `details/snapshots/<snapshot-id>/index.json` bind every derived request to the graph hash and complete repository metadata. Existing historical packets are emitted inside the validated snapshot callback. Live serving also emits a newly persisted clean snapshot from the same current graph, before publishing its generation; it does not reread or retain another historical graph. The graph hash alone is insufficient because repository commit metadata is intentionally excluded from that semantic hash; the data directory additionally hashes the binding and configured detail presentation.

ID and semantic node-identity lookups use tagged keys, the existing 256-way lookup bucket function, and sorted 128-entry ranges. Missing keys mean an absent node; missing, malformed or mismatched files mean a failed observation rather than absence. A packet has at most 128 fragments and 256KiB. References list exact fragments; oversized selected attributes are reconstructed without truncation. Every loaded packet must match the expected graph hash, repository commit and source fingerprint before its records are used.

Relations retain their exact direction and count, with 20 edges per page and the endpoint names/kinds/layers needed to render links. Configured human relationship groups retain their labels, direction, order and pages; lightweight label records resolve referenced summary values without loading unrelated nodes. Facets and findings remain exact. Findings with many targets are stored once and referenced from per-node pages, avoiding quadratic duplication of target IDs and metrics. Existing deferred evidence files remain accessible. Current and historical data with the same binding share deterministic paths and disk deduplication. Scoped packets must never be installed as a complete repository graph in the viewer.

Verification: oversized Unicode attributes, colliding lookup buckets, all pages of 45 exact relations, incoming/undirected self-loop behavior, evidence reconstruction, unknown IDs, distinct source-bound historical paths and shared multi-target finding payloads. Full export still validates tampered snapshot hashes and preserves the prior atomic site on failure. Actual large export/browser verification is required after final integration; small fixtures alone do not prove its heap or interaction behavior.

### Fresh MCP observations

MCP refresh serializes asynchronous observations and streams artifact hashes. A rebuild validates historical snapshots before constructing the next graph, then uses the byte-bound validation proof during persistence without retaining the previous decoded graph. Failed observations and same-size cache corruption still propagate or trigger a fresh build; the queue never caches a failed response as current evidence. The first tool request may include repository rebuilding. Warm query timing and first-request latency must be reported separately.

### Anonymous callable boundaries

Calls inside an anonymous function or lambda without its own mapped callable identity are omitted. They must not inherit the containing named function as a caller. The same boundary isolates nested definitions, bindings and import/export discovery. Mapped JavaScript arrow/function expressions and named nested functions retain their own identities. The `logic-2` semantic parser version invalidates earlier cached facts; this deliberately trades recall for caller correctness.

### Dispatch certainty and benchmark names

Java, Kotlin and C# instance-method declarations are estimated candidates when the available facts cannot prove nonvirtual dispatch. Named local functions require the same lexical owner as their parent; a method of a locally declared class is not a local function. Static calls retain their existing exact-resolution rules. Default calls and flows exclude estimated candidates; an explicit includeEstimated option exposes them. Missing modifier facts can conservatively classify even private/final/nonvirtual methods as estimated, so exact and estimated recall are reported separately.

The user-authorized exception for the benchmark name `click` covers standard API use only. Repository identifiers, paths, comments and conditional branches receive no exception. The guard recognizes literal event arguments to addEventListener/removeEventListener and the zero-argument .click() invocation, and rejects other occurrences; ordinary runtime terminology does not authorize a repository-specific branch.
