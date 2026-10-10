# Source-bound agent interpretation

Lattice does not contain an LLM, model SDK, prompt inference, or API client. Its code graph is static evidence. AI interpretation is separately attributed text, never proof of runtime behavior.

`lattice init` installs the Claude `lattice` skill and Codex `lattice-init` skill with the same workflow:

1. Call `lattice_interpretation_context`, paginating `offset`/`limit`. Each module/folder target contains exact sources, hashes, excerpts, and existing note status. Read additional source when an excerpt is insufficient.
2. Call `lattice_write_interpretation` with `record: {schemaVersion: 1, targetId, summary, author, sources}`. Write one or two sentences based on the evidence. `author` identifies the actual agent/model. Copy the complete source path/hash/line set from context; the tool rejects stale or raced inputs.
3. Call `lattice_draft_lens` with `yaml`. The draft is validated but never activated. Existing drafts require their SHA-256 `expectedHash` to replace them. Review before promoting to the active lens.

For read-only source acceptance, set `LATTICE_INTERPRETATION_DIR` to an external directory; it contains `notes/` and draft files while evidence still refers to the source repository. This explicit process setting is not read from source configuration. Use the same environment for MCP, build, and export.

Notes are deterministic JSON files at `.lattice/notes/<sha256(targetId)>.json`. Evidence is repository-relative with SHA-256 and line; exported notes carry `AI 요약`, author, `fresh`/`stale`, and note path. Changed, removed, or newly added cluster members invalidate summaries. Notes participate in observation fingerprints even when ignored by Git. A draft has a `.lattice/lens.draft.sources.json` provenance sidecar. `readDraftStatus` and the MCP context mark changed-source or changed-draft provenance stale. The draft is an agent proposal, not automatic domain truth.

## Optional CI runner

Run an **explicit, trusted external command**, not a repository-provided command discovered automatically:

```sh
LATTICE_SUMMARY_KEY_ENV=SUMMARY_API_KEY lattice summarize --root . --json -- node /trusted/summarizer.mjs
```

CI supplies `SUMMARY_API_KEY` as a secret. If it is absent, Lattice skips the runner. Lattice never chooses a provider or sends network requests. The external runner owns API calls, model selection, retries, and credentials. An opt-in [external OpenAI runner and cached CI workflow](../../examples/ci/README.md) demonstrate this boundary; provider inference remains outside the core.

The command receives UTF-8 JSON on stdin: `{schemaVersion:1, targets:[{id,name,kind,sources:[{path,contentHash,line,...,text}]}]}`. Only missing/stale module and folder targets are sent; unchanged targets are omitted. For a changed cluster, all its current files are supplied because its meaning may depend on unchanged members. Stdout must be a JSON array with one interpretation record per target. Lattice validates target identities and current hashes before persisting. The process has a 120-second timeout and 8 MiB output cap. It uses argv without a shell. Child stderr is discarded and command failure output is suppressed to avoid credential leaks. The CLI does not commit or push notes; the caller's ordinary review policy applies.

Tests use an explicitly labeled fixture external runner, not an AI model: absent-key skip; first three target writes; no-op warm run; one module edit refreshes exactly that module and its folder (two targets). Source-edit stale status, race rejection, traversal refusal, note observation freshness, and inactive draft replacement are also tested. Actual agent-authored repository samples are a separate acceptance activity; fixture text is not represented as AI-generated evidence.

## L8 summary language

The viewer currently uses Korean. `lattice_interpretation_context` and the external-command request expose `summaryLanguage: "ko"`; managed Claude/Codex skills instruct the external author to use that language while preserving identifiers and source paths. The optional example runner follows the same language. Source quotations used as deterministic descriptions remain quotations, not translations or AI interpretations. No model or API is added to the Lattice engine.
