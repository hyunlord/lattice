# Frozen L11 evaluation evidence

Read [the comparison and limitations](evaluation-report.md) first. The18 repositories and180 questions were fixed before implementation; this is an independent-agent proxy, not a human usability result.

The72 original answer and grading JSON files are preserved byte-for-byte and indexed by SHA256 in `verification.json`. The ledger retains coordinator timing; Click direct timing is self-report only. No failed availability case, trial or grade was dropped. Package/map identities and actual transport events bind the observations to the frozen candidate. No source checkout, generated map, cache or evidence archive is included.

Regenerate derived results from the repository root:

```sh
node docs/benchmarks/l11/evaluation/summarize.mjs
node docs/benchmarks/l11/evaluation/report.mjs
node docs/benchmarks/l11/evaluation/verify-results.mjs
```

These three scripts differ from the original local helpers only in resolving their paths relative to this directory. Verification timestamps change on rerun; answer and grade hashes must not. Absolute paths inside immutable original records identify the actual study environment, not required installation paths.
