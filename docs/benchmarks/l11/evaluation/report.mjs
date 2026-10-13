import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, '');
const summary = JSON.parse(fs.readFileSync(`${root}/summary.json`, 'utf8'));
const rows = JSON.parse(fs.readFileSync(`${root}/results.json`, 'utf8'));
const format = value => value == null ? 'pending' : value.toFixed(1);
const time = row => row.secondsLower == null ? row.selfReportedOnlySeconds == null ? 'pending' : `${row.selfReportedOnlySeconds} self-report only` : `${format(row.secondsLower)}–${format(row.secondsUpper)}`;
const repositories = [...new Set(rows.map(row => row.repository))];
const table = repositories.map(id => {
  const direct = rows.find(row => row.repository === id && row.arm === 'direct');
  const map = rows.find(row => row.repository === id && row.arm === 'map');
  return `| ${id} | ${direct.score ?? 'pending'}/20 | ${map.score ?? 'pending'}/20 | ${time(direct)} | ${time(map)} | ${map.mapExportAvailability} |`;
}).join('\n');
const supplemental = summary.supplementalSelfReportSubstitution;
const referenceIssues = rows.flatMap(row => JSON.parse(row.referenceIssues ?? '[]').map(issue => `- ${row.arm}/${row.repository}: ${typeof issue === 'string' ? issue : JSON.stringify(issue)}`));
const complete = summary.totals.direct.graded === 18 && summary.totals.map.graded === 18;
const interpretation = complete ? `The map arm scored ${summary.totals.map.score - summary.totals.direct.score} points relative to direct GitHub (${(summary.totals.map.score / 360 * 100).toFixed(2)}% versus ${(summary.totals.direct.score / 360 * 100).toFixed(2)}%). The frozen accuracy threshold was not relaxed. ${summary.accuracyGate === 'fail' ? 'The accuracy gate failed.' : 'The accuracy gate passed.'} ${supplemental?.ratioLower > 0.5 ? 'The supplemental timing bounds also miss the 50% target across the entire interval.' : 'Consult the timing bounds below; missing Click coordinator timing prevents a strict primary aggregate verdict.'} These observations do not support declaring the combined usability goal achieved. They apply to the frozen candidate and this single agent trial per cell; later release fixes are outside this study.` : 'Final interpretation remains pending all independent grades.';
const report = `# L11 frozen-candidate evaluation

Status: ${summary.totals.direct.completed + summary.totals.map.completed}/36 trials persisted; ${summary.totals.direct.graded + summary.totals.map.graded}/36 independently graded. Accuracy gate: **${summary.accuracyGate}**. Primary aggregate time gate: **${summary.primaryTimeGate}**.

Candidate analysis: **2b7c00f**; frozen registration: **44f735a**. Later release fixes were not applied to these exports or answers. Each arm has a maximum 360 points. Direct score: **${summary.totals.direct.score}/360**; map score: **${summary.totals.map.score}/360**.

${interpretation}

| Repository | Direct score | Map score | Direct seconds | Map seconds | Map export |
| --- | ---: | ---: | --- | --- | --- |
${table}

Timing values are host-monotonic delivery-to-answer-persistence bounds. Lower/upper endpoints bracket dispatch uncertainty; waits and real tool queries are included. The original Click direct trial lacks coordinator timing and retains its 300-second self-report. It was neither replaced nor dropped. Thus the strict preregistered 18-repository primary time aggregate cannot be established.

${supplemental ? `Supplemental 18-repository aggregate, substituting Click's unverified 300-second self-report: direct ${format(supplemental.directLower)}–${format(supplemental.directUpper)}s; map ${format(supplemental.mapLower)}–${format(supplemental.mapUpper)}s; map/direct ratio ${supplemental.ratioLower.toFixed(3)}–${supplemental.ratioUpper.toFixed(3)}. This is not an authoritative primary timing result.` : 'Supplemental full-cohort timing is pending completion.'}

