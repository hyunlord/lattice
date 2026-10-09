# L1 lens input scope

Top-level include/exclude patterns now constrain normal adapter inputs and code-link source inputs before content is read. This repairs a previously ignored part of the lens contract; default lenses without these fields retain their selection behavior. One shared predicate preserves generated-directory exclusions and prevents code support from bypassing the lens scope.

## Evidence

- The installed CLI scenario first reproduced the defect: excluded malformed JSON was still parsed and failed the build. It now passes with only the included record selected.
- The scenario checks excluded code inputs, generated-directory exclusion, empty versus omitted include, scope-change refresh and unchanged graph hash after excluded edits while repository dirty state stays fixed. Malformed scope values report the actual JSON/YAML lens path, line and field pointer.
- `npm run check` passes strict types, formatting, 59 tests and documentation checks. The installed package suite includes the new scenario alongside existing adapters, code support, history and export scenarios.
- Actual `/Users/rexxa/lattice` source at base `5068fa4738a5671be32099c495db57614901354f`, with existing local agent changes, was built using an external manifest-only lens. Include `package*.json` and exclude `package-lock.json` yielded one node sourced only from `package.json`, zero edges and zero diagnostics. No excluded lockfile input was retained.
- Actual build/export graph hashes matched `e70b80ea7dea8c43bda303f91d7991f075d58dd276b1d0d574a9221a5a4279f0`. This is a dirty-working-tree CLI observation, not a clean-commit or viewer acceptance claim.

No dependencies, domain rules, consumer source changes or UI changes were added. Full lens schema/expression compliance and L1–L5 acceptance remain pending.
