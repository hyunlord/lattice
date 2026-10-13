# L11 registration clarifications

## 2026-10-13: excerpt line endings

Registration commit `44f735a` preserves the original questions and answers. Source-review validation compares logical source lines: excerpts join those lines with LF and omit a terminal separator. Full-file SHA256 values always hash original bytes from the pinned Git blob.

A second byte-sensitive check found 21 excerpt differences, all in Dapper, caused solely by CRLF-to-LF normalization. Across all 566 references, there were no other differences; all original-file hashes and pinned Git objects matched. The original review's phrase "exact excerpts" did not state this normalization and was too broad. No oracle, question, score, or expected fact was changed. This clarification predates implementation evaluation.
