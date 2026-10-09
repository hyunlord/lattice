# L1 derived expression ordering

The lens contract requires an acyclic dependency graph, independent of declaration order. Previously `applyLens` evaluated declarations in source order, so a forward reference became missing. Parsing now compiles graph and node plans in stable dependency order. Duplicate identifiers, unknown dependencies, cycles and graph-to-node dependencies produce source-located errors.

Local `let` bindings remain lexical: initializers see prior bindings, while literal payloads are not dependency expressions. Kind/layer applicability and the existing pre-edge evaluation phase are preserved. No package dependencies or domain-specific operators were added.

## Verification

- `npm run check`: strict types, formatting, 48 tests and documentation checks passed after integrating revision namespaces from PR17.
- `npm run test:package`: installed library/CLI, extraction, init, check exit codes, historical diff, incremental rebuild, export and serve scenarios passed.
- The focused feature scenario resolves forward and reversed graph/node declarations to 42 while retaining kind/layer restrictions and lexical shadowing. Invalid dependency scenarios identify the responsible path, line and pointer.
- The actual bs-mobile v1.1 source used by PR151 was projected with both engines. Nodes, edges, facets, findings and views are deeply equal; the consumer verification remains 0/0/2/2/0/3.

This fulfills only dependency ordering within L1-06. Code-link extraction/evaluation and the complete L1 gate remain pending. It does not establish runtime behavior of any consumer application.
