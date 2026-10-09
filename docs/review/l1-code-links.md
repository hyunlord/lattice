# L1 static code support

Lens `codeLinks` now evaluates C# dispatch evidence through the same dependency plan as derived expressions. A rule can feed a node classification, finding or explicit gate. Support is persisted as an ordinary `codeSupport:<rule>` facet, so historical comparison and export retain the same values and evidence. No consumer-specific operators or dependencies were added.

The bounded source reader recognizes string switch labels inside a uniquely identified method and literal arguments to a direct call consumed by an executable `foreach` body. It distinguishes supported, unsupported and unknown; a known positive survives incomplete coverage as supported/partial. Missing files, ambiguous methods and unsupported syntax cannot establish a complete negative. Comments, string contents and uncalled local function bodies do not establish handlers. This is static evidence, not control-flow reachability, compilation or runtime execution proof.

## Verification

- `npm run check`: strict types, formatting, 53 tests and documentation checks.
- `npm run test:package`: installed CLI observes code-only inputs without adding data nodes; a code-only edit changes support, a missing source fails an explicit gate, warm/cold results agree, and historical diff/export retain the change.
- Installed provenance scenario: actual code carries its repository commit URL; an external lens diagnostic never receives a fabricated repository URL or revision.
- Independent adapter, lens and CLI reviews exercised the respective public surfaces. Review fixes cover local function bodies, literal punctuation/token identity and external-lens provenance.
- Rebuilt main `a80aab57d4dff2921a1bf4e699030d1d7bcee607` and this implementation produce deeply equal nodes, edges, facets, findings, views and presentation for the existing bs-mobile D3 v1.1 lens without code-link rules.

## Actual source observation

Read-only input: [RuntimeSystem.cs at bs-mobile `90c8ca3`](https://github.com/hyunlord/bs-mobile/blob/90c8ca34f9de6755afca01d28c8eff4f2eae20be/core/src/SowSiege.Core/RuntimeSystem.cs), content hash `5d2f9d4e7b3070df9377ab6cb3671671f4dc2e80818225fb95968a8fbcb31c20`.

`inspectCodeSurface` receives that file plus these selectors:

```json
[
  { "kind": "switch-case", "within": "Apply", "expression": "effect.Operation" },
  { "kind": "call-argument", "within": "Modify", "callee": "OwnedEffects", "argumentIndex": 1 },
  { "kind": "call-argument", "within": "PlantingPosition", "callee": "OwnedEffects", "argumentIndex": 1 }
]
```

All three selector surfaces are complete. The switch supplies twelve values at lines 164–272; the alternate paths supply `stat-add` at 121–126 and `planting-bias` at 132–139. The fourteen matches retain exact spans and the input hash. Domain interpretation belongs in the consumer lens. No consumer source was modified or copied into a generic test fixture.

This completes the code-link portion of L1-07. The full L1 gate, L5 classifications and actual consumer-runtime acceptance remain pending.
