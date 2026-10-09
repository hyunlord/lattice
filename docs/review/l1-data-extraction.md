# L1 JSON/CSV extraction evidence

This is a second incremental L1 slice under [#5](https://github.com/hyunlord/lattice/issues/5), not L1 completion.

## Library behavior

`extractJson({path,text,contentHash}, recordsPointer?)` reads an object or object array. An optional JSON pointer selects a nested named collection. The default is the root, not recursive promotion of every nested object. Every field retains its absolute escaped pointer and starting/ending source line. Malformed JSON, duplicate decoded keys, unsafe keys, non-finite numbers and depth over 128 fail with `DataInputError`.

`extractCsv({path,text,contentHash})` preserves strings and supports BOM, CRLF/LF/CR, quoted delimiters/newlines and escaped quotes. Empty/duplicate/unsafe headers, mismatched widths and malformed quotes fail. Both adapters require a relative POSIX source path and supplied SHA-256 digest, bound UTF-8 text to 10 MiB and selected records to 100,000. The caller computes the digest; adapters validate its format, not its agreement with the bytes.

`resolveRecords(records)` connects exact string ID matches with field-path edge kinds and precise field sources. It skips the record's own identity field. Unmatched `*Id`/`*Ids` fields produce inferred unresolved diagnostics; unmatched prose does not. Duplicate aliases receive deterministic path/pointer identities; ambiguous references remain unconnected and diagnosed. Reversed record order gives the same graph. These diagnostics are not yet classified as external versus broken internal references by repository discovery/lenses.

## Executed evidence

Node 24.21.0: `npm run check` passes 23 tests, formatting, typechecking, build and documentation checks. `npm run test:package` packs and installs the public library in a temporary project. The boundary suite exercises large input, 10,000 records, excessive record counts, source paths, nested pointers, invalid JSON/CSV, duplicate aliases and generated-ID collisions.

The following read-only command ran against bs-mobile commit `90c8ca34f9de6755afca01d28c8eff4f2eae20be`:

```sh
npm run build
node tools/extract-smoke.mjs /Users/rexxa/orca/workspaces/bs-mobile/seagrass \
  data/weapons data/tools data/charters data/items \
  data/evolutions data/enemies data/vassals
```

It extracted counts **30/40/16/60/30/24/16**, totaling **216 nodes and 205 exact-reference edges**. The selected folders leave **208 unresolved-reference diagnostics**; the scan does not include all repository IDs. The graph hash is `343a32ecf40e1f5f06d159395a1a7cb1aad7a8e12a0a8c4ee51c1aa169f2209d`, reproduced after reversing record order. This verifies actual source extraction and graph construction, not the prototype's classifications/findings or runtime code support.

Independent review identified a late record-limit check. The parser now rejects before reading the 100,001st selected item; root and nested malformed-tail regressions passed. The read-only smoke helper also resolves directory symlinks before checking the repository boundary.

## Pending

YAML, Markdown/code/git adapters, automatic discovery, configurable ID/name fields, lens evaluation, cache/diff, CLI, viewer, MCP and publication remain pending. No source repository was modified. No runtime dependency was added. Earlier foundation evidence describes its historical slice; this document adds extraction evidence without retroactively changing those claims.
