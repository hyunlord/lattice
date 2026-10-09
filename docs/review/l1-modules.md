# Module-aware builds

This is a bounded continuation of [L1 issue #5](https://github.com/hyunlord/lattice/issues/5), following document-aware builds. It supplies the own-module fallback portion of L1-04; the optional validated Graft importer and full L1 acceptance remain pending.

## Extraction and resolution

Code files become stable path-addressed `module` nodes, linked to their original file/line span. JavaScript/TypeScript static import declarations and re-exports, plus Python import/from statements, supply `imports` edges with statement-line provenance. Other recognized languages (including C#) supply module nodes marked `file-only`. The adapter never claims calls, code-handler support or runtime execution.

The lexer skips comments and string/template contents. Local JS/TS paths resolve against included modules: exact paths first, then `.js` → TypeScript source counterparts or extension/index candidates. Python uses repository-root and `src/` absolute layouts and explicit relative dots; a requested child module/package takes precedence over its parent fallback. Multiple candidates at the same priority remain ambiguous. Missing local targets and unresolved/bare external specifiers remain explicit diagnostics. These are source-layout joins, not emulation of package loaders, bundler aliases or Python import hooks.

Reference grammar: [ECMAScript imports](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-imports) and [Python import statements](https://docs.python.org/3/reference/simple_stmts.html#the-import-statement), checked 2026-10-10. No external implementation was copied; no dependency was added.

## Executed evidence

- Existing `npm run check` passes strict types, format, 35 tests and documentation contracts; no new boundary suite was added.
- `npm run test:package` installs the actual packed package and drives mixed JSON/CSV/Markdown/TS/Python/C# input through build/export. Five local import edges, Python relative resolution, C# file-only coverage and repeated graph equality are checked.
- Actual own source: **17 TypeScript files / 60 import-or-re-export declarations** matched the already-installed TypeScript compiler AST exactly. The compiler is used only as a verification oracle, not at runtime.
- Before adding this report, the unconfigured Lattice worktree produced **155 nodes / 195 edges**, including **30 modules / 61 import edges**. Its 55 diagnostics comprise 44 external/unresolved specifiers and 11 relative imports into ignored generated `dist/`; those are not silently linked to guessed source paths.
- Chrome at 1280×900 exercised module list → `src/adapters/code.ts` → its `code-tokens.ts` dependency → fixed-address reload. Source attributes and neighbors are inspected through the existing generic detail screen.
- The unchanged bs-mobile JSON lens still produces `f4b69e952fd1a55118c8323a6438d4583f376a085fc02dabceedcefdbe35d443` with 217 graph nodes, 310 edges, 432 facets and 3 findings. The published consumer remains pinned; no consumer changes are included here.
- Review found missed explicit Python continuations and incorrect child-package fallback precedence. Both actual extraction/resolution reproductions pass after correction.

## Remaining limits

This minimal lexer is not a complete language parser or resolver. CommonJS `require`, dynamic imports, compiler aliases, Python custom search paths, JSX/embedded-language syntax and runtime package export maps are not claimed. Type-only imports are structural dependencies, not runtime execution. Code-handler dispatch support remains separate future lens work. Graft input validation/import, YAML, Git history, incremental service and the remaining CLI/viewer/MCP work stay pending.
