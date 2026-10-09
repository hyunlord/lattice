# Dependency decisions

## L1 graph foundation

- `typescript@5.9.3` is an exact-pinned **development-only** dependency for the user-requested strict TypeScript npm package. Its existing language-service formatter supplies format/check commands without another dependency. npm registry resolved this version; package-lock records integrity.
- Node 24 LTS and its built-in test/assert/crypto APIs drive tests and package verification. Core accepts an injected digest function and imports no Node modules, filesystem, clock or network API.
- No runtime dependencies. No YAML, MCP SDK, UI framework, or validator package has been adopted in this foundation. Their later need must be evaluated against the original format requirements; JSON-only support cannot stand in for YAML.
- `private: true` and `UNLICENSED` prevent accidental npm publication while [license decision #3](https://github.com/hyunlord/lattice/issues/3) is open. Local `npm pack` installation is a verification step, not publication.
