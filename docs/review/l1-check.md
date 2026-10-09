# Finding gates and CLI check

This slice implements L1-10 under [issue #5](https://github.com/hyunlord/lattice/issues/5). Full L1 remains pending.

A finding may declare `"gate": {"metric": "count", "comparator": "gte", "threshold": 2}`. The metric names one of that finding's computed numeric metrics. Comparators are `eq`, `ne`, `gt`, `gte`, `lt`, and `lte`; thresholds must be finite numbers. Missing or nonnumeric metric evidence produces `unknown`, not a pass. Invalid gate configuration fails the build.

`lattice check --root <repository> [--lens <lens.json>]` builds the current inputs, persists the same graph consumed by export, prints each gate and a summary, and exits 0 for all passing gates, 1 for any failed or unknown gate, or 2 for invalid configuration/build errors. With no gates, it explicitly reports that findings are informational and exits 0. Severity alone does not enable a gate.

## Verification

The installed-package scenario creates a non-game service lens, checks two services against a count gate, edits the source to remove a service, removes metric evidence, and supplies an invalid threshold. It verifies exit codes 0/1/1/2 and persisted pass/fail/unknown statuses. This exercises the packed CLI rather than importing the evaluator directly. Existing type, format, 35-test and documentation checks remain in place; no boundary suite was added.

This command currently uses the full build path. Incremental builds, other lens rule families and full L1 acceptance remain separate pending requirements.
