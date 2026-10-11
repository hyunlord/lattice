# L9 frozen-reference errata

The original questions, answers and freeze hashes remain unchanged. These corrections were found by the independent source-answer grader after the implementation candidate, before grading the map/MCP lane. Apply the same factual correction to both lanes; do not change the questions or scoring rubric.

## Runtime entrypoint overload

`extra-reference.json`, `runtime-q3`, describes the implementation-bearing `SendAsync` overload as having four parameters. At frozen commit `8630d8988107478d249e2fdb8162f8c7dcbd3dbb`, `src/libraries/System.Net.Http/src/System/Net/Http/HttpClient.cs:526` has three: request, completion option and cancellation token. The nested local `Core` function is a separate callable. An answer correctly identifying the three-parameter overload must not lose credit.

## HTTPX purpose citation

`extra-reference.json`, `httpx-q1`, cites `README.md:13–15`, whose embedded excerpt contains closing HTML tags rather than the purpose statement. This is a citation defect, not a change to the expected repository purpose. Use the other frozen source evidence when grading the purpose answer; the defective excerpt supplies no evidence credit.
