# L10 corrective diagnostics after fdebf5b

These are diagnostics on the working tree based on `fdebf5b`, not final-candidate acceptance. Earlier failed runs remain valid historical evidence. No threshold, frozen question, call sample or source denominator changed.

## Browser requests

The complete large export was exercised over HTTP at 1440 and 390 pixels. Selecting one record from a packed detail packet, and only the requested call direction, reduced desktop detail requests from 9,041 to 2,399 and diagnostic time from 14.12s to 4.33s. Flow requests remained 24,984 (previously 24,985), taking 43.43s in this diagnostic. Fourteen functional checkpoints passed; these numbers do not establish final first-display performance. A short metadata refresh may have overlapped the mobile diagnostic.

The remaining flow lookup bucket had 1,613 reference-backed keys. Finding a single function required decoding all those keys, even though the associated record paths were already literal strings. Inline keys therefore address lookup locality; simply projecting the requested value does not.

## Retained export failures

With the same current viewer, shared lookup keys exported 2,734,439 bytes for 110 supported source files. Scoped inline lookup keys exported 2,753,828 bytes, exceeding the unchanged 2,750,000-byte limit by 3,828 bytes. A broader all-object-key experiment also failed at 2,753,840 bytes. Neither result is a passing size measurement. A generic application-entry module reachability correction is being verified separately; no data or evidence may be dropped to meet the limit.

## Resident MCP preparation failure

The directory-witness diagnostic exhausted the default Node heap after approximately 71s, before its first response. Its p95 is unavailable, not zero or a pass. Source and generated fingerprints were unchanged. The separate source-only p95 of 847.823ms cannot substitute for this failed MCP run.

An external phase probe identified a clone-phase heap increase from approximately 2.743GB to 3.839GB. That probe completed, but its observation-options lifetime differed from the resident service, so it does not demonstrate recovery. The bounded correction under review transfers only a freshly parsed, privately owned storage draft into graph construction; the public API must retain defensive copying, and validation, hashes and freezing must remain equivalent. Final resident measurement is still required.

The owned-draft correction passed independent ownership, hash and storage regressions. Its actual resident retry nevertheless exhausted the default heap after 378.7s, again before any response. The changed core module legitimately changed the implementation fingerprint, invalidating extraction reuse; this attempt performed extraction work after snapshot reading. It is not an isolated cached A/B comparison, nor a passing MCP result. The failure is retained rather than concealed by a larger heap or relaxed freshness.

## Corrective candidate checks

The generic viewer archive traversal now includes only modules reachable from the application entry through static imports, re-exports and literal dynamic imports. Raw development/package modules remain available. With scoped inline lookup keys, the actual small export measured 2,748,309 bytes, leaving 1,691 bytes below its cap. Full integrated checks passed 690 tests, type checking, formatting, documentation and the frozen-corpus specialization guard; installed-package smoke also passed. Independent ownership, transport and archive reviews found no remaining correctness issue in their bounded scopes. These checks do not replace the pending complete-corpus performance and evaluation campaign.
