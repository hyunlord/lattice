# MCP and agent configuration

`lattice mcp --root /absolute/repository` serves eight read-only graph tools and three interpretation tools over newline-delimited UTF-8 JSON-RPC on stdin/stdout. No HTTP MCP endpoint, source-code edits, network tools or subscription capability is advertised. Interpretation writes are confined to notes and an inactive draft lens; their MCP readOnlyHint is false. Generated graph/cache files are written as needed. Git remains required.

```sh
lattice mcp --root /path/to/repository --cache-dir /path/to/external-cache
lattice mcp --root /path/to/repository --viewer-url https://example.github.io/map/
lattice init --root /path/to/repository --no-global
```

## Protocol

The baseline is legacy MCP **2025-11-25**; **2025-06-18** and **2024-11-05** are also negotiated. An unsupported requested version receives the baseline in `initialize`, allowing the client to accept or disconnect. The oldest version omits tool annotations and structured content. Newer legacy responses carry identical JSON in text content and `structuredContent`. `notifications/initialized` completes readiness; `ping` is supported. Tool requests are serialized, and EOF closes the process. Invalid JSON/envelopes, unknown methods and malformed tool names produce JSON-RPC errors. Invalid tool arguments and execution failures produce `isError: true`, with freshness unknown and no stale graph payload.

The newer `server/discover` probe gets ordinary method-not-found (-32601), permitting client fallback. This implementation does not claim the 2026 protocol. See the official [legacy lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), [tool result contract](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) and [Claude client runtimes](https://code.claude.com/docs/en/mcp#mcp-client-runtimes).

## One graph and bounded results

| Tool | Query |
| --- | --- |
| `lattice_overview` | Visible-layer counts, kind and typed facet distributions, compact finding summaries, available views |
| `lattice_find` | AND-combined kind, text, tags and exact typed facet filters |
| `lattice_node` | Exact ID, attributes, incoming/outgoing/undirected relationships, counterparts, sources and findings |
| `lattice_trace` | Directed shortest path or bounded outgoing/incoming/both neighborhood |
| `lattice_matrix` | Named lens matrix or automatic kind matrix, cells and source evidence |
| `lattice_findings` | Rule/severity/node/gate filters, metrics, intent and implementation |
| `lattice_diff` | Git-ref comparison projected through the same semantic identities as web Changes |
| `lattice_freshness` | Strict observation, previous/current fingerprints, rebuilt status and timings |

Every valid tool invocation calls the same `FreshRepository.ensureFresh()`. It reads eligible input contents, lens and repository metadata; unchanged observations reuse the in-memory graph. Changed content or replaced cache artifacts trigger incremental extraction and full reference/lens recomputation. Same-size edits with preserved mtimes are detected. The first request in a process rebuilds from reusable extraction shards. Cache locks serialize writers across processes; a conflicting writer produces a tool error to retry. Observation is a point-in-time filesystem read, not an atomic transaction spanning concurrent source edits.

The result includes graph hash, repository commit/source fingerprint, observation time, content-hash mode, observation/rebuild duration and total tool time. These timings do not establish L5 thresholds. A failed observation/build never falls back to the previous graph marked current. Operational errors intentionally avoid echoing arbitrary source/exception contents; run `lattice build` for local diagnostics.

Default paging is 50, maximum 200; `offset` and `nextOffset` support later pages. Every page reports `total`, `truncated`, `offset` and `limit`. Nested attribute/metric arrays are also page objects; scalar types remain unchanged. Overview contains summary findings; use `lattice_findings` for evidence. Text search follows web Explore semantics. An omitted layer uses the viewer's default; node detail can infer the node's layer. Hidden kinds and layer totals follow viewer scope. Cross-layer counterparts remain separate records.

Shared pure projections live in `src/query/`; viewer TypeScript re-exports them and the build copies their compiled browser-safe code into the flat static asset directory. MCP uses those same functions for traversal, matrix projections and semantic history. CLI diff additionally retains its original raw record-ID diff in cache; MCP/web Changes normalize identity namespaces using layer, kind and original ID. Both comparison paths read Git objects, never check out the consumer repository.

Links default to `http://127.0.0.1:4173/`; start `lattice serve` separately. `--viewer-url` sets an explicit public base and does not publish or synchronize that site. Compare the returned graph hash with the page to establish identical evidence. Clean saved snapshot pairs get comparison links; dirty comparisons return `link: null` and explain why.

## Init preservation and limitations

Init validates the lens and every destination before writing. It installs managed AGENTS instructions, a Claude skill, `.mcp.json`, and `.codex/config.toml`. The skill instructs agents to inspect overview/findings before work and compare against the starting revision afterward. Existing Graft/unrelated configuration bytes are retained; reruns are byte-stable. Unmanaged Lattice entries, malformed/duplicate configuration and symbolic-link destinations are refused. A multi-file init is not a crash-atomic filesystem transaction; operational I/O failures can leave earlier successful writes, and a retry is safe after correcting the cause.

The generated process uses an absolute Node executable, absolute installed Lattice CLI, and explicit repository root without a shell. Keep that installation at its configured path. A per-root `lattice_<hash>` Codex name is shared by project/global entries. Default init registers that repository globally; multiple repositories therefore remain available to global clients. Use `--no-global` for project-only registration with no home writes. Codex can require project trust before loading project configuration. Restart clients after setup. See official [Codex MCP settings](https://developers.openai.com/codex/mcp/) and [Claude project scope](https://code.claude.com/docs/en/mcp#project-scope).

No TOML dependency is added. The conservative editor supports normal table headers, quoted/bare dotted keys, strings, booleans, numbers, arrays and inline tables. Multiline strings, datetimes and arrays of tables are refused before any writes. Unsupported valid syntax is reported as unsupported rather than rewritten speculatively.

## L7 interpretation tools

| Tool | Behavior |
| --- | --- |
| `lattice_interpretation_context` | Paginated modules/folders with exact source hashes, excerpts, notes and stale status |
| `lattice_write_interpretation` | Validate current source hashes and persist attributed AI notes; never changes source code |
| `lattice_draft_lens` | Validate an inactive YAML lens draft; existing draft replacement requires expectedHash |

[Storage, agent-init workflow, read-only source override and optional external CI runner](../review/l7-interpretation.md) define the interpretation contract.
