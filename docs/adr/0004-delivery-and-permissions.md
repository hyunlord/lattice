# ADR 0004: Publish static maps and isolate consumer permissions

Status: Accepted; delivery implemented and verified through [L4 evidence](../review/l4-action.md).

## Decision
Ship an npm CLI, self-contained static export, and stdio MCP server. Use hash routes so every exported node/view/comparison URL works on GitHub Pages without server rewrites. Serve mode binds to loopback and watches eligible files; static exports make no network or CDN dependency. Untrusted repository text is escaped.

The L2 gate explicitly requires a bs-mobile Pages URL, although reusable automation is L4. At L2, add a minimal Pages publication workflow through a bs-mobile PR; at L4 replace its build/check/export integration with the reusable action, without claiming L4 early. Failed Pages capability is reported and falls back to an Actions artifact plus local serve; that fallback does not count as the specifically requested public L2 URL.

L4 separates untrusted PR build/export from privileged publication/comments. Do not execute PR code under `pull_request_target`; fork comments may be unavailable with read-only tokens. Privileged summarization consumes validated data, never a shell/script from an artifact. Document required Pages and PR permissions, and emit artifacts even when Pages is unavailable. No request for broad credentials merely to bypass a platform limit.

`init` edits only managed regions, preserves existing Graft and unrelated configuration, supports project-only `--no-global`, and does not replace whole config files. Unparseable existing configuration fails without partial writes. Read-only consumers use external lens/cache/output locations; Charter & Kin receives no writes.

L10 maintenance: a nonempty file-lookup bucket that fits the existing bounded page budget is stored directly as `{files: rows}` instead of a range descriptor pointing to its sole page. Larger buckets retain ranged pages; empty buckets retain the empty range array. This removes redundant index metadata without changing record order, evidence, source bindings, direct references, or the 256KiB encoded/decoded limits. The browser and CLI readers accept both tagged inline and historical plain/gzip ranged indexes. Older readers do not understand the tagged form; publish generated data with its matching viewer and use the updated CLI for offline reconstruction. No asset-loader, dependency or initial overview-fetch contract changes.

## Consequences
L2 publication needs a narrowly scoped consumer PR before L4 automation. L5 agent acceptance requires actual Codex and Claude Code sessions listing and calling tools; a mock client is protocol testing only. Licensing remains an explicit decision issue until approved; do not claim MIT distribution authority from a recommendation alone.
