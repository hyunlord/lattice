# ADR 0003: Preserve the prototype oracle without conflating source projections

Status: Accepted for L0 design; implementation pending.

## Context
The supplied prototype is the required content oracle, not the viewer design. Its baseline is bs-mobile `90c8ca34f9de6755afca01d28c8eff4f2eae20be`. At that same commit, base attack models and effective profile forms describe different things.

## Decision
Reproduce all requested counts and all eight finding narratives through the bs-mobile YAML lens. Preserve the prototype's four implementation-depth labels and classification precedence. Store source commit and exact input hashes with the reference fixture. Counts are computed from repository data; never embed the oracle totals in the generic engine.

Keep separately named facets for prototype implementation depth, profile participation, base-data attack model, effective profile form, and code support. The required four-form finding counts `growth.attackModel`; `firstPlayable.weapons.*.form` has ten values at the baseline. Show both with source links. Do not silently replace 4 with 10, and do not claim 4 is the executed combat-form count.

The prototype's `runtimeProjection` classification does not apply `runtimeOverrides`. Preserve that historical rule for reproducibility and add the effective override projection separately. Code links must identify executable handler branches/call sites, not a token in an enum, validator, comment, test or design note. Outcomes: supported (static evidence), unsupported (searched defined dispatch surface without handler), unknown (extraction insufficient). Neither supported nor profile-selected means executed in a real run.

Narratives about feel and economy are authored lens interpretations supplied by the user; pair them with computed evidence and label their basis. No automatic claim of runtime, playtest, fun, or complete design implementation follows from a source match.

## Alternatives
- Correct the oracle in place: rejected; violates the requested numerical contract.
- Assert the prototype's wording is observed execution: rejected; source evidence does not support that claim.

## Consequences
L5 must verify both numerical fidelity and honest provenance. A report that merely matches seven totals while losing the eight findings or their intent comparisons fails.
