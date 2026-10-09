# Charter & Kin: read-only source lens

This minimal lens selects tracked `src/**/*.ts` / `src/**/*.tsx` modules and
`public/assets/world_asset_manifest.json#/acceptedReferences/*`. Module imports
are static dependencies. Import counts include external imports; a descriptive
finding selects modules with at least ten declarations. No finding is a gate.
The accepted-reference kind preserves the manifest's authored key, path, hash,
width and height. The map reports the manifest claim, not independent image
acceptance or runtime asset use.

Use an external clone and an external cache so no generated files or lens enter
Charter & Kin. No commit or push to that repository is needed or authorized.

```sh
lattice build --root /path/to/external/clone --lens /path/to/lattice/examples/feudal-lord-simulator/lens.yaml --cache-dir /tmp/ck-lattice-cache
lattice check --root /path/to/external/clone --lens /path/to/lattice/examples/feudal-lord-simulator/lens.yaml --cache-dir /tmp/ck-lattice-cache
lattice diff 5b33a649c9c4cc20551a9ee28f107286d0948208 --root /path/to/external/clone --lens /path/to/lattice/examples/feudal-lord-simulator/lens.yaml --cache-dir /tmp/ck-lattice-cache
lattice export /tmp/ck-lattice-site --root /path/to/external/clone --cache-dir /tmp/ck-lattice-cache
```

For observed history, build the baseline commit and then the head commit into the
same cache before export. The baseline is before onboarding and motion changes;
the head is `251f397eb6646b81fd1dda0597255ee474806b49`, verified as remote main
on 2026-10-10. Its original commit date is 2026-08-10. Both builds use the same
lens, and retain revision-pinned GitHub source links. A current lens applied to a
historical commit is not evidence that this lens existed in that commit.

The CSS import in `src/main.tsx` is outside this lens's selected module coverage. Its unresolved-reference finding does not mean the stylesheet is missing from the repository. The original specifier and source line remain available.
