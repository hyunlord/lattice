# L1 lens schema validation

JSON and YAML lenses now validate the current configuration vocabulary before normalizing rules or reading selected data. Validation covers kinds/selections, synthetics, derived declarations, code links, facets, edges, findings/gates, views and presentation. Expression validation checks supported operators and operands even in rules with no matching records. Errors identify the lens path, line and escaped field pointer; missing fields use their closest authored parent.

The validator preserves open kind/attribute names, literal payloads, collection selectors, optional defaults, separate declaration namespaces and existing dependency compilation. Unknown code-support rule names are configuration errors. Missing ordinary variable reads and absent/non-numeric gate metrics retain their existing missing/unknown behavior. Data-dependent edge targets, matrix dimensions and expression result types are still evaluated against actual records.

## Evidence

- `npm run check`: strict source typecheck, formatting, 71 tests and documentation pass. Three focused schema cases cover unused rules, compatibility and the root mapping contract. An existing description fixture now uses unique finding IDs; its assertions are unchanged.
- The CLI scenario failed against base `901e783d286b3b679550eaf93eb111f065be3774`: it reported malformed selected JSON while silently accepting an unused facet expression's misspelled operand. The candidate reports the exact YAML expression field first, preserves the prior cached graph, and recovers after correction.
- Valid non-game YAML configuration uses kinds obtained from data, runs a passing gate, materializes a table and exports the same graph hash. Both shipped bs-mobile JSON/YAML example lenses parse successfully.
- The actual bs-mobile D3 v1.1/runtime projection remains byte-identical to that base: 443 nodes, 800 edges, 1,140 facets, 15 findings. No consumer source changed.
- Independent read-only review approved; 12 focused existing/schema tests passed in that review.
- Complete installed-package smoke passes, including the existing input-scope diagnostic wording and new schema scenario.

This closes the static schema part of L1-06 alongside the existing kinds, fields, expression and edge evidence. L1 full typing and aggregation coverage remain pending; this is not full L1 or viewer acceptance.