Coordinator-only paired subset: ${summary.coordinatorPairedSubset.count} repositories; direct ${format(summary.coordinatorPairedSubset.directLower)}–${format(summary.coordinatorPairedSubset.directUpper)}s; map ${format(summary.coordinatorPairedSubset.mapLower)}–${format(summary.coordinatorPairedSubset.mapUpper)}s; map/direct ratio ${summary.coordinatorPairedSubset.ratioLower?.toFixed(3) ?? 'pending'}–${summary.coordinatorPairedSubset.ratioUpper?.toFixed(3) ?? 'pending'}. This subset does not replace the full cohort or change its 50% threshold.

## Conditions and limitations

- Eighteen pinned public repositories, identical ten frozen questions per repository, rotated within-repository arm order, one fresh context per cell, 600-second task cap, no retakes. This is an agent evaluation, not a human usability study.
- Evaluators inherited the session default model and reasoning. Authoritative exact model/reasoning metadata and token telemetry were unavailable; no token estimates were invented.
- Both arms used pinned public GitHub web tree/blob/raw access. Direct evaluators could not read local sources or maps. Map evaluators additionally accessed actual exported maps and a bounded read-only wrapper around real stdio MCP. Whole-agent access restrictions were instructional; wrapper restrictions were enforced in transport.
- Seventeen complete maps were prepared outside timed tasks. Cold setup and MCP prewarm logs are retained separately. At most two prepared MCP sessions and active map trials were permitted; coordinator policy prohibited eviction during active trials.
- Historical session-close requests were not written to the transport event log. The coordinator reports closing sessions only after each trial; independent logs can verify active trial intervals and prewarm/query events, but cannot independently reconstruct every close or eviction. Final infrastructure termination is recorded separately.
- Runtime's full export failed at the original 20-minute startup deadline. Its single bounded MCP preparation attempt failed after 10.751 seconds using the interrupted startup cache. The Runtime map trial retained the real partial screenshot and public-source fallback. This availability failure remains in the cohort; it does not prove that every clean Runtime invocation fails.
- Early MCP sessions used shared-worktree code before the later semantic link repair, with export graph hashes matched. Subsequent sessions used the exact original installed 2b7c00f package, verified against 365 recorded file hashes. Later permalink repairs were not used to retake answers.
- First four newly coordinated direct trials received inline prompts; later trials read a prepared prompt file, consuming task time. Exact question text remained frozen.
- Independent fresh graders received only assigned fixed answers, frozen questions/references, and pinned sources. They did not receive timings, target attainment, product implementation or other grades. Citation-line drift, partial answers and tool errors remain recorded in per-cell grades and answers.
- GitDiagram: N/A because equivalent pinned-revision access was not verified. No paid competitor calls were made.

## Reference issues retained

${referenceIssues.length ? referenceIssues.join('\n') : 'No reference issues reported in grades completed so far.'}

## Evidence

Machine-readable results: results.csv and results.json. Aggregate bounds: summary.json. Trial dispatch/persistence and answer hashes: ledger.json. Frozen contract and schedule: manifest.json. Actual MCP/preparation calls: transport-events.jsonl. Export/source identities: exports/. Original answer artifacts: direct-*.json and map-*.json. Independent scoring: grades/. Package identity: frozen-package-verification.json. Detailed conditions: OPERATIONS.md.

Independent integrity audit: independent-audit.json. It found no arithmetic, hash, identity or CSV/JSON discrepancies across the 36 trials and grades, four frozen contract hashes, 365 installed package files and 17 export graph identities. It verified a maximum of two overlapping timed map trials and no transport restart during a map trial. The Click timing/order and historical session-close logging limitations remain explicit. Infrastructure shutdown is recorded in infrastructure-shutdown.json; minimal integration guidance is in MINIMAL-EVIDENCE.md.
`;
fs.writeFileSync(`${root}/evaluation-report.md`, report);
console.log(`${root}/evaluation-report.md`);
