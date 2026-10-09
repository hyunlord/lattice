# ADR 0005: use a maintained YAML syntax parser

Status: accepted for L1 implementation, 2026-10-10.

The approved v0.1 brief requires YAML records and `.lattice/lens.yaml`, including multiline scalars, multiple documents and source locations. A JSON-only fallback or hand-written YAML subset would not meet that contract. Use exactly `yaml@2.9.1` as the syntax parser; Lattice continues to own record selection, JSON-compatible value validation, provenance and lens interpretation.

Official npm metadata declares Node >=14.6, no runtime dependencies and the ISC license. This is compatible with the project's Node >=20 / 20,22,24 CI and MIT project license; the installed dependency retains its own ISC notice. Sources: [package metadata](https://registry.npmjs.org/yaml/2.9.1), [official documentation](https://eemeli.org/yaml/).

Use the YAML 1.2 core schema and AST ranges. Duplicate keys, unsupported tags, alias cycles, non-JSON values and unsafe keys are errors with source locations. Bound expansion rather than enabling unlimited aliases. Preserve alias-use provenance. Unity tagged serialization remains a separate deferred adapter. No Graft code is imported or copied.
