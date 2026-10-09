# Platform contracts checked 2026-10-10

Primary documentation only; no Graft source copied. These are implementation constraints, not completed integrations.

- [Node release table](https://nodejs.org/en/about/previous-releases): Node 24 is LTS; use 24 in CI. Local shell currently reports 25.8.2, so local results on that interpreter must be labeled and Node 24 validation added at L1.
- [MCP 2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): explicit tool input schemas, object structured output, text compatibility and optional resource links. Select an actually client-supported protocol revision at L3; no unverified latest-version claim.
- [MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports): reserve stdout for JSON-RPC, diagnostics on stderr. Freshness fingerprints are Lattice's application contract, not a protocol guarantee.
- [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages): Actions publishing source, Pages artifact, deployment environment, `pages: write` and `id-token: write`; report actual deployment URL.
- [Artifact outputs](https://github.com/actions/upload-artifact#outputs): artifact links are downloads with authentication/retention limits, not public sites. Publish a fallback artifact independently of Pages availability.
- [Issue comments API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment): PR summary uses issue comments; write permission is needed. Fork jobs cannot be assumed to have it.
- [Actions security](https://docs.github.com/en/actions/reference/security/secure-use): pin dependencies by verified commit SHA, minimize token permissions, and never execute untrusted PR code in a privileged context.
- Installed Graft README (`/opt/homebrew/lib/node_modules/@nanonets/graft/README.md`, lines 190/199/508) names `graft/.graph/wiring.json` but does not define its JSON schema. A real sample/schema and compatibility fixture remain prerequisites to importer implementation. Local README observation is not a claim about every upstream version.
