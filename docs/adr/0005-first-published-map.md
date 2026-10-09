# ADR 0005: Publish a narrow end-to-end map before widening adapters

Status: Accepted by user instruction, 2026-10-10.

The user prioritizes viewing bs-mobile in a browser over completing adapters independently. First connect JSON extraction, a declarative JSON lens for kinds/depth and three computed findings, `lattice build`, `lattice export`, home/list/node-detail screens and GitHub Pages. This explicitly changes the L1-before-L2 implementation sequence in ADR0004; it does not declare either complete milestone passed.

YAML, Markdown, code/git adapters, relationship/matrix/change screens and MCP follow this published path. The local unmerged Markdown work is preserved outside published history. Existing boundary checks are sufficient for this slice; verification focuses on actual CLI/browser/publication behavior rather than expanding defensive tests.

The user also approved MIT, Node engines `>=20` with a20/22/24 CI matrix, and keeping `.omo/` and equivalent agent work notes out of version control. Previously tracked notes are untracked and ignored, not removed from local disk. The full original brief and50-row acceptance ledger remain unchanged in scope.

The first build does full JSON scanning and supports a JSON lens subset; incremental caching, complete lens validation/grammar, zero-config discovery and other CLI commands remain pending. Exported pages label their source snapshot and regenerate on consumer source pushes. No handwritten oracle is loaded by the product. Consumer changes use a separate bs-mobile PR; Charter & Kin remains untouched.
